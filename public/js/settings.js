// Player settings, saved in the browser.
import { ACTIONS, DEFAULT_KEYS, keyLabel, RESERVED } from './keybinds.js';

const DEFAULTS = {
  sens: 1, zoomSens: 0.7, fov: 80, vol: 0.6, qual: 1, hudScale: 1,
  xhairColor: '#ffffff', invertY: false, bob: true, showFps: false, fullscreen: true,
};
const KEY = 'blockblitz.settings';

export const settings = { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  Object.assign(settings, saved, { keys: { ...DEFAULT_KEYS, ...(saved.keys || {}) } });
} catch { /* ignore broken storage */ }

const listeners = [];
export function onSettingsChange(fn) { listeners.push(fn); }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  for (const fn of listeners) fn(settings);
}

export function bindSettingsUI() {
  const pct = (v) => Math.round(v * 100) + '%';
  const fmt = { sens: (v) => v.toFixed(2), zoomSens: (v) => v.toFixed(2), fov: (v) => v + '°', vol: pct, qual: pct, hudScale: pct };
  for (const key of Object.keys(DEFAULTS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    const label = document.getElementById(key + 'Val');
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = settings[key];
    if (label) label.textContent = fmt[key](Number(settings[key]));
    el.addEventListener('input', () => {
      if (el.type === 'checkbox') settings[key] = el.checked;
      else if (el.type === 'range') settings[key] = Number(el.value);
      else settings[key] = el.value;
      if (label) label.textContent = fmt[key](Number(settings[key]));
      saveSettings();
    });
  }

  // General / Keybinds tabs
  const tabs = document.querySelectorAll('[data-stab]');
  tabs.forEach((t) => (t.onclick = () => {
    tabs.forEach((x) => x.classList.toggle('active', x === t));
    document.getElementById('generalPane').classList.toggle('hidden', t.dataset.stab !== 'generalPane');
    document.getElementById('keysPane').classList.toggle('hidden', t.dataset.stab !== 'keysPane');
    stopListening();
  }));
  renderKeybinds();
  document.getElementById('resetKeys').onclick = () => {
    settings.keys = { ...DEFAULT_KEYS };
    saveSettings();
    renderKeybinds('All controls reset to default.');
  };
}

// ---------------------------------------------------------------- keybinds tab
let listening = null; // { action, button }

function renderKeybinds(message = '') {
  const list = document.getElementById('keybindList');
  list.innerHTML = '';
  for (const a of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'kb-row';
    const name = document.createElement('span');
    name.textContent = a.label;
    const btn = document.createElement('button');
    btn.className = 'kb-btn';
    btn.textContent = keyLabel(settings.keys[a.id]);
    if (settings.keys[a.id] !== a.def) btn.classList.add('changed');
    btn.onclick = (e) => {
      e.stopPropagation();
      if (listening && listening.action === a.id) return stopListening();
      startListening(a, btn);
    };
    row.append(name, btn);
    list.appendChild(row);
  }
  document.getElementById('keybindMsg').textContent = message;
}

function startListening(action, btn) {
  stopListening();
  listening = { action, btn };
  btn.textContent = 'Press a key or mouse button…';
  btn.classList.add('listening');
  document.getElementById('keybindMsg').textContent = 'Press Esc to cancel.';
  // capture phase, so the game never sees the key we are assigning
  // (the click that opened this has already finished, so the next mouse press is the new binding)
  addEventListener('keydown', onCaptureKey, true);
  addEventListener('mousedown', onCaptureMouse, true);
  addEventListener('contextmenu', blockMenu, true);
}

function stopListening() {
  removeEventListener('keydown', onCaptureKey, true);
  removeEventListener('mousedown', onCaptureMouse, true);
  setTimeout(() => removeEventListener('contextmenu', blockMenu, true), 50);
  if (listening) {
    listening = null;
    renderKeybinds();
  }
}

function blockMenu(e) { e.preventDefault(); e.stopImmediatePropagation(); }

function onCaptureKey(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.code === 'Escape') return stopListening();
  if (RESERVED.has(e.code)) {
    document.getElementById('keybindMsg').textContent = `${keyLabel(e.code)} can't be used. Pick another key.`;
    return;
  }
  assign(e.code);
}

function onCaptureMouse(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  assign('Mouse' + e.button);
}

function assign(code) {
  const { action } = listening;
  const old = settings.keys[action.id];
  let message = `${action.label}: ${keyLabel(code)}`;
  // a key can only do one thing: give the other action this action's old key
  const other = ACTIONS.find((a) => a.id !== action.id && settings.keys[a.id] === code);
  if (other) {
    settings.keys[other.id] = old;
    message += ` (swapped: ${other.label} is now ${keyLabel(old)})`;
  }
  settings.keys[action.id] = code;
  saveSettings();
  removeEventListener('keydown', onCaptureKey, true);
  removeEventListener('mousedown', onCaptureMouse, true);
  setTimeout(() => removeEventListener('contextmenu', blockMenu, true), 50);
  listening = null;
  renderKeybinds(message);
}
