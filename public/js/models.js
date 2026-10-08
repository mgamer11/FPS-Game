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

// [w, h, d, x, y, z, color]  (forward is -z, origin near the grip)
const GUN_PARTS = {
  pistol: [[0.07, 0.1, 0.28, 0, 0.03, -0.08, 0x3a3d42], [0.06, 0.15, 0.07, 0, -0.07, 0.02, 0x23262a], [0.02, 0.03, 0.03, 0, 0.095, -0.2, 0x111111]],
  ar: [[0.08, 0.12, 0.5, 0, 0.02, -0.15, 0x3a3f44], [0.04, 0.04, 0.3, 0, 0.04, -0.55, 0x1e1e1e], [0.07, 0.1, 0.22, 0, 0, 0.2, 0x5c4630],
    [0.06, 0.17, 0.08, 0, -0.1, -0.18, 0x222222], [0.06, 0.12, 0.06, 0, -0.08, 0.02, 0x222222], [0.03, 0.04, 0.1, 0, 0.1, -0.08, 0x111111], [0.09, 0.08, 0.18, 0, 0.0, -0.36, 0x5c4630]],
  smg: [[0.08, 0.12, 0.36, 0, 0.02, -0.1, 0x2b2f33], [0.035, 0.035, 0.12, 0, 0.03, -0.34, 0x111111], [0.05, 0.24, 0.06, 0, -0.14, -0.12, 0x1a1a1a],
    [0.06, 0.12, 0.06, 0, -0.08, 0.03, 0x1a1a1a], [0.04, 0.05, 0.14, 0, 0.0, 0.14, 0x2b2f33]],
  shotgun: [[0.06, 0.06, 0.7, 0, 0.05, -0.35, 0x2f2f2f], [0.08, 0.07, 0.2, 0, -0.01, -0.42, 0x7a4a24], [0.07, 0.12, 0.3, 0, -0.01, 0.13, 0x7a4a24],
    [0.08, 0.11, 0.18, 0, 0.02, -0.04, 0x2a2a2a]],
  sniper: [[0.08, 0.1, 0.55, 0, 0.02, -0.1, 0x3a5a34], [0.035, 0.035, 0.55, 0, 0.04, -0.62, 0x1a1a1a], [0.07, 0.07, 0.32, 0, 0.12, -0.12, 0x111111],
    [0.07, 0.12, 0.26, 0, -0.01, 0.26, 0x3a5a34], [0.05, 0.1, 0.07, 0, -0.08, -0.15, 0x1a1a1a], [0.09, 0.09, 0.04, 0, 0.12, -0.29, 0x6fb4ff]],
  lmg: [[0.12, 0.14, 0.55, 0, 0.02, -0.15, 0x4a5040], [0.05, 0.05, 0.42, 0, 0.04, -0.62, 0x1a1a1a], [0.12, 0.14, 0.14, 0.05, -0.1, -0.12, 0x6a6a3a],
    [0.08, 0.12, 0.24, 0, 0, 0.22, 0x2a2a2a], [0.03, 0.06, 0.12, 0, 0.12, -0.15, 0x111111], [0.05, 0.12, 0.06, 0, -0.08, 0.04, 0x1a1a1a]],
  revolver: [[0.05, 0.06, 0.25, 0, 0.05, -0.17, 0x9aa0a6], [0.09, 0.09, 0.1, 0, 0.03, -0.02, 0x6b7076], [0.06, 0.15, 0.07, 0, -0.07, 0.05, 0x5a3a20]],
  rocket: [[0.16, 0.16, 0.9, 0, 0.08, -0.15, 0x46663a], [0.2, 0.2, 0.08, 0, 0.08, -0.62, 0x2a3a22], [0.19, 0.19, 0.06, 0, 0.08, 0.3, 0x2a3a22],
    [0.06, 0.14, 0.06, 0, -0.06, -0.05, 0x1a1a1a], [0.05, 0.07, 0.1, -0.11, 0.12, -0.2, 0x111111], [0.12, 0.12, 0.05, 0, 0.08, -0.67, 0xd04020]],
};

export const MUZZLE_Z = { pistol: -0.24, ar: -0.72, smg: -0.42, shotgun: -0.72, sniper: -0.92, lmg: -0.85, revolver: -0.31, rocket: -0.7 };

export function buildGun(id) {
  const g = new THREE.Group();
  for (const p of GUN_PARTS[id] || GUN_PARTS.pistol) g.add(box(...p));
  g.userData.muzzleZ = MUZZLE_Z[id] ?? -0.4;
  return g;
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
