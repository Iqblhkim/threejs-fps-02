# SABLE BREACH — BUILD NOTES (threejs-fps-02, $1,000)

Entry for make.fun bounty "Make the best three.js tactical FPS" (slug
`threejs-fps-02`, ends Mon 16 Nov 2026 21:30 UTC = Tue 17 Nov 2026 04:30 WIB).
Workspace: `~/workspace/makefun/threejs-fps-01/`. Built 16 Nov 2026, ~06:15–08:00 WIB.
Status: BUILD COMPLETE, tested, screenshots done. NOT submitted — parent does
repo + bundle + submit.

## The game

**SABLE BREACH** — a round-based tactical FPS in the Counter-Strike style,
set in "SABLE YARD", a dusk desert freight yard (44×36 m, three lanes:
A-long north, B-short south, mid). 5v5: the player + 4 SABLE bot teammates
(attackers, amber) vs 5 VULTURE bot defenders (red). First to 7 rounds
(max 13). A round is won by eliminating the enemy team, detonating the
planted spike, or (defenders) defusing it / running the clock out with no
plant. Freeze 5 s (buy), round 100 s, bomb 35 s, plant 3.2 s, defuse 5 s.

- **Objective:** plant the spike at Site A or Site B (hold E in the site
  while carrying it). The player carries the spike at round start; if the
  player dies, the nearest SABLE bot picks it up and plants; defenders
  rotate to the planted site and defuse.
- **Economy:** start $800, kill +$300, round win +$3,250, loss +$1,900
  (+$500 per loss in a row, max $3,400), plant +$300. Buy menu (B, freeze
  only, keys 1–7): VK-47 rifle $2,700, VIPER SMG $1,500, BREACHER shotgun
  $1,100, LONGSHOT sniper $4,750 (right-click scope, 2.6×), P2000 pistol
  (free start), FRAG $300, SMOKE $300 (blocks bot line of sight), KEVLAR
  $650 (absorbs half of all damage).
- **Gunplay:** hitscan with head hitbox (4× damage, 3× shotgun), recoil +
  bloom, spread that grows while moving/firing and shrinks when crouched,
  scoped, or standing still; walk (Shift) vs run; crouch (Ctrl/C); jump
  (Space); AABB map collision; tracers, muzzle flash, impact sparks.
- **Bots:** waypoint nav graph (22 nodes, BFS paths) over the three lanes;
  roles (rush A / rush B / mid / hold A / hold B / roam); sight (120° cone,
  46 m, staggered line-of-sight raycasts) with 0.25–0.5 s reaction delay;
  hearing (gunshots within 26 m, defenders only investigate close sounds);
  burst fire (3–5 rounds, pauses), strafing in fights, retreat-to-site
  holds, rotation on plant, bomb pickup / plant / defuse, one frag grenade
  each thrown at a hidden enemy they heard.
- **Presentation:** three.js 0.187.0, procedural canvas textures (concrete,
  corrugated containers, steel, hazard stripes), dusk sun + shadows, fog,
  skyline silhouettes, floating A/B site markers, low-poly bot models with
  team-coloured visors, viewmodel gun with bob + recoil kick, full HUD
  (health/armor bar, ammo, money, round timer, team score, alive counts,
  kill feed, bomb status, dynamic crosshair, hitmarker, damage flash),
  synthesised WebAudio SFX (per-weapon shots, reload, hit, plant beeps,
  explosion, win/lose stingers). No network, no assets, no build step.

## Controls

WASD move · Mouse look (pointer lock; Enter or click also starts if lock is
unavailable) · Click fire · R reload · 1/2/4/5 weapon slots · G throw
grenade · E plant the spike (hold) · B buy menu (freeze only, keys 1–7) ·
Shift walk · Ctrl/C crouch · Space jump · Right-click scope (LONGSHOT).

## Files (repo contents — parent creates the repo from these)

- `main.ts` — entrypoint: copies `game/` + `screenshots/` to /output,
  writes `dossier.json` via the vendored library. Written by this session.
- `serve.ts` — static dev server for `game/` (`node serve.ts`, port 8080).
- `shots.json` — the 4 screenshot definitions.
- `LICENSE` — MIT (copied from the kit starter, unchanged).
- `vendor/makefun-threejs.ts` — copied from the kit, byte-identical.
- `game/index.html` — import map (`three` → `./vendor/three/three.module.min.js`) + HUD.
- `game/src/` — 13 modules, one job each: `config.js` (palette/weapons/
  economy/bot tuning), `rng.js` (seeded RNG), `map.js` (yard layout, nav
  graph, BFS), `world.js` (scene/textures/lights), `actor.js` (shared
  player/bot physics, hitboxes, health/armour), `weapons.js` (loadout state
  machine), `combat.js` (hitscan, tracers, grenades, smoke, LOS),
  `bot.js` (AI), `match.js` (rounds/economy/bomb), `audio.js` (synth SFX),
  `input.js` (keyboard/mouse/pointer lock), `hud.js` (DOM), `main.js`
  (boot, fixed 60 Hz sim, shot modes, `window.__sable` debug handle).
- `game/vendor/three/` — three.js 0.187.0 files copied byte-for-byte from
  the kit (sha256 `ef510bae…` / `613e370f…`, verified against kit.json).
- `screenshots/` — 4 real renders (see below).

NOT for the repo: `threejs-fps-02-kit/` + `threejs-fps-02-kit.tar.gz`
(the kit), `tests/` (Node unit tests), `out/` (local dossier-build output),
this file. Parent still needs to write `README.md` (three live make.fun
badges for threejs-fps-02, link to the bounty page, no {owner} placeholders)
and set the GitHub About (website on make.fun, topic `makefun`).

## Transcript / recording situation

**STANDARD bundle, not strict transcripts.** The requirements contain no
`strict_transcripts` entry (verified by searching the requirements JSON and
RULES.txt). No live `record` command is needed. This whole build happened
in this one Muse app session, which the parent bundles with usage rows
exactly like best-game-01. Competition opened 2026-11-14T21:30:00Z; this
session started after that, so `thinking_in_window` is satisfied. Entries
received before 2026-11-17T00:00:00Z skip the run-record check as a note,
but the bundle writes one anyway.

## Tests (all run locally 16 Nov 2026)

- **Unit tests** `tests/unit.mjs` — `node --test tests/unit.mjs`:
  **20/20 pass** (seeded RNG, nav graph reachability + no waypoint inside a
  box, weapon fire/reload/buy/spread, match freeze→live, kill payout,
  elimination/plant-detonate/defuse/bomb-drop-pickup, first-to-7 match end).
  Two real bugs found and fixed by these tests: defender hold waypoints
  (13,±14) sat inside the site containers (moved to (11,±13), spawns too).
- **Headless play-test** `~/workspace/makefun/best-game-01-tools/fps-playtest.mjs`
  (Playwright + chrome-headless-shell, `?lowfx=1`, 320×180): **12/12 PASS**
  — title screen, 5v5, P2000 13 rounds, Enter starts the game, B opens the
  buy menu, buying Kevlar spends $650 (money 800→150, armor 100), freeze
  ends into round 1, WASD moves the player (2.95 m), click fires one round
  (mag 13→12), bots move (1.79 m), round timer counts down (99→98), no
  player death early, **zero console/page errors**.
  Note: SwiftShader is fill-rate bound here (960×540 ≈ 3 FPS, 320×180 ≈
  17 FPS) — the sim is capped at 5 fixed steps/frame, so the play-test
  runs at 320×180 + `?lowfx=1` (no shadows/antialiasing) to keep the sim
  at real-time speed. Screenshots are unaffected (they use direct stepping).
- **Raycast check**: after hiding the player's own body mesh (see below),
  a ray at the player still hits (`hit: true, part: body, actorIsPlayer:
  true, groupVisible: false`) — bots can still shoot the player.
- **Dossier build**: `MAKEFUN_OUTPUT_DIR=out node main.ts` — dossier.json
  **415,158 bytes** (< 1.5 MiB); 4 screenshots (43,955 / 57,207 / 46,764 /
  72,068 bytes, each < 256 KiB); game/ 2,251,476 bytes, 20 files/dirs
  (< 48 MiB, < 993); **source text 116,688 bytes, under the 163,840 cap,
  so the judge reads all of it**; zero `http(s)://` references in game/.

## Bugs found and fixed during testing

1. **Player's own visor filled the screen** — the camera sits inside the
   player's head mesh, so the amber visor (0.04 m above eye level) rendered
   as a giant yellow rectangle. Fixed: the player's group is hidden
   (`Actor.reset` sets `visible = !isPlayer`); the viewmodel gun is the
   visible weapon. Verified raycasts still hit the invisible player.
2. **Play button did nothing in headless** — `hud.onPlay` was passed in the
   constructor object but never wired to the button. Fixed: `hud.onPlay(onPlayButton)`
   called explicitly. Also added: game starts immediately on Play/Enter
   even if pointer lock fails (lock is best-effort); mouse fire works
   without lock when the click lands on the canvas.
3. **Bots moved during freeze time** — fixed: bots only update in `live`.
4. **Scripted play-shot missed both times** — `combat.shoot` raycast
   against stale matrices (no render had run yet). Fixed: `shoot()` calls
   `scene.updateMatrixWorld(true)` first (same as the starter). The shot
   now tracks the bot's live position; verified target HP 100→30.
5. **Banner/hitmarker vanished before the capture** — wall-clock timeouts
   (3.2 s / 120 ms) expired during SwiftShader shader compile (~10 s to
   first paint). Fixed: in `?shot=` mode they hold 30 s.
6. **Buy-menu key badges lied** — they showed weapon-slot keys (1/1/1/2/2)
   instead of buy keys, and LONGSHOT had no buy key. Fixed: buy keys are
   1–7 (1 VK-47, 2 VIPER, 3 BREACHER, 4 LONGSHOT, 5 FRAG, 6 SMOKE,
   7 KEVLAR); number keys buy while the menu is open instead of switching.
7. **Viewmodel too dominant** — scaled 0.8×, moved out/down, angled
   slightly inward.

## Screenshots (real renders, 1280×720, JPEG q88)

- `1-start.jpg` (43,955 B) — title screen over the yard at spawn.
- `2-buy.jpg` (57,207 B) — buy menu open during freeze ($4,000, all items
  with prices, P2000 OWNED, LONGSHOT dimmed as unaffordable).
- `3-play.jpg` (46,764 B) — mid-round firefight: crosshair + amber
  hitmarker on a VULTURE bot, ammo 11/52, Round 4, 2–1, 1:02 left.
- `4-end.jpg` (72,068 B) — "SABLE WINS THE ROUND / VULTURE team
  eliminated" banner over Site A, 3–1, one fallen defender visible.

## What the parent still has to do

1. Create the public GitHub repo (after 2026-11-14T21:30:00Z — now), push
   the files listed above (NOT the kit, tests/, out/, or this file).
2. README.md with the three live badges for threejs-fps-02 + About
   (website https://make.fun/bounty/threejs-fps-02, topic `makefun`).
3. Bundle this session's transcripts with usage rows (`--muse-usage`),
   run the kit's `makefun check`, then submit **signed** (escrowed $1,000)
   before Tue 17 Nov 2026 04:30 WIB. Save the claim code to
   `~/workspace/makefun/claim-codes.md`. Never claim without the user.

## Open notes / limitations

- The scene is deliberately dark dusk; the north wall reads near-black in
  stills. It plays fine and the judge sees the same lighting in the
  screenshots — brightening further would wash out the palette.
- Bots never buy armour and never use smoke; the player does both. Bot
  grenades are frag-only, thrown at last-heard positions.
- No side switch at half-time (single half, first to 7). No bomb-defuse
  kit. No weapon dropping (G throws the selected grenade).
- `?lowfx=1` (no shadows/antialiasing) exists only for the headless
  play-test; normal play and the screenshots use full quality.
