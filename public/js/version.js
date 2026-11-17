// A fingerprint of the game's code, filled in when the game is built (see build.mjs).
// Players can only share a room when their copies match, so nobody plays on a stale page.
/* global __BUILD__ */
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

export const VERSION_MISMATCH =
  'This room is running a different version of the game. Everyone should refresh the page (Ctrl+Shift+R) and try again.';
