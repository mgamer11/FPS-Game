// Top-down minimap in the corner of the HUD.
import { blockColor } from './textures.js';
import { TEAMS } from './shared/modes.js';

const REVEAL_MS = 2500; // how long an enemy stays on the map after shooting

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.last = 0;
  }

  // Paint the map once: the color of the highest block in every column, brighter where it is higher.
  setMap(map) {
    const w = map.world;
    this.size = w.sx;
    this.base.width = w.sx;
    this.base.height = w.sz;
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(w.sx, w.sz);
    let lo = Infinity, hi = -Infinity;
    const tops = new Int16Array(w.sx * w.sz);
    for (let z = 0; z < w.sz; z++)
      for (let x = 0; x < w.sx; x++) {
        const t = w.top(x, z);
        tops[z * w.sx + x] = t;
        if (x > 0 && z > 0 && x < w.sx - 1 && z < w.sz - 1) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
      }
    for (let z = 0; z < w.sz; z++)
      for (let x = 0; x < w.sx; x++) {
        const t = tops[z * w.sx + x];
        const edge = x === 0 || z === 0 || x === w.sx - 1 || z === w.sz - 1;
        const c = edge ? 0x22313f : blockColor(w.get(x, t, z));
        const shade = edge ? 1 : 0.62 + 0.38 * Math.min(1, (t - lo) / Math.max(1, Math.min(hi - lo, 14)));
        const i = (z * w.sx + x) * 4;
        img.data[i] = ((c >> 16) & 255) * shade;
        img.data[i + 1] = ((c >> 8) & 255) * shade;
        img.data[i + 2] = (c & 255) * shade;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }

  draw(game, now) {
    if (now - this.last < 90) return; // about 10 times a second is plenty
    this.last = now;
    const { ctx, canvas } = this;
    const S = canvas.width, k = S / this.size;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.base, 0, 0, S, S);
    ctx.globalAlpha = 1;

    for (const pk of game.pickups.values()) {
      if (!pk.active) continue;
      const x = pk.x * k, y = pk.z * k;
      if (pk.type === 'health') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
        ctx.fillStyle = '#e02b3c';
        ctx.fillRect(x - 2.5, y - 0.75, 5, 1.5);
        ctx.fillRect(x - 0.75, y - 2.5, 1.5, 5);
      } else {
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2, y - 2, 4, 4);
      }
    }

    const dot = (x, z, color, r = 3.2) => {
      ctx.beginPath();
      ctx.arc(x * k, z * k, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.stroke();
    };
    for (const p of game.players.values()) {
      if (p.dead) continue;
      if (game.mode === 'tdm' && p.team === game.myTeam) dot(p.pos.x, p.pos.z, TEAMS[p.team].color);
      else if (now - (p.lastShot || -1e9) < REVEAL_MS) {
        // enemies only show up for a moment after they fire
        ctx.globalAlpha = 1 - (now - p.lastShot) / REVEAL_MS * 0.7;
        dot(p.pos.x, p.pos.z, game.mode === 'tdm' ? TEAMS[p.team].color : '#ff3b3b');
        ctx.globalAlpha = 1;
      }
    }

    // you: an arrow pointing the way you look
    if (game.alive) {
      const pl = game.player;
      ctx.save();
      ctx.translate(pl.pos.x * k, pl.pos.z * k);
      ctx.rotate(-pl.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.restore();
    }
  }
}
