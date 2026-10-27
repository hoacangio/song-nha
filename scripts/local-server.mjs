#!/usr/bin/env node
// Offline dev server: runs the real Worker + Durable Object classes on Node 22 with an
// in-memory Durable Object emulation and a dependency-free WebSocket server.
//   node scripts/local-server.mjs [--port 8787]
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

// ---------- Runtime polyfills (Response 101 + WebSocketPair) ----------
const NativeResponse = globalThis.Response;
class WorkerResponse extends NativeResponse {
  constructor(body, init = {}) {
    if (init && init.status === 101) {
      super(null, { status: 200 });
      this.upgradeSocket = init.webSocket;
    } else super(body, init);
  }
}
globalThis.Response = WorkerResponse;

class EmuSocket {
  constructor() {
    this.readyState = 1;
    this.peer = null;
    this.attachment = null;
    this.onSend = null; // set for the server end: writes to the real TCP socket
    this.onClose = null;
  }
  send(data) {
    if (this.readyState !== 1) throw new Error('socket closed');
    this.onSend?.(data);
  }
  close(code = 1000, reason = '') {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.onClose?.(code, reason);
  }
  serializeAttachment(v) {
    this.attachment = structuredClone(v);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
}
globalThis.WebSocketPair = class {
  constructor() {
    const client = new EmuSocket();
    const server = new EmuSocket();
    client.peer = server;
    server.peer = client;
    this[0] = client;
    this[1] = server;
  }
};

// ---------- Clock (tests can advance time) ----------
let clockOffset = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + clockOffset;

// ---------- Durable Object emulation ----------
class EmuStorage {
  constructor(owner) {
    this.map = new Map();
    this.owner = owner;
    this.alarmAt = null;
    this.timer = null;
  }
  async get(k) {
    return this.map.has(k) ? structuredClone(this.map.get(k)) : undefined;
  }
  async put(k, v) {
    this.map.set(k, structuredClone(v));
  }
  async delete(k) {
    return this.map.delete(k);
  }
  async deleteAll() {
    this.map.clear();
  }
  async getAlarm() {
    return this.alarmAt;
  }
  async setAlarm(t) {
    this.alarmAt = Number(t);
    this.arm();
  }
  async deleteAlarm() {
    this.alarmAt = null;
    clearTimeout(this.timer);
  }
  arm() {
    clearTimeout(this.timer);
    if (this.alarmAt == null) return;
    const delay = Math.max(0, Math.min(this.alarmAt - Date.now(), 2 ** 31 - 1));
    this.timer = setTimeout(() => this.fire(), delay);
    this.timer.unref?.();
  }
  async fire() {
    if (this.alarmAt == null || this.alarmAt > Date.now()) return this.arm();
    this.alarmAt = null;
    await this.owner.instance.alarm?.();
  }
}

class EmuState {
  constructor(owner) {
    this.storage = new EmuStorage(owner);
    this.sockets = new Set();
  }
  acceptWebSocket(ws) {
    this.sockets.add(ws);
  }
  getWebSockets() {
    return [...this.sockets].filter((s) => s.readyState === 1);
  }
}

class EmuNamespace {
  constructor(Cls, env) {
    this.Cls = Cls;
    this.env = env;
    this.objects = new Map();
  }
  idFromName(name) {
    return { name, toString: () => name };
  }
  get(id) {
    let entry = this.objects.get(id.name);
    if (!entry) {
      entry = {};
      entry.state = new EmuState(entry);
      entry.instance = new this.Cls(entry.state, this.env);
      this.objects.set(id.name, entry);
    }
    return {
      fetch: (input, init) => entry.instance.fetch(input instanceof Request ? input : new Request(input, init)),
      _entry: entry,
    };
  }
}

// ---------- Static assets (+ _headers) ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function parseHeadersFile() {
  try {
    const text = await readFile(path.join(PUBLIC, '_headers'), 'utf8');
    const rules = [];
    let cur = null;
    for (const line of text.split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (!/^\s/.test(line)) rules.push((cur = { pattern: line.trim(), headers: [] }));
      else if (cur) {
        const i = line.indexOf(':');
        cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
      }
    }
    return rules;
  } catch {
    return [];
  }
}

function matchRule(pattern, p) {
  if (pattern.endsWith('*')) return p.startsWith(pattern.slice(0, -1));
  return p === pattern;
}

function makeAssets(rules) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let p = decodeURIComponent(url.pathname);
      if (p.endsWith('/')) p += 'index.html';
      let file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(PUBLIC) || path.basename(file) === '_headers') file = null;
      let body;
      try {
        if (!file || !(await stat(file)).isFile()) throw new Error('nf');
        body = await readFile(file);
      } catch {
        file = path.join(PUBLIC, 'index.html'); // single-page-application fallback
        body = await readFile(file);
        p = '/index.html';
      }
      const headers = new Headers({ 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      for (const r of rules) if (matchRule(r.pattern, url.pathname)) for (const [k, v] of r.headers) headers.set(k, v);
      return new NativeResponse(body, { status: 200, headers });
    },
  };
}

// ---------- Minimal RFC 6455 server side ----------
const MAX_FRAME = 64 * 1024;

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

function attachSocket(sock, serverEnd, instance) {
  let buf = Buffer.alloc(0);
  let fragments = null;
  let fragOpcode = 0;
  let closed = false;
  const finish = (code, reason) => {
    if (closed) return;
    closed = true;
    serverEnd.readyState = 3;
    Promise.resolve(instance.webSocketClose?.(serverEnd, code, reason, true)).catch(() => {});
  };
  serverEnd.onSend = (data) => {
    const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    if (!sock.destroyed) sock.write(encodeFrame(typeof data === 'string' ? 1 : 2, payload));
  };
  serverEnd.onClose = (code, reason) => {
    const p = Buffer.alloc(2 + Buffer.byteLength(reason || ''));
    p.writeUInt16BE(code || 1000, 0);
    p.write(reason || '', 2);
    if (!sock.destroyed) sock.end(encodeFrame(8, p));
    finish(code, reason);
  };
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > MAX_FRAME || !masked) {
        serverEnd.close(1009, 'frame');
        sock.destroy();
        return;
      }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (opcode === 8) {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        if (!sock.destroyed) sock.end(encodeFrame(8, payload.subarray(0, 2)));
        finish(code, payload.subarray(2).toString());
        return;
      }
      if (opcode === 9) {
        sock.write(encodeFrame(10, payload));
        continue;
      }
      if (opcode === 10) continue;
      if (opcode === 0) {
        if (!fragments) continue;
        fragments.push(payload);
      } else {
        fragments = [payload];
        fragOpcode = opcode;
      }
      if (!fin) {
        if (fragments.reduce((s, b) => s + b.length, 0) > MAX_FRAME) {
          serverEnd.close(1009, 'frame');
          return;
        }
        continue;
      }
      const whole = Buffer.concat(fragments);
      fragments = null;
      const data = fragOpcode === 1 ? whole.toString('utf8') : whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.length);
      if (serverEnd.readyState === 1) Promise.resolve(instance.webSocketMessage?.(serverEnd, data)).catch((e) => console.error(e));
    }
  });
  sock.on('close', () => finish(1006, ''));
  sock.on('error', () => finish(1006, ''));
}

// ---------- Server ----------
export async function startServer({ port = 8787, host = '127.0.0.1', quiet = false, env: extraEnv = {} } = {}) {
  const worker = (await import(pathToFileURL(path.join(ROOT, 'src/worker.js')).href)).default;
  const { TableDO, HostDO } = await import(pathToFileURL(path.join(ROOT, 'src/worker.js')).href);
  const env = { ALLOWED_ORIGINS: '', ...extraEnv };
  env.TABLE = new EmuNamespace(TableDO, env);
  env.HOST = new EmuNamespace(HostDO, env);
  env.ASSETS = makeAssets(await parseHeadersFile());

  const toRequest = async (req, base) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      init.body = Buffer.concat(chunks);
    }
    return new Request(new URL(req.url, base), init);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const base = `http://${req.headers.host || `${host}:${port}`}`;
      const response = await worker.fetch(await toRequest(req, base), env, {});
      const headers = {};
      response.headers.forEach((v, k) => (headers[k] = v));
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('error');
    }
  });

  server.on('upgrade', async (req, sock) => {
    try {
      const base = `http://${req.headers.host || `${host}:${port}`}`;
      const response = await worker.fetch(await toRequest(req, base), env, {});
      const client = response.upgradeSocket;
      if (!client) {
        sock.end(`HTTP/1.1 ${response.status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        return;
      }
      const key = req.headers['sec-websocket-key'];
      const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      sock.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      const serverEnd = client.peer;
      const code = decodeURIComponent(new URL(req.url, base).pathname.slice(4)).toUpperCase();
      const entry = env.TABLE.get(env.TABLE.idFromName(`table:${code}`))._entry;
      attachSocket(sock, serverEnd, entry.instance);
    } catch (e) {
      console.error(e);
      sock.destroy();
    }
  });

  await new Promise((r) => server.listen(port, host, r));
  const actual = server.address().port;
  if (!quiet) console.log(`Sòng Nhà local server on http://${host}:${actual}`);

  const allStorages = () =>
    [env.TABLE, env.HOST].flatMap((ns) => [...ns.objects.values()].map((e) => e.state.storage));
  return {
    port: actual,
    url: `http://${host}:${actual}`,
    env,
    /** Moves the clock forward and fires any alarms that became due. */
    async advance(ms) {
      clockOffset += ms;
      for (const s of allStorages()) if (s.alarmAt != null && s.alarmAt <= Date.now()) await s.fire();
    },
    close: () =>
      new Promise((r) => {
        for (const s of allStorages()) clearTimeout(s.timer);
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--port');
  const port = Number(i > 0 ? process.argv[i + 1] : process.env.PORT || 8787);
  const host = process.env.HOST || '127.0.0.1';
  startServer({ port, host });
}
