// Generates a 16x16-pixel-per-block texture atlas on a canvas (no image files needed).
import * as THREE from 'three';
import { B } from './shared/maps.js';
import { mulberry32 } from './shared/rng.js';

export const TILE = 16;
export const ATLAS_TILES = 8; // 8x8 tiles

function hex(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function px(ctx, x, y, rgb, v = 0) {
  ctx.fillStyle = `rgb(${clamp(rgb[0] + v)},${clamp(rgb[1] + v)},${clamp(rgb[2] + v)})`;
  ctx.fillRect(x, y, 1, 1);
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

const painters = {
  noise: (base, amt = 18) => (ctx, r) => {
    const c = hex(base);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, (r() - 0.5) * amt * 2);
  },
  speckle: (base, spot, amt = 14, p = 0.15) => (ctx, r) => {
    const c = hex(base), s = hex(spot);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, r() < p ? s : c, (r() - 0.5) * amt * 2);
  },
  grassSide: (ctx, r) => {
    const dirt = hex(0x8a5a32), grass = hex(0x5bb33c);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const edge = 3 + ((x * 7 + 3) % 3 === 0 ? 1 : 0) + (r() < 0.3 ? 1 : 0);
        px(ctx, x, y, y < edge ? grass : dirt, (r() - 0.5) * 30);
      }
  },
  snowSide: (ctx, r) => {
    const dirt = hex(0x8a5a32), snow = hex(0xf4f8fb);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const edge = 4 + (r() < 0.4 ? 1 : 0);
        px(ctx, x, y, y < edge ? snow : dirt, (r() - 0.5) * (y < edge ? 10 : 30));
      }
  },
  planks: (base) => (ctx, r) => {
    const c = hex(base);
    for (let y = 0; y < TILE; y++) {
      const row = Math.floor(y / 4);
      const off = row % 2 ? 5 : 11;
      for (let x = 0; x < TILE; x++) {
        let v = (r() - 0.5) * 16 + Math.sin(x * 0.9 + row) * 4;
        if (y % 4 === 3) v -= 45;
        if (x === off && y % 4 !== 3) v -= 35;
        px(ctx, x, y, c, v);
      }
    }
  },
  bricks: (brick, mortar) => (ctx, r) => {
    const b = hex(brick), m = hex(mortar);
    for (let y = 0; y < TILE; y++) {
      const row = Math.floor(y / 4);
      for (let x = 0; x < TILE; x++) {
        const xo = (x + (row % 2) * 4) % 8;
        const isM = y % 4 === 3 || xo === 7;
        px(ctx, x, y, isM ? m : b, (r() - 0.5) * 22);
      }
    }
  },
  stoneBricks: (base, moss) => (ctx, r) => {
    const c = hex(base), mo = moss ? hex(moss) : null;
    for (let y = 0; y < TILE; y++) {
      const row = Math.floor(y / 8);
      for (let x = 0; x < TILE; x++) {
        const xo = (x + (row % 2) * 8) % 16;
        const edge = y % 8 === 7 || xo === 15;
        const useMoss = mo && r() < 0.35 + (y > 8 ? 0.2 : 0);
        px(ctx, x, y, useMoss ? mo : c, edge ? -40 : (r() - 0.5) * 20);
      }
    }
  },
  logSide: (base) => (ctx, r) => {
    const c = hex(base);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, (x % 4 === 0 ? -30 : 0) + (r() - 0.5) * 20);
  },
  logTop: (ctx, r) => {
    const bark = hex(0x6b4a2b), wood = hex(0xb48a55);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const isBark = d > 6.5;
        px(ctx, x, y, isBark ? bark : wood, isBark ? (r() - 0.5) * 20 : (Math.floor(d) % 2 ? -18 : 0) + (r() - 0.5) * 10);
      }
  },
  leaves: (base) => (ctx, r) => {
    const c = hex(base);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, r() < 0.2 ? -55 : (r() - 0.5) * 40);
  },
  crate: (ctx, r) => {
    const c = hex(0xb07a3e);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const border = x < 2 || y < 2 || x > 13 || y > 13;
        const diag = Math.abs(x - y) < 1.5 || Math.abs(x - (15 - y)) < 1.5;
        px(ctx, x, y, c, border ? -45 : diag ? -25 : (r() - 0.5) * 18 + (y % 4 === 0 ? -12 : 0));
      }
  },
  container: (base) => (ctx, r) => {
    const c = hex(base);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, (x % 3 === 0 ? -35 : 0) + (r() - 0.5) * 12);
  },
  metal: (ctx, r) => {
    const c = hex(0x9aa3ab);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const seam = x === 0 || y === 0 || x === 8;
        const rivet = (x === 2 || x === 13) && (y === 2 || y === 13);
        px(ctx, x, y, c, seam ? -40 : rivet ? 40 : (r() - 0.5) * 10 + (y / 16) * -12);
      }
  },
  water: (ctx, r) => {
    const c = hex(0x2f7fd0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, Math.sin((x + y * 2) * 0.8) * 14 + (r() - 0.5) * 10);
  },
  lava: (ctx, r) => {
    const c = hex(0xff6a00), hot = hex(0xffd23f);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, Math.sin(x * 0.9) + Math.cos(y * 1.1) > 1 ? hot : c, (r() - 0.5) * 30);
  },
  roof: (base) => (ctx, r) => {
    const c = hex(base);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const row = Math.floor(y / 4);
        const xo = (x + (row % 2) * 2) % 4;
        px(ctx, x, y, c, (y % 4 === 3 ? -40 : 0) + (xo === 3 ? -20 : 0) + (r() - 0.5) * 14);
      }
  },
  cactus: (ctx, r) => {
    const c = hex(0x3f9b3a);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, (x % 4 === 1 ? -35 : 0) + (r() < 0.05 ? 80 : 0) + (r() - 0.5) * 16);
  },
  sandbag: (ctx, r) => {
    const c = hex(0xb9a57a);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const row = Math.floor(y / 5);
        const xo = (x + (row % 2) * 4) % 8;
        px(ctx, x, y, c, (y % 5 === 4 || xo === 7 ? -40 : 0) + (r() - 0.5) * 16);
      }
  },
  line: (ctx, r) => {
    const c = hex(0xf2c230);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, (r() - 0.5) * 20);
  },
  glass: (ctx, r) => {
    const c = hex(0xa8d8f0);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const frame = x === 0 || y === 0 || x === 15 || y === 15;
        const shine = x - y > 2 && x - y < 5;
        px(ctx, x, y, c, frame ? -60 : shine ? 35 : (r() - 0.5) * 6);
      }
  },
  car: (base) => (ctx, r) => {
    const c = hex(base);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, c, (y > 12 ? -50 : 0) + (r() - 0.5) * 8);
  },
};

// tile name -> painter
const TILES = {
  grass_top: painters.speckle(0x5bb33c, 0x4a9a30, 16, 0.25),
  grass_side: painters.grassSide,
  dirt: painters.speckle(0x8a5a32, 0x6e4526, 14, 0.2),
  stone: painters.speckle(0x8b8f94, 0x6f7378, 12, 0.25),
  plank: painters.planks(0xb8894f),
  darkplank: painters.planks(0x6b4a2e),
  log_side: painters.logSide(0x6b4a2b),
  log_top: painters.logTop,
  leaves: painters.leaves(0x3f9a35),
  pine: painters.leaves(0x2d6b3a),
  sand: painters.speckle(0xe8d49a, 0xd6bf82, 10, 0.25),
  sandstone: painters.bricks(0xd9b77a, 0xb8945a),
  sandstone_top: painters.speckle(0xdcbc80, 0xc9a96c, 10, 0.2),
  brick: painters.bricks(0xa8473a, 0xcbbfb0),
  concrete: painters.speckle(0xb5b8bb, 0xa3a6a9, 8, 0.2),
  snow: painters.speckle(0xf4f8fb, 0xdde8f0, 6, 0.15),
  snow_side: painters.snowSide,
  ice: painters.speckle(0x9fd3f0, 0xc8ebff, 8, 0.15),
  metal: painters.metal,
  basalt: painters.speckle(0x3a3436, 0x2a2527, 14, 0.3),
  lava: painters.lava,
  crate: painters.crate,
  roof: painters.roof(0xb5412f),
  snowroof: painters.roof(0xe8f0f6),
  bedrock: painters.speckle(0x333333, 0x111111, 20, 0.4),
  cactus: painters.cactus,
  stonebrick: painters.stoneBricks(0x8d9196),
  mossy: painters.stoneBricks(0x7f8a7a, 0x4f8a3a),
  cont_red: painters.container(0xb8352b),
  cont_blue: painters.container(0x2b5fb8),
  cont_green: painters.container(0x2f8a45),
  asphalt: painters.speckle(0x46484c, 0x55575b, 8, 0.3),
  water: painters.water,
  clay: painters.speckle(0xc0603a, 0xa8502f, 12, 0.25),
  gravel: painters.speckle(0x8c8580, 0x6e6863, 22, 0.45),
  sandbag: painters.sandbag,
  plaster: painters.speckle(0xece4d6, 0xddd3c2, 6, 0.2),
  line: painters.line,
  car_red: painters.car(0xd8342b),
  car_blue: painters.car(0x2f6fd8),
  glass: painters.glass,
};

// block id -> [top, side, bottom] tile names
const FACES = {
  [B.GRASS]: ['grass_top', 'grass_side', 'dirt'],
  [B.DIRT]: ['dirt', 'dirt', 'dirt'],
  [B.STONE]: ['stone', 'stone', 'stone'],
  [B.PLANK]: ['plank', 'plank', 'plank'],
  [B.LOG]: ['log_top', 'log_side', 'log_top'],
  [B.LEAVES]: ['leaves', 'leaves', 'leaves'],
  [B.SAND]: ['sand', 'sand', 'sand'],
  [B.SANDSTONE]: ['sandstone_top', 'sandstone', 'sandstone_top'],
  [B.BRICK]: ['brick', 'brick', 'brick'],
  [B.CONCRETE]: ['concrete', 'concrete', 'concrete'],
  [B.SNOW]: ['snow', 'snow_side', 'dirt'],
  [B.ICE]: ['ice', 'ice', 'ice'],
  [B.METAL]: ['metal', 'metal', 'metal'],
  [B.BASALT]: ['basalt', 'basalt', 'basalt'],
  [B.LAVA]: ['lava', 'lava', 'lava'],
  [B.CRATE]: ['crate', 'crate', 'crate'],
  [B.ROOF]: ['roof', 'roof', 'roof'],
  [B.BEDROCK]: ['bedrock', 'bedrock', 'bedrock'],
  [B.CACTUS]: ['cactus', 'cactus', 'cactus'],
  [B.PINE]: ['pine', 'pine', 'pine'],
  [B.STONEBRICK]: ['stonebrick', 'stonebrick', 'stonebrick'],
  [B.MOSSY]: ['mossy', 'mossy', 'mossy'],
  [B.CONT_RED]: ['cont_red', 'cont_red', 'cont_red'],
  [B.CONT_BLUE]: ['cont_blue', 'cont_blue', 'cont_blue'],
  [B.CONT_GREEN]: ['cont_green', 'cont_green', 'cont_green'],
  [B.ASPHALT]: ['asphalt', 'asphalt', 'asphalt'],
  [B.WATER]: ['water', 'water', 'water'],
  [B.CLAY]: ['clay', 'clay', 'clay'],
  [B.GRAVEL]: ['gravel', 'gravel', 'gravel'],
  [B.SANDBAG]: ['sandbag', 'sandbag', 'sandbag'],
  [B.PLASTER]: ['plaster', 'plaster', 'plaster'],
  [B.DARKPLANK]: ['darkplank', 'darkplank', 'darkplank'],
  [B.LINE]: ['line', 'asphalt', 'asphalt'],
  [B.CAR_RED]: ['car_red', 'car_red', 'car_red'],
  [B.CAR_BLUE]: ['car_blue', 'car_blue', 'car_blue'],
  [B.GLASS]: ['glass', 'glass', 'glass'],
  [B.SNOWROOF]: ['snowroof', 'snowroof', 'snowroof'],
};

export const GLOW = new Set([B.LAVA]);

let atlas = null;

export function getAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * ATLAS_TILES;
  const ctx = canvas.getContext('2d');
  const names = Object.keys(TILES);
  const index = {};
  names.forEach((name, i) => {
    const tx = i % ATLAS_TILES, ty = Math.floor(i / ATLAS_TILES);
    ctx.save();
    ctx.translate(tx * TILE, ty * TILE);
    TILES[name](ctx, mulberry32(i * 97 + 13));
    ctx.restore();
    index[name] = [tx, ty];
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const faceTiles = {};
  for (const [id, f] of Object.entries(FACES)) faceTiles[id] = f.map((n) => index[n]);
  atlas = { texture: tex, faceTiles, canvas };
  return atlas;
}

// Representative color for a block (used for particles when a bullet hits it).
const PARTICLE_COLORS = {
  [B.GRASS]: 0x5bb33c, [B.DIRT]: 0x8a5a32, [B.LEAVES]: 0x3f9a35, [B.PINE]: 0x2d6b3a, [B.SAND]: 0xe8d49a,
  [B.SNOW]: 0xf4f8fb, [B.PLANK]: 0xb8894f, [B.LOG]: 0x6b4a2b, [B.BRICK]: 0xa8473a, [B.CRATE]: 0xb07a3e,
  [B.LAVA]: 0xff6a00, [B.WATER]: 0x2f7fd0, [B.CLAY]: 0xc0603a, [B.SANDSTONE]: 0xd9b77a, [B.BASALT]: 0x3a3436,
};
export function blockColor(id) {
  return PARTICLE_COLORS[id] ?? 0x8b8f94;
}
