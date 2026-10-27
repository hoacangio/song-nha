// WebSocket with hello-on-open, exponential backoff reconnect and heartbeat.
export class TableSocket {
  constructor(code, { secret, nick, onMessage, onStatus }) {
    this.code = code;
    this.secret = secret;
    this.nick = nick;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.attempt = 0;
    this.stopped = false;
    this.ws = null;
    this.connect();
  }

  connect() {
    if (this.stopped) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/${encodeURIComponent(this.code)}`);
    this.ws = ws;
    this.onStatus?.('connecting');
    ws.onopen = () => {
      this.attempt = 0;
      ws.send(JSON.stringify({ t: 'hello', secret: this.secret, nick: this.nick }));
      this.onStatus?.('open');
      clearInterval(this.beat);
      this.beat = setInterval(() => this.send({ t: 'ping' }), 25_000);
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onMessage?.(m);
    };
    ws.onclose = (e) => {
      clearInterval(this.beat);
      if (this.stopped) return;
      if (e.code === 4404) {
        this.stopped = true;
        this.onStatus?.('gone');
        return;
      }
      this.onStatus?.('reconnecting');
      const delay = Math.min(10_000, 400 * 2 ** this.attempt++) * (0.7 + Math.random() * 0.6);
      this.retry = setTimeout(() => this.connect(), delay);
    };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.beat);
    try {
      this.ws?.close(1000);
    } catch {}
  }
}
