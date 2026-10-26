// Blocky player characters and gun models built from boxes.
import * as THREE from 'three';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

function box(w, h, d, x, y, z, color, material) {
  const m = new THREE.Mesh(boxGeo, material || mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

// Colors used by the gun models
const C = {
  black: 0x1c1d20, dark: 0x2e3136, gunmetal: 0x4a4f57, steel: 0x8a9099, chrome: 0xb8bec6,
  wood: 0x8b5a2b, darkwood: 0x5e3a1a, tan: 0xc8a165, olive: 0x556b2f, darkolive: 0x3f5122,
  red: 0xd23b2b, orange: 0xe8742a, gold: 0xd4a537, bakelite: 0xa8522a, sand: 0xb59a6a, navy: 0x3d5a80,
};
const GLOW = true; // parts marked with this are unlit (lenses, dots)

// Each part: [w, h, d, x, y, z, color, glow?]  (forward is -z, origin at the top of the grip)
const triggerGroup = (z = -0.04, metal = C.black, trig = C.steel) => [
  [0.02, 0.015, 0.09, 0, -0.035, z, metal], // trigger guard
  [0.02, 0.05, 0.015, 0, -0.02, z + 0.04, metal],
  [0.012, 0.04, 0.012, 0, -0.015, z + 0.01, trig], // trigger
];

const GUN_PARTS = {
  pistol: [
    [0.075, 0.07, 0.3, 0, 0.06, -0.09, C.dark], // slide
    [0.077, 0.05, 0.012, 0, 0.062, 0.02, C.black], [0.077, 0.05, 0.012, 0, 0.062, 0.04, C.black], // serrations
    [0.07, 0.045, 0.26, 0, 0.005, -0.08, C.black], // frame
    [0.035, 0.035, 0.02, 0, 0.065, -0.245, 0x0e0e0e], // muzzle
    [0.015, 0.02, 0.02, 0, 0.105, -0.22, 0xffffff, GLOW], // front sight dot
    [0.05, 0.02, 0.02, 0, 0.105, 0.04, C.black], // rear sight
    [0.065, 0.16, 0.08, 0, -0.08, 0.03, C.black], // grip
    [0.069, 0.12, 0.06, 0, -0.08, 0.03, C.darkwood], // grip panels
    [0.07, 0.02, 0.085, 0, -0.165, 0.03, C.black], // magazine base
    ...triggerGroup(-0.06),
  ],
  ar: [
    [0.08, 0.11, 0.36, 0, 0.03, -0.08, C.dark], // receiver
    [0.075, 0.03, 0.3, 0, 0.095, -0.06, C.gunmetal], // dust cover
    [0.02, 0.02, 0.05, 0.05, 0.06, -0.02, C.steel], // charging handle
    [0.085, 0.09, 0.24, 0, 0.02, -0.36, C.wood], // lower handguard
    [0.07, 0.03, 0.2, 0, 0.08, -0.35, C.darkwood], // upper handguard
    [0.035, 0.035, 0.24, 0, 0.05, -0.58, C.black], // barrel
    [0.02, 0.06, 0.02, 0, 0.09, -0.6, C.black], // front sight
    [0.05, 0.05, 0.06, 0, 0.05, -0.71, C.gunmetal], // muzzle brake
    [0.03, 0.03, 0.04, 0, 0.12, -0.12, C.black], // rear sight
    [0.06, 0.12, 0.08, 0, -0.08, -0.17, C.bakelite], // curved magazine
    [0.06, 0.1, 0.08, 0, -0.17, -0.21, C.bakelite],
    [0.06, 0.13, 0.07, 0, -0.08, 0.04, C.darkwood], // pistol grip
    [0.07, 0.1, 0.26, 0, 0.0, 0.23, C.wood], // stock
    [0.075, 0.12, 0.02, 0, -0.005, 0.37, C.black], // butt plate
    ...triggerGroup(-0.06),
  ],
  smg: [
    [0.08, 0.11, 0.32, 0, 0.03, -0.08, 0x2a2c30], // body
    [0.082, 0.02, 0.2, 0, 0.0, -0.08, C.tan], // accent stripe
    [0.05, 0.02, 0.28, 0, 0.095, -0.08, C.black], // top rail
    [0.04, 0.04, 0.06, 0, 0.12, -0.05, C.black], // red dot sight
    [0.035, 0.03, 0.01, 0, 0.125, -0.081, 0xff3b3b, GLOW],
    [0.05, 0.05, 0.12, 0, 0.04, -0.3, C.gunmetal], // barrel shroud
    [0.03, 0.03, 0.04, 0, 0.04, -0.38, 0x0e0e0e], // muzzle
    [0.04, 0.1, 0.05, 0, -0.05, -0.2, C.tan], // vertical foregrip
    [0.05, 0.22, 0.06, 0, -0.13, -0.06, C.black], // long magazine
    [0.055, 0.12, 0.06, 0, -0.08, 0.05, C.tan], // grip
    [0.015, 0.015, 0.2, 0.025, 0.03, 0.17, C.steel], [0.015, 0.015, 0.2, -0.025, 0.03, 0.17, C.steel], // stock rods
    [0.07, 0.08, 0.02, 0, 0.02, 0.27, 0x2a2c30], // butt pad
    ...triggerGroup(-0.03),
  ],
  shotgun: [
    [0.05, 0.05, 0.62, 0, 0.07, -0.35, C.dark], // barrel
    [0.04, 0.04, 0.5, 0, 0.025, -0.32, C.black], // tube magazine
    [0.075, 0.07, 0.18, 0, 0.025, -0.42, C.wood], // pump
    [0.078, 0.072, 0.012, 0, 0.025, -0.36, C.darkwood], [0.078, 0.072, 0.012, 0, 0.025, -0.42, C.darkwood], [0.078, 0.072, 0.012, 0, 0.025, -0.48, C.darkwood],
    [0.08, 0.11, 0.2, 0, 0.04, -0.02, 0x3a3d42], // receiver
    [0.01, 0.04, 0.08, 0.041, 0.05, -0.02, 0x0e0e0e], // ejection port
    [0.012, 0.03, 0.04, 0.045, 0.0, 0.03, C.red], [0.013, 0.03, 0.012, 0.045, 0.0, 0.055, C.gold], // spare shell
    [0.012, 0.03, 0.04, 0.045, 0.0, -0.03, C.red], [0.013, 0.03, 0.012, 0.045, 0.0, -0.005, C.gold],
    [0.015, 0.015, 0.015, 0, 0.1, -0.64, C.gold], // bead sight
    [0.06, 0.1, 0.07, 0, -0.05, 0.07, C.wood], // grip
    [0.07, 0.11, 0.3, 0, 0.0, 0.24, C.wood], // stock
    [0.075, 0.13, 0.025, 0, -0.01, 0.4, C.black], // recoil pad
    ...triggerGroup(0.0, C.black, C.gold),
  ],
  sniper: [
    [0.075, 0.09, 0.3, 0, 0.04, -0.05, C.dark], // receiver
    [0.08, 0.08, 0.3, 0, 0.01, -0.32, C.olive], // forestock
    [0.07, 0.13, 0.3, 0, -0.01, 0.27, C.olive], // stock
    [0.06, 0.04, 0.15, 0, 0.075, 0.25, C.darkolive], // cheek rest
    [0.075, 0.15, 0.025, 0, -0.01, 0.43, C.black], // butt pad
    [0.035, 0.035, 0.6, 0, 0.05, -0.72, C.black], // barrel
    [0.055, 0.05, 0.08, 0, 0.05, -1.04, C.gunmetal], // muzzle brake
    [0.06, 0.06, 0.36, 0, 0.14, -0.08, C.black], // scope tube
    [0.085, 0.085, 0.08, 0, 0.14, -0.28, C.black], // front bell
    [0.075, 0.075, 0.06, 0, 0.14, 0.12, C.black], // rear bell
    [0.07, 0.07, 0.01, 0, 0.14, -0.325, 0x5fb7ff, GLOW], // lens
    [0.03, 0.03, 0.03, 0, 0.185, -0.08, C.gunmetal], [0.03, 0.03, 0.03, 0.045, 0.14, -0.08, C.gunmetal], // turrets
    [0.03, 0.05, 0.03, 0, 0.09, -0.18, C.dark], [0.03, 0.05, 0.03, 0, 0.09, 0.04, C.dark], // scope mounts
    [0.06, 0.015, 0.015, 0.06, 0.05, 0.04, C.steel], [0.025, 0.025, 0.025, 0.09, 0.045, 0.04, C.steel], // bolt
    [0.05, 0.06, 0.08, 0, -0.06, -0.08, C.black], // magazine
    [0.06, 0.12, 0.06, 0, -0.08, 0.08, C.olive], // grip
    [0.015, 0.015, 0.2, 0.025, -0.04, -0.45, C.black], [0.015, 0.015, 0.2, -0.025, -0.04, -0.45, C.black], // bipod
    ...triggerGroup(0.0),
  ],
  lmg: [
    [0.11, 0.13, 0.4, 0, 0.03, -0.08, C.dark], // receiver
    [0.1, 0.04, 0.22, 0, 0.115, -0.04, C.gunmetal], // feed cover
    [0.07, 0.07, 0.32, 0, 0.04, -0.44, C.black], // barrel shroud
    [0.072, 0.02, 0.02, 0, 0.04, -0.34, C.gunmetal], [0.072, 0.02, 0.02, 0, 0.04, -0.42, C.gunmetal], [0.072, 0.02, 0.02, 0, 0.04, -0.5, C.gunmetal],
    [0.04, 0.04, 0.2, 0, 0.04, -0.68, C.black], // barrel
    [0.055, 0.055, 0.06, 0, 0.04, -0.8, C.dark], // flash hider
    [0.03, 0.03, 0.16, 0, 0.16, -0.25, C.black], // carry handle
    [0.02, 0.05, 0.02, 0, 0.13, -0.18, C.black], [0.02, 0.05, 0.02, 0, 0.13, -0.32, C.black],
    [0.13, 0.15, 0.16, 0, -0.1, -0.12, C.sand], // box magazine
    [0.135, 0.02, 0.165, 0, -0.06, -0.12, 0x6b5a3a],
    [0.03, 0.03, 0.04, 0.06, -0.02, -0.08, C.gold], [0.03, 0.03, 0.03, 0.06, 0.01, -0.05, C.gold], // ammo belt
    [0.06, 0.12, 0.07, 0, -0.08, 0.06, C.dark], // grip
    [0.08, 0.12, 0.24, 0, 0, 0.24, C.sand], // stock
    [0.085, 0.14, 0.02, 0, 0, 0.37, C.black],
    [0.015, 0.015, 0.22, 0.03, -0.03, -0.5, C.gunmetal], [0.015, 0.015, 0.22, -0.03, -0.03, -0.5, C.gunmetal], // bipod
    ...triggerGroup(0.0),
  ],
  revolver: [
    [0.05, 0.055, 0.22, 0, 0.06, -0.18, C.chrome], // barrel
    [0.03, 0.015, 0.22, 0, 0.093, -0.18, C.steel], // top rib
    [0.012, 0.025, 0.02, 0, 0.105, -0.28, C.steel], // front sight
    [0.03, 0.03, 0.14, 0, 0.02, -0.15, C.steel], // ejector rod housing
    [0.1, 0.1, 0.11, 0, 0.045, -0.02, C.steel], // cylinder
    [0.102, 0.02, 0.09, 0, 0.045, -0.02, 0x5a6068], [0.02, 0.102, 0.09, 0, 0.045, -0.02, 0x5a6068], // flutes
    [0.06, 0.09, 0.12, 0, 0.04, 0.05, C.chrome], // frame
    [0.02, 0.04, 0.03, 0, 0.1, 0.1, 0x5a6068], // hammer
    [0.06, 0.15, 0.08, 0, -0.07, 0.09, C.wood], // grip
    [0.062, 0.025, 0.025, 0, -0.06, 0.09, C.gold], // grip medallion
    ...triggerGroup(-0.04, C.steel, C.gold),
  ],
  rocket: [
    [0.17, 0.17, 0.86, 0, 0.08, -0.12, C.olive], // tube
    [0.175, 0.175, 0.03, 0, 0.08, -0.3, 0xe8c42a], // warning stripe
    [0.21, 0.21, 0.06, 0, 0.08, -0.56, C.darkolive], // front ring
    [0.2, 0.2, 0.08, 0, 0.08, 0.33, C.darkolive], // back flare
    [0.14, 0.14, 0.01, 0, 0.08, 0.375, 0x0e0e0e], // back opening
    [0.13, 0.13, 0.08, 0, 0.08, -0.62, C.red], [0.08, 0.08, 0.06, 0, 0.08, -0.68, C.red], [0.03, 0.03, 0.04, 0, 0.08, -0.72, C.gold], // warhead
    [0.05, 0.07, 0.1, -0.11, 0.15, -0.15, C.black], [0.04, 0.04, 0.01, -0.11, 0.16, -0.205, 0x5fb7ff, GLOW], // sight
    [0.06, 0.14, 0.06, 0, -0.06, -0.05, C.black], // grip
    [0.05, 0.12, 0.05, 0, -0.05, -0.3, C.black], // front grip
    [0.12, 0.06, 0.18, 0, -0.02, 0.12, C.dark], // shoulder pad
    ...triggerGroup(-0.09),
  ],
  dmr: [
    [0.075, 0.1, 0.4, 0, 0.03, -0.08, C.dark], // receiver
    [0.08, 0.08, 0.3, 0, 0.035, -0.42, C.black], // handguard
    [0.082, 0.015, 0.26, 0, 0.06, -0.42, C.gunmetal], // rail slots
    [0.035, 0.035, 0.25, 0, 0.04, -0.69, C.black], // barrel
    [0.05, 0.05, 0.06, 0, 0.04, -0.82, C.dark], // muzzle
    [0.05, 0.05, 0.24, 0, 0.13, -0.1, C.black], // scope
    [0.07, 0.07, 0.05, 0, 0.13, -0.24, C.black], [0.065, 0.065, 0.04, 0, 0.13, 0.04, C.black],
    [0.06, 0.06, 0.01, 0, 0.13, -0.27, 0x5fb7ff, GLOW], // lens
    [0.03, 0.04, 0.03, 0, 0.09, -0.15, C.dark], [0.03, 0.04, 0.03, 0, 0.09, -0.02, C.dark], // mounts
    [0.06, 0.12, 0.08, 0, -0.07, -0.14, C.black], // magazine
    [0.055, 0.12, 0.06, 0, -0.08, 0.04, C.tan], // grip
    [0.07, 0.1, 0.26, 0, 0.01, 0.22, C.tan], // stock
    [0.06, 0.03, 0.12, 0, 0.07, 0.2, C.tan], // cheek rest
    [0.075, 0.12, 0.02, 0, 0, 0.36, C.black],
    ...triggerGroup(-0.05),
  ],
  burst: [
    [0.09, 0.13, 0.5, 0, 0.03, -0.1, C.navy], // bullpup body
    [0.092, 0.02, 0.2, 0, -0.01, -0.15, C.orange], [0.092, 0.03, 0.03, 0, 0.05, -0.33, C.orange], // accents
    [0.05, 0.04, 0.3, 0, 0.115, -0.1, C.black], // top rail
    [0.05, 0.05, 0.02, 0, 0.145, -0.05, C.black], [0.04, 0.035, 0.005, 0, 0.15, -0.062, 0x7cff7c, GLOW], // holo sight
    [0.035, 0.035, 0.18, 0, 0.05, -0.43, C.black], // barrel
    [0.05, 0.05, 0.05, 0, 0.05, -0.53, C.dark], // muzzle
    [0.06, 0.12, 0.08, 0, -0.07, 0.08, C.black], // magazine (behind the grip)
    [0.055, 0.12, 0.06, 0, -0.08, -0.06, 0x2a2c30], // grip
    [0.095, 0.14, 0.03, 0, 0.03, 0.165, 0x2a2c30], // butt
    ...triggerGroup(-0.1),
  ],
};

export const MUZZLE_Z = {
  pistol: -0.255, ar: -0.74, smg: -0.4, shotgun: -0.66, sniper: -1.08, lmg: -0.83, revolver: -0.29, rocket: -0.74, dmr: -0.85, burst: -0.555,
};

const glowCache = new Map();
function glowMat(color) {
  if (!glowCache.has(color)) glowCache.set(color, new THREE.MeshBasicMaterial({ color }));
  return glowCache.get(color);
}

export function buildGun(id) {
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, color, glow] of GUN_PARTS[id] || GUN_PARTS.pistol) {
    g.add(box(w, h, d, x, y, z, color, glow ? glowMat(color) : undefined));
  }
  g.userData.muzzleZ = MUZZLE_Z[id] ?? -0.4;
  return g;
}

// Side-view picture of a gun for the hotbar, drawn from the same parts (cached data URL).
const iconCache = new Map();
export function gunIcon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const parts = GUN_PARTS[id] || GUN_PARTS.pistol;
  let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [, h, d, , y, z] of parts) {
    minZ = Math.min(minZ, z - d / 2); maxZ = Math.max(maxZ, z + d / 2);
    minY = Math.min(minY, y - h / 2); maxY = Math.max(maxY, y + h / 2);
  }
  const W = 96, H = 48, pad = 4;
  const scale = Math.min((W - pad * 2) / (maxZ - minZ), (H - pad * 2) / (maxY - minY));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const ox = (W - (maxZ - minZ) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
  // draw far-side parts first so the visible (+x) side ends up on top; muzzle points right
  const sorted = parts.slice().sort((a, b) => (a[3] + a[0] / 2) - (b[3] + b[0] / 2));
  for (const [, h, d, , y, z, color] of sorted) {
    const px = ox + (maxZ - (z + d / 2)) * scale;
    const py = oy + (maxY - (y + h / 2)) * scale;
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(px, py, Math.max(1, d * scale), Math.max(1, h * scale));
  }
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
}

// A blocky character. Feet at y = 0, faces -z.
export function buildCharacter(color, weapon = 'ar') {
  const root = new THREE.Group();
  const shirt = new THREE.Color(color).getHex();
  const pants = shade(shirt, 0.45);
  const skin = 0xf1c39a;
  const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });
  const shirtMat = lambert(shirt), pantsMat = lambert(pants), skinMat = lambert(skin);

  const legL = new THREE.Group(); legL.position.set(-0.13, 0.75, 0);
  legL.add(box(0.24, 0.75, 0.26, 0, -0.375, 0, 0, pantsMat));
  legL.add(box(0.25, 0.12, 0.3, 0, -0.69, -0.02, 0x2a2a2a));
  const legR = legL.clone(); legR.position.x = 0.13;

  const torso = box(0.52, 0.65, 0.3, 0, 1.075, 0, 0, shirtMat);
  const belt = box(0.53, 0.07, 0.31, 0, 0.78, 0, 0x2a2a2a);

  const head = new THREE.Group(); head.position.set(0, 1.4, 0);
  head.add(box(0.5, 0.5, 0.5, 0, 0.25, 0, 0, skinMat));
  head.add(box(0.52, 0.14, 0.52, 0, 0.46, 0.0, 0x4a3020)); // hair
  head.add(box(0.52, 0.3, 0.1, 0, 0.32, 0.22, 0x4a3020));
  head.add(box(0.08, 0.09, 0.02, -0.11, 0.27, -0.255, 0x1a1a1a)); // eyes
  head.add(box(0.08, 0.09, 0.02, 0.11, 0.27, -0.255, 0x1a1a1a));
  head.add(box(0.14, 0.03, 0.02, 0, 0.12, -0.255, 0xa0614a)); // mouth

  const armR = new THREE.Group(); armR.position.set(0.37, 1.35, 0);
  armR.add(box(0.2, 0.62, 0.22, 0, -0.28, 0, 0, shirtMat));
  armR.add(box(0.19, 0.12, 0.21, 0, -0.6, 0, 0, skinMat));
  const armL = new THREE.Group(); armL.position.set(-0.37, 1.35, 0);
  armL.add(box(0.2, 0.62, 0.22, 0, -0.28, 0, 0, shirtMat));
  armL.add(box(0.19, 0.12, 0.21, 0, -0.6, 0, 0, skinMat));

  const gunHolder = new THREE.Group();
  gunHolder.position.set(0, -0.62, 0);
  gunHolder.rotation.x = -Math.PI / 2;
  armR.add(gunHolder);

  root.add(legL, legR, torso, belt, head, armR, armL);
  root.userData = { legL, legR, head, armR, armL, gunHolder, weapon: null, walk: 0, shirtMat, pantsMat };
  setCharacterWeapon(root, weapon);
  poseCharacter(root, 0, 0, 0);
  return root;
}

export function setCharacterWeapon(root, id) {
  const u = root.userData;
  if (u.weapon === id) return;
  u.gunHolder.clear();
  if (id) {
    const gun = buildGun(id);
    gun.scale.setScalar(1.45);
    u.gunHolder.add(gun);
  }
  u.weapon = id;
}

export function setCharacterColor(root, color) {
  const u = root.userData;
  u.shirtMat.color.set(color);
  u.pantsMat.color.set(color).multiplyScalar(0.45);
}

// pitch: look up/down, speed: horizontal speed for walk animation
export function poseCharacter(root, pitch, speed, dt) {
  const u = root.userData;
  u.walk += dt * Math.min(speed, 10) * 1.6;
  const swing = speed > 0.5 ? Math.sin(u.walk) * 0.75 : 0;
  u.legL.rotation.x = THREE.MathUtils.lerp(u.legL.rotation.x, swing, 0.3);
  u.legR.rotation.x = THREE.MathUtils.lerp(u.legR.rotation.x, -swing, 0.3);
  u.head.rotation.x = pitch * 0.8;
  u.armR.rotation.x = Math.PI / 2 + pitch;
  u.armL.rotation.x = Math.PI / 2 + pitch;
  u.armL.rotation.z = -0.45;
  u.armL.position.z = -0.05;
}

// Floating name above a player
export function makeNameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px Nunito, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(250, ctx.measureText(name).width + 24);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 48, 12);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}
