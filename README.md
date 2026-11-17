# Block Blitz

A blocky, multiplayer first-person shooter that runs in the web browser.
Free-for-all deathmatch: create a room, share the 5-character code, and the player with the most kills when the timer runs out wins.

**Nothing to install.** The person who creates a room hosts it right in their browser, and everyone else connects to them directly.

## Play

- **Website:** <https://mgamer11.github.io/FPS-Game/> (after GitHub Pages is turned on, see below)
- **Or offline file:** download [`BlockBlitz.html`](BlockBlitz.html) and double-click it. Send the same file to friends.
- **Alone?** Click **PRACTICE VS BOTS** on the home screen. It needs no internet, and you choose how many bots and how good they are.

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

These are the defaults. You can change any of them in **Settings → Keybinds** (click a control, then press a key or mouse button).

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift (hold) | Sprint |
| Space | Jump (1 block high) |
| X | Dash in the direction you're facing |
| C | Crouch (hold). Tap it while sprinting to slide |
| Left mouse | Shoot |
| Right mouse | Zoom / aim (sniper uses a scope) |
| R | Reload |
| G | Throw a grenade (2 per life) |
| 1–9, 0 or mouse wheel | Pick a gun from your 10-slot hotbar (Q = previous gun) |
| Tab | Scoreboard |
| T or Enter | Chat |
| Esc | Pause / settings / room code and invite link |

## Features

- **10 maps:** Meadow Village, Dune Outpost, Frostbite, Downtown, Timber Woods, Red Canyon, Lost Temple, Harbor, Magma Core, Army Base. Choose **Random** when creating a room to get a new random map every match.
- **10 weapons:** Pistol (you always have it), plus Assault Rifle, SMG, Shotgun, Sniper, LMG, Revolver, Marksman Rifle, Burst Rifle and Rocket Launcher lying on the ground. Walk over a gun to add it to your 10-slot hotbar (walking over one you already have refills its ammo). Picked-up guns come back after 18 seconds.
- Everyone has 100 HP. Only the Sniper, a headshot, or a Shotgun blast at point-blank range (3 blocks or closer) can take out a full-health player in one shot.
- **Combat feedback:** damage numbers pop out of whoever you hit (gold for headshots), kill streaks get a callout (Double Kill, Killing Spree, Rampage...), the screen edges pulse and you hear a heartbeat at 30 health or less, and you can hear footsteps nearby. Crouch-walking is silent.
- **Weather:** snow in Frostbite, rain in Downtown, embers in Magma Core, dust in the deserts, falling leaves in Timber Woods. It doesn't fall through roofs, and it can be turned off in Settings.
- **Levels:** you earn XP for kills (100, or 50 for a bot), headshots (+25), finishing a match (50) and winning (300). Your level and lifetime stats are saved in your browser and shown on the home screen; your level also shows on the scoreboard.
- **Hats:** cap, headband, beanie, cowboy hat, helmet, top hat, viking helmet and crown. They unlock at levels 1 to 15, you pick one on the home screen, and everyone in the match sees it.
- **Minimap:** shows the map, you, your teammates, guns (yellow) and health packs. Enemies appear on it for a moment when they shoot. It can be turned off in Settings.
- **Crouch and slide:** crouching makes you a smaller target and steadies your aim but slows you down; sliding is a quick low burst of speed.
- **Grenades:** two per life. They bounce off blocks and explode after about two seconds. Like rockets, one grenade can't take out a full-health player.
- **Health packs:** five on every map. Walk over one when you're hurt to get 50 health back; they return after 22 seconds.
- Every building can be entered, with stairs to upper floors and flat roofs.
- Headshots, health regeneration after 5 seconds out of combat, kill feed, scoreboard, chat, rocket jumping, and lava that hurts (Magma Core).
- The game goes fullscreen when you click into it (so the Windows taskbar and browser bars can't cover the screen), and the HUD and menus resize to fit small or short windows. Both can be adjusted in Settings (Fullscreen While Playing, HUD Size).
- **Two modes:** Free-for-all, or Team Deathmatch (Red vs Blue, no friendly fire, teams are re-dealt every match and you can always see your teammates' names).
- **Bots:** computer players (Easy, Normal or Hard) for practice, or to fill up an online room. A bot gives up its place when a real player joins a full room.
- **Host controls:** whoever created the room gets a **Room** tab in the pause menu (Esc): add or remove bots, change their difficulty, start a new match on any map, mode or length, and remove a player.
- Room settings: match time (3–15 min), map, and max players (2–16). Room codes are random and can never clash with another open room.

## For tinkerers

- `public/`: the game source. `public/js/roomhost.js` is the room "server" that runs in the host's browser; `public/js/net.js` connects browsers with WebRTC (PeerJS).
- `public/js/shared/maps.js`: the map generator. Each map is built from a fixed seed, so everyone sees the same world.
- `public/js/shared/weapons.js`: weapon stats.
- `npm install && npm run build` bundles everything into `dist/index.html` and `BlockBlitz.html`. `npm start` builds and serves it at http://localhost:3000.
