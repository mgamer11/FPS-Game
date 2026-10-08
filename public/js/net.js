// WebSocket connection to the game server.
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Set();
    this.ready = null;
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return this.ready;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Could not connect to the game server.'));
    });
    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      for (const h of this.handlers) h(msg);
    };
    this.ws.onclose = () => {
      for (const h of this.handlers) h({ t: 'disconnected' });
    };
    return this.ready;
  }

  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}
