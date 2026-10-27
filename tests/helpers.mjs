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
    const url = `${server.url.replace('http', 'ws')}/ws/${code}`;
    this.ws = new WebSocket(url, { headers: { origin: origin ?? server.url } });
    this.closed = new Promise((r) => this.ws.addEventListener('close', (e) => r(e)));
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (e) => {
      this.raw.push(e.data);
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
  /** Sends and waits for the next state (or an error). */
  async act(obj) {
    const n = this.messages.length;
    this.send(obj);
    return this.wait((m) => (m.t === 'state' || m.t === 'err') && this.messages.indexOf(m) >= n);
  }
  async join({ sit = true } = {}) {
    await this.opened;
    this.send({ t: 'hello', secret: this.secret, nick: this.nick });
    const w = await this.wait((m) => m.t === 'welcome');
    this.pid = w.pid;
    await this.wait((m) => m.t === 'state');
    if (sit) await this.act({ t: 'sit' });
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
