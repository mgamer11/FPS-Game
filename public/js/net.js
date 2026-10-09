// Browser-to-browser networking (WebRTC via PeerJS).
// The room creator's browser runs the RoomHost; everyone else connects to it directly.
// A free public "matchmaking" server (PeerJS cloud) is only used to find each other:
// the room code is the host's address there, so codes can never clash.
import { Peer } from 'peerjs';
import { RoomHost, makeCode } from './roomhost.js';

const ID_PREFIX = 'blockblitz-v1-';
const JOIN_TIMEOUT = 15000;

// Optional: point at your own PeerJS server with ?peerHost=...&peerPort=...&peerPath=...&peerSecure=0
function peerOptions() {
  const q = new URLSearchParams(location.search);
  const opts = { debug: 0 };
  if (q.get('peerHost')) {
    opts.host = q.get('peerHost');
    opts.port = Number(q.get('peerPort')) || 443;
    opts.path = q.get('peerPath') || '/';
    opts.secure = q.get('peerSecure') !== '0';
  }
  return opts;
}

function friendlyError(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return null; // handled by caller
    case 'browser-incompatible': return 'Your browser does not support online play. Try Chrome, Edge or Firefox.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the matchmaking server. Check your internet connection and try again.';
    default: return 'Connection problem: ' + ((err && (err.message || err.type)) || 'unknown error');
  }
}

export class Net {
  constructor() {
    this.handlers = new Set();
    this.peer = null;
    this.host = null; // RoomHost when we created the room
    this.conn = null; // connection to the host when we joined a room
    this.local = null; // our own connection object when hosting
    this.watchdog = null;
  }

  get isHost() { return !!this.host; }

  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }

  emit(msg) { for (const h of [...this.handlers]) h(msg); }

  send(msg) {
    if (this.host && this.local) this.host.handle(this.local, msg);
    else if (this.conn && this.conn.open) this.conn.send(msg);
  }

  // Create a room: register the room code with the matchmaking server, then host it.
  create(settings, profile) {
    this.close();
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = makeCode();
        const peer = new Peer(ID_PREFIX + code, peerOptions());
        this.peer = peer;
        peer.on('open', () => {
          this.host = new RoomHost(code, settings);
          // our own player talks to the host directly, no network needed
          this.local = { send: (m) => queueMicrotask(() => this.emit(m)) };
          peer.on('connection', (c) => this.acceptPeer(c));
          const off = this.on((m) => { if (m.t === 'joined') { off(); resolve(m); } });
          this.host.handle(this.local, { t: 'join', name: profile.name, color: profile.color });
        });
        peer.on('error', (err) => {
          if (err.type === 'unavailable-id' && tries++ < 5) {
            peer.destroy();
            attempt(); // that code is in use by another room: pick a new one
          } else if (!this.host) {
            this.close();
            reject(new Error(friendlyError(err)));
          }
        });
        peer.on('disconnected', () => {
          // lost the matchmaking server: existing players stay connected, try to get back
          if (this.host && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
        });
      };
      attempt();
    });
  }

  acceptPeer(c) {
    const host = this.host;
    const conn = { send: (m) => c.open && c.send(m) };
    c.on('data', (m) => host.handle(conn, m));
    c.on('close', () => host.leave(conn));
    c.on('error', () => host.leave(conn));
  }

  // Join someone else's room by code.
  join(code, profile) {
    this.close();
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (text) => {
        if (done) return;
        done = true;
        this.close();
        reject(new Error(text));
      };
      const timer = setTimeout(() => fail('Could not connect to that room. Check the code, or the host\'s network may be blocking connections.'), JOIN_TIMEOUT);
      const peer = new Peer(peerOptions());
      this.peer = peer;
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') fail(`No room with code "${code}" was found.`);
        else if (!done) fail(friendlyError(err));
      });
      peer.on('open', () => {
        const c = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' });
        this.conn = c;
        c.on('open', () => c.send({ t: 'join', name: profile.name, color: profile.color }));
        c.on('data', (m) => {
          this.lastMsg = Date.now();
          if (!done) {
            if (m.t === 'error') { clearTimeout(timer); return fail(m.msg); }
            if (m.t === 'joined') {
              done = true;
              clearTimeout(timer);
              this.startWatchdog();
              resolve(m);
            }
            return;
          }
          this.emit(m);
        });
        c.on('close', () => this.lost('The host left, so the game ended.'));
        c.on('error', () => this.lost('Lost connection to the host.'));
      });
    });
  }

  // If the host vanishes without saying goodbye (closed laptop, Wi-Fi drop), notice it.
  startWatchdog() {
    this.lastMsg = Date.now();
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastMsg > 8000) this.lost('Lost connection to the host.');
    }, 1000);
  }

  lost(reason) {
    if (!this.conn) return;
    this.close();
    this.emit({ t: 'disconnected', reason });
  }

  close() {
    clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.host) { this.host.destroy(); this.host = null; }
    this.local = null;
    const c = this.conn;
    this.conn = null;
    if (c) try { c.close(); } catch { /* ignore */ }
    if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } this.peer = null; }
  }
}
