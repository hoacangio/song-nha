// Test helpers: in-process local server + a small WebSocket client that records every message.
import { randomUUID } from 'node:crypto';
import { startServer } from '../scripts/local-server.mjs';

export { startServer };

export async function createTable(server, { secret = randomUUID(), game = 'xidach', options = {}, origin } = {}) {
  const r = await fetch(`${server.url}/api/tables`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: origin ?? server.url },
    body: JSON.stringify({ secret, game, options }),
  });
  return { status: r.status, body: await r.json(), secret };
}

export class Client {
  constructor(server, code, { secret = randomUUID(), nick = 'P', origin } = {}) {
    this.secret = secret;
    this.nick = nick;
    this.messages = [];
    this.raw = [];
    this.waiters = [];
    this.heartbeats = 0;
    const url = `${server.url.replace('http', 'ws')}/ws/${code}`;
    this.ws = new WebSocket(url, { headers: origin === '' ? {} : { origin: origin ?? server.url } });
    this.closed = new Promise((r) => this.ws.addEventListener('close', (e) => r(e)));
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.opened.catch(() => {});
    this.ws.addEventListener('message', (e) => {
      this.raw.push(e.data);
      if (e.data === 'hb!') return void this.heartbeats++;
      const m = JSON.parse(e.data);
      this.messages.push(m);
      if (m.t === 'state') this.state = m;
      this.waiters = this.waiters.filter((w) => !(w.pred(m) && (w.resolve(m), true)));
    });
  }
  send(obj) {
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }
  wait(pred, ms = 3000) {
    const found = this.messages.find((m) => pred(m) && !m.__seen);
    if (found) {
      found.__seen = true;
      return Promise.resolve(found);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting (${this.nick})`)), ms);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          m.__seen = true;
          resolve(m);
        },
      });
    });
  }
  /**
   * Sends a message, then a ping. The table processes messages in order, so every reply to
   * `obj` arrives before the pong. Returns { err, state } for that window.
   */
  async exchange(obj) {
    await this.throttle(2);
    const n = this.messages.length;
    this.send(obj);
    this.send({ t: 'ping' });
    await this.wait((m) => m.t === 'pong' && this.messages.indexOf(m) >= n);
    const window = this.messages.slice(n);
    const err = window.find((m) => m.t === 'err');
    return { err: err ? err.code : null, state: this.state };
  }
  /** Mirrors the server's token bucket (slightly stricter) so tests never trip the rate limit by accident. */
  async throttle(cost) {
    const cap = 16;
    const rate = 7;
    this.bucket ||= { tokens: cap, at: Date.now() };
    for (;;) {
      const now = Date.now();
      this.bucket.tokens = Math.min(cap, this.bucket.tokens + ((now - this.bucket.at) / 1000) * rate);
      this.bucket.at = now;
      if (this.bucket.tokens >= cost) {
        this.bucket.tokens -= cost;
        return;
      }
      await sleep(Math.ceil(((cost - this.bucket.tokens) / rate) * 1000));
    }
  }
  /** Sends and returns the resulting state (throws on an error reply). */
  async act(obj) {
    const r = await this.exchange(obj);
    if (r.err) throw new Error(`${this.nick}: ${JSON.stringify(obj)} → ${r.err}`);
    return r.state;
  }
  /** Waits until all earlier broadcasts to this socket have arrived. */
  async sync() {
    await this.exchange({ t: 'ping' });
    return this.state;
  }
  async join({ sit = true } = {}) {
    await this.opened;
    this.send({ t: 'hello', secret: this.secret, nick: this.nick });
    const w = await this.wait((m) => m.t === 'welcome');
    this.pid = w.pid;
    await this.wait((m) => m.t === 'state');
    if (sit) await this.act({ t: 'sit' });
    else await this.sync();
    return this;
  }
  get seat() {
    return this.state?.you.seat;
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
