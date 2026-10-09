# Block Blitz

A blocky, Poxel.io-style multiplayer first-person shooter that runs in the web browser.
Free-for-all deathmatch: create a room, share the 5-character code, and the player with the most kills when the timer runs out wins.

**Nothing to install.** The person who creates a room hosts it right in their browser, and everyone else connects to them directly.

## Play

- **Website:** <https://mgamer11.github.io/FPS-Game/> (after GitHub Pages is turned on, see below)
- **Or offline file:** download [`BlockBlitz.html`](BlockBlitz.html) and double-click it. Send the same file to friends.

Then:

1. Pick a name and color, click **JOIN OR CREATE → Create Room**.
2. Press **Esc** in the game to see the room code and an **invite link**. Send it to your friends.
3. Friends click the link (or open the game, choose **Join Room** and type the code).

Online play needs an internet connection. If the person who created the room leaves or closes their tab, the game ends for everyone, so the host should stay until the match is over.

### Turning on the website (one time)

1. On GitHub, open this repository → **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment → Branch**, choose **`gh-pages`** and **`/ (root)`**, then click **Save**.
3. Wait 1–2 minutes. The site is live at <https://mgamer11.github.io/FPS-Game/>.

Whenever the code changes, a GitHub Action rebuilds the site automatically.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift (hold) | Sprint |
| Space | Jump (1 block high) |
| X | Dash in the direction you're facing |
| Left mouse | Shoot |
| Right mouse | Zoom / aim (sniper uses a scope) |
| R | Reload |
| 1 / 2, Q or mouse wheel | Switch between your picked-up gun and your pistol |
| Tab | Scoreboard |
| T or Enter | Chat |
| Esc | Pause / settings / room code and invite link |

## Features

- **10 maps:** Meadow Village, Dune Outpost, Frostbite, Downtown, Timber Woods, Red Canyon, Lost Temple, Harbor, Magma Core, Army Base. Choose **Random** when creating a room to get a new random map every match.
- **8 weapons:** Pistol (you always have it), plus Assault Rifle, SMG, Shotgun, Sniper, LMG, Revolver and Rocket Launcher lying on the ground. Walk over a gun to pick it up. Picked-up guns come back after 18 seconds.
- Everyone has 100 HP. Only the Sniper, a headshot, or a Shotgun blast at point-blank range (3 blocks or closer) can take out a full-health player in one shot.
- Every building can be entered, with stairs to upper floors and flat roofs.
- Headshots, health regeneration after 5 seconds out of combat, kill feed, scoreboard, chat, rocket jumping, and lava that hurts (Magma Core).
- Room settings: match time (3–15 min), map, and max players (2–16). Room codes are random and can never clash with another open room.

## For tinkerers

- `public/`: the game source. `public/js/roomhost.js` is the room "server" that runs in the host's browser; `public/js/net.js` connects browsers with WebRTC (PeerJS).
- `public/js/shared/maps.js`: the map generator. Each map is built from a fixed seed, so everyone sees the same world.
- `public/js/shared/weapons.js`: weapon stats.
- `npm install && npm run build` bundles everything into `dist/index.html` and `BlockBlitz.html`. `npm start` builds and serves it at http://localhost:3000.
