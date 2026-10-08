# Block Blitz

A blocky, Poxel.io-style multiplayer first-person shooter that runs in the web browser.
Free-for-all deathmatch: create a room, share the 5-character code, and the player with the most kills when the timer runs out wins.

## How to play (the quick version)

1. Install **Node.js** (the "LTS" version) from <https://nodejs.org>. You only need to do this once.
2. Start the game server:
   - **Windows:** double-click `start-windows.bat`
   - **Mac:** double-click `start-mac.command` (if macOS blocks it: right-click → Open → Open)
   - **Any computer (terminal):** run `npm install` once, then `npm start`
3. Your browser opens at <http://localhost:3000>. Pick a name and color, click **JOIN OR CREATE**, then **Create Room**.
4. Give your friends the **room code** shown at the top of the screen (also in the ESC menu).

Keep the black server window open while you play. Close it (or press Ctrl+C) to stop the server.

## Playing with friends

**Same Wi-Fi / LAN:** when the server starts it prints a line like

```
Same Wi-Fi/LAN:    http://192.168.1.23:3000
```

Friends on the same network open that address in their browser, click **JOIN OR CREATE → Join Room**, and type the code.
On Windows, the first time you start the server a firewall popup appears. Click **Allow access** or friends can't connect.

**Over the internet (friends somewhere else):** put the game on a free host such as [Render](https://render.com):

1. Make a free Render account and sign in with GitHub.
2. Click **New → Web Service** and pick this repository.
3. Set **Build Command** to `npm install` and **Start Command** to `npm start`, choose the free plan, and click **Create**.
4. After a few minutes Render gives you a link like `https://block-blitz.onrender.com`. Everyone opens that link, and one person creates a room.

(Free Render servers go to sleep when nobody is playing. The first visit afterwards takes about a minute to wake it up.)

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
| Esc | Pause / settings (sensitivity, FOV, volume, and more) |

## Features

- **10 maps:** Meadow Village, Dune Outpost, Frostbite, Downtown, Timber Woods, Red Canyon, Lost Temple, Harbor, Magma Core, Army Base. Choose **Random** when creating a room to get a new random map every match.
- **8 weapons:** Pistol (you always have it), plus Assault Rifle, SMG, Shotgun, Sniper, LMG, Revolver and Rocket Launcher lying on the ground. Walk over a gun to pick it up. Picked-up guns come back after 18 seconds.
- Every building can be entered, with stairs to upper floors and flat roofs.
- Everyone has 100 HP. Only the Sniper, a headshot, or a Shotgun blast at point-blank range (3 blocks or closer) can take out a full-health player in one shot. The server enforces this too.
- Headshots, health regeneration after 5 seconds out of combat, kill feed, scoreboard, chat, rocket jumping, and lava that hurts (Magma Core).
- Room settings: match time (3–15 min), map, and max players (2–16). Room codes are random and never clash with another open room.

## For tinkerers

- `server.js`: the game server (rooms, codes, damage, pickups, match timer).
- `public/js/shared/maps.js`: the map generator. Each map is built from a fixed seed, so everyone sees the same world.
- `public/js/shared/weapons.js`: weapon stats (damage, fire rate, ammo...).
- `public/js/game.js`: the in-game logic, HUD and effects.
- Use a different port with `PORT=8080 npm start`.
