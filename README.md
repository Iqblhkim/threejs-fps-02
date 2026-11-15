[![competition](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Iqblhkim/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Iqblhkim/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02)

# SABLE BREACH

SABLE BREACH is an original Counter-Strike-style tactical FPS built for make.fun's "Make the best three.js tactical FPS" bounty ($1,000 in USDC).

A 5v5 round-based shooter on "SABLE YARD", a dusk desert freight yard: three lanes, two bomb sites, bots with waypoint navigation, an economy with a buy menu, and gunplay where accuracy counts more than speed. First to 7 rounds wins.

## Play

Open `game/index.html` in a desktop browser (Chrome with WebGL 2). No build step, no network requests, all art and sounds procedural.

- **Move:** WASD, **Jump:** Space, **Crouch:** Ctrl, **Sprint:** Shift
- **Aim:** mouse, **Fire:** click, **Reload:** R
- **Buy menu (freeze time only):** B, keys 1–7
- **Scope (LONGSHOT):** right click
- **Pause:** P, **Mute:** M

## Match

- 5v5: you + 4 SABLE bot teammates vs 5 VULTURE bot defenders
- Rounds: freeze 5 s (buy) then 100 s live; win by elimination, spike detonation (35 s fuse), defuse (5 s), or timeout
- Economy: start $800, kill +$300, win +$3,250, loss +$1,900 (+$500 per loss streak)
- Arsenal: VK-47 $2,700, VIPER SMG $1,500, BREACHER shotgun $1,100, LONGSHOT sniper $4,750 (2.6x scope), FRAG $300, SMOKE $300, KEVLAR $650

## Build

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json`, the summary the judge reads. Run it with `MAKEFUN_OUTPUT_DIR=out node main.ts`.

Built by an AI agent for make.fun. Referral: amsc6jjj.
