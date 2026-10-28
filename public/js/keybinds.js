// Rebindable controls. A binding is a KeyboardEvent.code ("KeyW", "Space", ...) or
// "Mouse0".."Mouse4" for mouse buttons.
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', def: 'KeyW' },
  { id: 'back', label: 'Move back', def: 'KeyS' },
  { id: 'left', label: 'Move left', def: 'KeyA' },
  { id: 'right', label: 'Move right', def: 'KeyD' },
  { id: 'jump', label: 'Jump', def: 'Space' },
  { id: 'sprint', label: 'Sprint (hold)', def: 'ShiftLeft' },
  { id: 'dash', label: 'Dash', def: 'KeyX' },
  { id: 'shoot', label: 'Shoot', def: 'Mouse0' },
  { id: 'aim', label: 'Zoom / aim', def: 'Mouse2' },
  { id: 'reload', label: 'Reload', def: 'KeyR' },
  { id: 'prevWeapon', label: 'Previous gun', def: 'KeyQ' },
  { id: 'scoreboard', label: 'Scoreboard (hold)', def: 'Tab' },
  { id: 'chat', label: 'Chat', def: 'KeyT' },
  ...Array.from({ length: 10 }, (_, i) => ({ id: 'slot' + (i + 1), label: `Hotbar slot ${i + 1}`, def: 'Digit' + ((i + 1) % 10) })),
];

export const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]));

const NAMES = {
  Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', CapsLock: 'Caps Lock', Enter: 'Enter', Backspace: 'Backspace',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Mouse0: 'Left Click', Mouse1: 'Middle Click', Mouse2: 'Right Click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(.+)$/.exec(code))) return 'Num ' + m[1];
  return code.replace(/(Left|Right)$/, ' $1');
}

// Keys the browser doesn't let a web page use for the game.
export const RESERVED = new Set(['Escape', 'F11', 'F12', 'MetaLeft', 'MetaRight']);
