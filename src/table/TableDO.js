// One Durable Object per table: an actor that serializes every event, keeps the table in
// DO storage, and talks to players over hibernatable WebSockets.
import {
  createTable,
  onJoin,
  onLeave,
  handle,
  tick,
  nextWake,
  isExpired,
  snapshot,
  pidFor,
  hostKeyFor,
  MAX_SOCKETS,
} from './core.js';
import { parseMessage, ProtocolError, isSecret, cleanNick, takeToken } from '../lib/protocol.js';
import { GameError } from '../games/common.js';
import { isGame } from '../games/index.js';
import { json } from '../lib/http.js';

const RATE = { capacity: 20, rate: 8 };
export const HEARTBEAT = 'hb';
export const HEARTBEAT_REPLY = 'hb!';
const MAX_STRIKES = 40;

export class TableDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.t = undefined;
    this.queue = Promise.resolve();
    this.buckets = new Map();
    // Client heartbeats are answered by the runtime without waking (or billing) the object.
    if (typeof WebSocketRequestResponsePair === 'function' && ctx.setWebSocketAutoResponse) {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT, HEARTBEAT_REPLY));
    }
  }

  /** Serializes all work on this table (crypto awaits would otherwise let events interleave). */
  run(fn) {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  async load() {
    if (this.t === undefined) this.t = (await this.ctx.storage.get('table')) ?? null;
    return this.t;
  }

  async persist() {
    await this.ctx.storage.put('table', this.t);
    await this.ctx.storage.setAlarm(nextWake(this.t));
  }

  sockets() {
    return this.ctx.getWebSockets();
  }

  connectedPids() {
    const set = new Set();
    for (const ws of this.sockets()) {
      const a = safeAttachment(ws);
      if (a.pid) set.add(a.pid);
    }
    return set;
  }

  /**
   * Keeps the lobby in sync. Only sends when something the lobby cares about changed
   * (public flag, seats taken, humans online), so it costs almost nothing.
   */
  syncLobby(connected) {
    const t = this.t;
    if (!t || !this.env.LOBBY) return;
    const taken = t.seats.filter(Boolean).length;
    const online = t.seats.filter((s) => s && !s.bot && connected.has(s.pid)).length;
    const pub = !!t.opts.public;
    const key = pub ? `1|${t.game}|${t.seats.length}|${taken}|${online}` : '0';
    const prev = this.lobbyKey;
    if (key === prev) return;
    this.lobbyKey = key;
    // A private table only needs a "remove" when it was public a moment ago.
    if (!pub && !(prev && prev !== '0')) return;
    const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
    const body = pub
      ? { code: t.code, game: t.game, seats: t.seats.length, taken, online }
      : { code: t.code };
    stub
      .fetch(`https://lobby/${pub ? 'upsert' : 'remove'}`, { method: 'POST', body: JSON.stringify(body) })
      .catch((e) => console.error('lobby sync failed', e));
  }

  broadcast() {
    if (!this.t) return;
    const now = Date.now();
    const connected = this.connectedPids();
    this.syncLobby(connected);
    for (const ws of this.sockets()) {
      const a = safeAttachment(ws);
      if (!a.pid) continue;
      send(ws, snapshot(this.t, { pid: a.pid, isHost: a.isHost, connected }, now));
    }
  }

  fetch(request) {
    return this.run(() => this.onFetch(request));
  }

  async onFetch(request) {
    const url = new URL(request.url);
    const t = await this.load();
    if (url.pathname === '/init' && request.method === 'POST') {
      if (t) return json({ error: 'exists' }, 409);
      const body = await request.json();
      if (!isGame(body.game)) return json({ error: 'bad_game' }, 400);
      this.t = createTable({ code: body.code, game: body.game, options: body.options, hostKey: body.hostKey, now: Date.now() });
      await this.persist();
      return json({ code: this.t.code }, 201);
    }
    if (!t) return json({ error: 'not_found' }, 404);
    if (url.pathname === '/info') {
      return json({ code: t.code, game: t.game, seats: t.seats.length, taken: t.seats.filter(Boolean).length });
    }
    if (url.pathname === '/delete' && request.method === 'POST') {
      const body = await request.json();
      if (!isSecret(body.secret) || (await hostKeyFor(body.secret)) !== t.hostKey) return json({ error: 'forbidden' }, 403);
      await this.destroy();
      return json({ ok: true });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected_websocket' }, 426);
      if (this.sockets().length >= MAX_SOCKETS) return json({ error: 'table_busy' }, 503);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ pid: null, isHost: false, nick: '' });
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'not_found' }, 404);
  }

  webSocketMessage(ws, data) {
    return this.run(() => this.onMessage(ws, data));
  }

  async onMessage(ws, data) {
    const now = Date.now();
    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, (bucket = { tokens: RATE.capacity, at: now, strikes: 0 }));
    if (!takeToken(bucket, now, RATE)) {
      bucket.strikes += 1;
      if (bucket.strikes > MAX_STRIKES) return ws.close(1008, 'rate');
      return send(ws, { t: 'err', code: 'rate_limited' });
    }
    let msg;
    try {
      msg = parseMessage(typeof data === 'string' ? data : null);
    } catch (e) {
      if (e instanceof ProtocolError && e.code === 'too_large') {
        send(ws, { t: 'err', code: e.code });
        return ws.close(1009, 'too_large');
      }
      return send(ws, { t: 'err', code: e instanceof ProtocolError ? e.code : 'bad_frame' });
    }
    const t = await this.load();
    if (!t) return ws.close(4404, 'gone');
    const att = safeAttachment(ws);
    if (msg.t === 'ping') return send(ws, { t: 'pong', now });

    if (msg.t === 'hello') {
      if (att.pid) return send(ws, { t: 'err', code: 'already_hello' });
      if (!isSecret(msg.secret)) return send(ws, { t: 'err', code: 'bad_secret' });
      const nick = cleanNick(msg.nick) || 'Guest';
      const pid = await pidFor(t.salt, msg.secret);
      const isHost = (await hostKeyFor(msg.secret)) === t.hostKey;
      ws.serializeAttachment({ pid, isHost, nick });
      onJoin(t, { pid, nick, isHost });
      await tick(t, now);
      await this.persist();
      send(ws, { t: 'welcome', pid, isHost });
      return this.broadcast();
    }
    if (!att.pid) return send(ws, { t: 'err', code: 'hello_first' });

    try {
      const res = await handle(t, { pid: att.pid, isHost: att.isHost, nick: att.nick }, msg, now);
      if (res.deleted) return this.destroy();
      if (res.reply) return send(ws, res.reply);
      await tick(t, now);
      await this.persist();
      this.broadcast();
    } catch (e) {
      if (e instanceof GameError) return send(ws, { t: 'err', code: e.code });
      console.error('table error', e);
      send(ws, { t: 'err', code: 'server_error' });
    }
  }

  webSocketClose(ws) {
    return this.run(() => this.onClose(ws));
  }

  webSocketError(ws) {
    return this.run(() => this.onClose(ws));
  }

  async onClose(ws) {
    this.buckets.delete(ws);
    const t = await this.load();
    if (!t) return;
    const att = safeAttachment(ws);
    if (!att.pid) return;
    const stillHere = this.sockets().some((s) => s !== ws && s.readyState === 1 && safeAttachment(s).pid === att.pid);
    if (!stillHere) {
      onLeave(t, att.pid, Date.now());
      await this.persist();
      this.broadcast();
    }
  }

  alarm() {
    return this.run(() => this.onAlarm());
  }

  async onAlarm() {
    const t = await this.load();
    if (!t) return;
    const now = Date.now();
    if (isExpired(t, now)) return this.destroy();
    const changed = await tick(t, now);
    await this.persist();
    if (changed) this.broadcast();
  }

  async destroy() {
    const t = this.t;
    if (t && this.env.LOBBY) {
      try {
        await this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby')).fetch('https://lobby/remove', {
          method: 'POST',
          body: JSON.stringify({ code: t.code }),
        });
      } catch (e) {
        console.error('lobby remove failed', e);
      }
    }
    if (t) {
      try {
        const host = this.env.HOST.get(this.env.HOST.idFromName(`host:${t.hostKey}`));
        await host.fetch('https://host/release', { method: 'POST', body: JSON.stringify({ code: t.code }) });
      } catch (e) {
        console.error('host release failed', e);
      }
    }
    for (const ws of this.sockets()) {
      send(ws, { t: 'deleted' });
      try {
        ws.close(4404, 'deleted');
      } catch {}
    }
    this.t = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

function safeAttachment(ws) {
  try {
    return ws.deserializeAttachment() || {};
  } catch {
    return {};
  }
}

function send(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {}
}
