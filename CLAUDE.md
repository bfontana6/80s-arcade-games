# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running Games

No build step — open any game's `index.html` directly in a browser or serve with:

```bash
npx serve .
```

## Architecture

Each game lives in its own subdirectory (e.g. `hoppy-crossing/`) and is entirely self-contained:

```
game-name/
  index.html   # shell, screens (start/gameover/levelup), loads game.js
  style.css    # 8-bit aesthetic using "Press Start 2P" Google Font
  game.js      # all game logic — single file, no dependencies
```

### game.js structure (Hoppy's Crossing pattern)

- **Constants** at top: tile size, row band indices, colour palette
- **State** variables: `score`, `lives`, `level`, `player`, `obstacles`, `logs`, `homeSlots`
- **Sprite drawers**: pure-canvas pixel-art functions (`drawBunny`, `drawCar`, `drawTruck`, `drawLog`, `drawTurtle`)
- **Background drawers**: `drawBackground()`, `drawHomePads()`, `drawHUD()`
- **Level config**: `getLevelConfig(lvl)` returns road/water lane descriptors; speed scales with level
- **Spawning**: `spawnLane(cfg)` seeds objects across the lane with random gaps
- **Update loop**: moves lanes, carries player on platforms, checks collisions, handles death/respawn
- **Draw loop**: background → logs → vehicles → player → HUD
- **Lifecycle**: `startGame()`, `gameOver()`, `showLevelScreen()` toggle overlay `<div>` visibility

### Key design decisions

- **Tile grid**: 12 cols × 14 rows at 40px each (480×560 canvas). Player snaps to grid on move; platforms move continuously between moves.
- **Row bands**: rows 0=home pads, 1–4=water, 5=grass median, 6–11=road, 12–13=safe start zone.
- **No sprite sheets**: all graphics are drawn procedurally with `ctx.fillRect` / `ctx.arc` for true 8-bit feel and zero asset dependencies.
- **Carrying mechanic**: `player.riding` holds a reference to the lane + object; player x is offset each frame by the platform's speed/direction.
- **Invincibility frames**: `invTimer` counts down after respawn; bunny blinks via skipping draw on alternating frames.

## Adding a New Game

1. Create `new-game-name/` with `index.html`, `style.css`, `game.js`
2. Add an entry to the root `README.md` table
3. Follow the same single-file `game.js` pattern — keep all logic in one file per game

## GitHub

Repo: https://github.com/bfontana6/80s-arcade-games
