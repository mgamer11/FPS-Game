// Home screen: player preview, name/color, Join-or-Create popup, settings.
import * as THREE from 'three';
import { MAPS } from './shared/maps.js';
import { Net } from './net.js';
import { Game } from './game.js';
import { buildCharacter, setCharacterColor, poseCharacter } from './models.js';
import { bindSettingsUI } from './settings.js';
import { unlockAudio, sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#eab308', '#0ea5e9', '#111827'];
const PROFILE_KEY = 'blockblitz.profile';

const net = new Net();
let game = null;
let profile = { name: '', color: COLORS[0] };
try { Object.assign(profile, JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')); } catch { /* ignore */ }
const saveProfile = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ } };

// ---------------------------------------------------------------- player preview
const preview = (() => {
  const canvas = $('modelCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 3 / 4, 0.1, 50);
  camera.position.set(0, 1.25, 5.2);
  camera.lookAt(0, 1.0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x99bbdd, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  // blocky grass platform
  const grass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.8), new THREE.MeshLambertMaterial({ color: 0x5bb33c }));
  grass.position.y = -0.175;
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), new THREE.MeshLambertMaterial({ color: 0x8a5a32 }));
  dirt.position.y = -0.6;
  scene.add(grass, dirt);
  const character = buildCharacter(profile.color, 'ar');
  scene.add(character);
  let angle = 0.5, dragging = false, lastX = 0, active = true, t0 = performance.now();
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) { angle += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  canvas.addEventListener('pointerup', () => (dragging = false));
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  function frame(t) {
    requestAnimationFrame(frame);
    if (!active) return;
    const dt = Math.min(0.05, (t - t0) / 1000);
    t0 = t;
    if (!dragging) angle += dt * 0.5;
    character.rotation.y = angle;
    poseCharacter(character, Math.sin(t * 0.001) * 0.1, 0, dt);
    character.position.y = 0;
    resize();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return {
    setColor: (c) => setCharacterColor(character, c),
    setActive: (a) => { active = a; },
  };
})();

// ---------------------------------------------------------------- profile UI
const nameInput = $('nameInput');
nameInput.value = profile.name;
nameInput.addEventListener('input', () => { profile.name = nameInput.value.slice(0, 16); saveProfile(); });

const sw = $('colorSwatches');
for (const c of COLORS) {
  const d = document.createElement('div');
  d.className = 'swatch' + (c === profile.color ? ' sel' : '');
  d.style.background = c;
  d.onclick = () => {
    profile.color = c;
    saveProfile();
    preview.setColor(c);
    sw.querySelectorAll('.swatch').forEach((s) => s.classList.remove('sel'));
    d.classList.add('sel');
  };
  sw.appendChild(d);
}

function playerName() {
  return (profile.name || '').trim() || 'Player' + Math.floor(100 + Math.random() * 900);
}

// ---------------------------------------------------------------- room popup
const mapSelect = $('mapSelect');
mapSelect.innerHTML = `<option value="random">🎲 Random (new map each match)</option>` +
  MAPS.map((m, i) => `<option value="${i}">${m.name}</option>`).join('');
const updateDesc = () => {
  const v = mapSelect.value;
  $('mapDesc').textContent = v === 'random' ? 'A random map is picked every match.' : MAPS[v].desc;
};
mapSelect.addEventListener('change', updateDesc);
updateDesc();

function segmented(el, values, initial, fmt) {
  let value = initial;
  for (const v of values) {
    const b = document.createElement('button');
    b.textContent = fmt(v);
    if (v === initial) b.classList.add('sel');
    b.onclick = () => {
      value = v;
      el.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
    };
    el.appendChild(b);
  }
  return () => value;
}
const getTime = segmented($('timeSeg'), [3, 5, 8, 10, 15], 5, (v) => v + ' min');
const getPlayers = segmented($('playersSeg'), [2, 4, 6, 8, 10, 12, 16], 8, (v) => String(v));

function openRoomModal(tab = 'createTab') {
  $('roomError').textContent = '';
  $('roomModal').classList.remove('hidden');
  selectTab(tab);
}
function selectTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('createTab').classList.toggle('hidden', tab !== 'createTab');
  $('joinTab').classList.toggle('hidden', tab !== 'joinTab');
  $('roomError').textContent = '';
  if (tab === 'joinTab') setTimeout(() => $('codeInput').focus(), 0);
}
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => selectTab(t.dataset.tab)));
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close).classList.add('hidden')));
$('joinCreateBtn').onclick = () => { unlockAudio(); sfx.click(); openRoomModal(); };

const codeInput = $('codeInput');
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
});
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });

let busy = false;
async function request(fn, label) {
  if (busy) return;
  busy = true;
  $('roomError').textContent = label;
  document.querySelectorAll('#createBtn, #joinBtn').forEach((b) => (b.disabled = true));
  try {
    const data = await fn();
    $('roomError').textContent = '';
    startGame(data);
  } catch (e) {
    $('roomError').textContent = e.message;
  } finally {
    busy = false;
    document.querySelectorAll('#createBtn, #joinBtn').forEach((b) => (b.disabled = false));
  }
}

$('createBtn').onclick = () => {
  unlockAudio();
  const map = mapSelect.value === 'random' ? 'random' : Number(mapSelect.value);
  const settings = { map, time: getTime(), maxPlayers: getPlayers() };
  request(() => net.create(settings, { name: playerName(), color: profile.color }), 'Creating room...');
};
$('joinBtn').onclick = () => {
  unlockAudio();
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    $('roomError').textContent = 'Room codes are exactly 5 letters/numbers.';
    return;
  }
  request(() => net.join(code, { name: playerName(), color: profile.color }), 'Connecting to room ' + code + '...');
};

// ---------------------------------------------------------------- game start / exit
function startGame(data) {
  $('roomModal').classList.add('hidden');
  $('home').classList.add('hidden');
  $('game').classList.remove('hidden');
  preview.setActive(false);
  game = window.__game = new Game({
    net, data, me: { name: data.players.find((p) => p.id === data.you)?.name || 'Player', color: profile.color, id: data.you },
    onExit: (reason) => {
      game = null;
      net.close();
      $('settingsModal').classList.add('hidden');
      $('game').classList.add('hidden');
      $('home').classList.remove('hidden');
      preview.setActive(true);
      if (reason) toast(reason);
    },
  });
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), 4000);
}

// ---------------------------------------------------------------- settings
bindSettingsUI();
$('homeSettingsBtn').onclick = () => {
  $('settingsTitle').textContent = 'Settings';
  $('roomInfo').classList.add('hidden');
  $('resumeBtn').classList.add('hidden');
  $('leaveBtn').classList.add('hidden');
  $('closeSettingsBtn').classList.remove('hidden');
  $('settingsModal').classList.remove('hidden');
};
$('closeSettingsBtn').onclick = () => $('settingsModal').classList.add('hidden');
$('resumeBtn').onclick = () => game && game.resume();
$('leaveBtn').onclick = () => game && game.exit();

// Support invite links like http://host:3000/?join=ABCDE
const inviteCode = new URLSearchParams(location.search).get('join');
if (inviteCode) {
  openRoomModal('joinTab');
  codeInput.value = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}
