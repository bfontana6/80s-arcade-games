// ============================================================
//  HOPPY'S CROSSING  –  8-bit Frogger-style game
//  HTML5 Canvas, Vanilla JS, no dependencies
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ── Layout constants ──────────────────────────────────────
const COLS        = 12;
const ROWS        = 14;
const TILE        = 40;          // px per tile
const W           = COLS * TILE; // 480
const H           = ROWS * TILE; // 560

// Row bands (row index 0 = top)
const SAFE_TOP    = 0;   // 1 row  – home pads row
const WATER_START = 1;   // 4 rows – river
const WATER_END   = 4;
const SAFE_MID    = 5;   // 1 row  – grass median
const ROAD_START  = 6;   // 6 rows – road
const ROAD_END    = 11;
const SAFE_BOT    = 12;  // 2 rows – start area
const START_ROW   = 13;

// ── Colour palette (8-bit inspired) ──────────────────────
const PAL = {
  sky:       '#1a1a2e',
  grass:     '#2d6a2d',
  grassDark: '#1e4d1e',
  road:      '#333344',
  roadLine:  '#ffe066',
  water:     '#1565c0',
  waterDark: '#0d47a1',
  waterFoam: '#90caf9',
  pad:       '#4caf50',
  padBorder: '#ffe066',
  text:      '#ffe066',
  hudBg:     '#0a0a1a',
};

// ── Game state ────────────────────────────────────────────
let state = 'title';
let score = 0, lives = 3, level = 1, highScore = 0, invTimer = 0;
let player = null, obstacles = [], logs = [], homeSlots = [];
let animFrame = 0;
let gameRunning = false;
let keys = {};

// ── DOM refs ─────────────────────────────────────────────
const overlay        = document.getElementById('overlay');
const gameOverScreen = document.getElementById('gameOverScreen');
const levelScreen    = document.getElementById('levelScreen');
const finalScore     = document.getElementById('finalScore');
const levelTitle     = document.getElementById('levelTitle');
const levelSubtitle  = document.getElementById('levelSubtitle');

document.getElementById('startBtn').addEventListener('click',   startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (gameRunning) handleMove(e.key);
});
document.addEventListener('keyup',  e => { keys[e.key] = false; });

// ── Pixel-art sprite drawers ──────────────────────────────

function drawBunny(x, y, squished = false, inv = false) {
  if (inv && Math.floor(Date.now() / 120) % 2 === 0) return;
  const s = TILE;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);

  if (squished) {
    // Squished bunny (just died)
    ctx.fillStyle = '#f8bbd0';
    ctx.fillRect(-s * 0.4, -s * 0.15, s * 0.8, s * 0.3);
    ctx.fillStyle = '#e91e63';
    ctx.fillRect(-s * 0.2, -s * 0.15, s * 0.1, s * 0.05);
    ctx.fillRect( s * 0.1, -s * 0.15, s * 0.1, s * 0.05);
    ctx.restore();
    return;
  }

  // Body
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.4);

  // Head
  ctx.fillRect(-s * 0.22, -s * 0.42, s * 0.44, s * 0.26);

  // Ears
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(-s * 0.2, -s * 0.7, s * 0.12, s * 0.3);
  ctx.fillRect( s * 0.08, -s * 0.7, s * 0.12, s * 0.3);
  ctx.fillStyle = '#f48fb1';
  ctx.fillRect(-s * 0.17, -s * 0.67, s * 0.06, s * 0.24);
  ctx.fillRect( s * 0.11, -s * 0.67, s * 0.06, s * 0.24);

  // Eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(-s * 0.16, -s * 0.35, s * 0.08, s * 0.08);
  ctx.fillRect( s * 0.08, -s * 0.35, s * 0.08, s * 0.08);
  // Eye shine
  ctx.fillStyle = '#fff';
  ctx.fillRect(-s * 0.13, -s * 0.35, s * 0.03, s * 0.03);
  ctx.fillRect( s * 0.11, -s * 0.35, s * 0.03, s * 0.03);

  // Nose
  ctx.fillStyle = '#f48fb1';
  ctx.fillRect(-s * 0.04, -s * 0.24, s * 0.08, s * 0.05);

  // Tail
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s * 0.28, s * 0.0, s * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Feet (animated)
  const hop = Math.floor(animFrame / 4) % 2;
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(-s * 0.28, s * 0.18 + (hop ? s * 0.04 : 0), s * 0.14, s * 0.1);
  ctx.fillRect( s * 0.14, s * 0.18 + (hop ? 0 : s * 0.04), s * 0.14, s * 0.1);

  ctx.restore();
}

function drawCar(x, y, color, dir, type) {
  const s = TILE;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  if (dir < 0) ctx.scale(-1, 1);

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.45, -s * 0.22, s * 0.9, s * 0.44);

  // Roof
  ctx.fillStyle = shadeColor(color, -20);
  ctx.fillRect(-s * 0.28, -s * 0.38, s * 0.56, s * 0.18);

  // Windows
  ctx.fillStyle = '#90caf9';
  ctx.fillRect(-s * 0.24, -s * 0.35, s * 0.2, s * 0.14);
  ctx.fillRect( s * 0.04, -s * 0.35, s * 0.2, s * 0.14);

  // Wheels
  ctx.fillStyle = '#111';
  ctx.fillRect(-s * 0.42, -s * 0.28, s * 0.14, s * 0.1);
  ctx.fillRect(-s * 0.42,  s * 0.18, s * 0.14, s * 0.1);
  ctx.fillRect( s * 0.28, -s * 0.28, s * 0.14, s * 0.1);
  ctx.fillRect( s * 0.28,  s * 0.18, s * 0.14, s * 0.1);
  // Hubcaps
  ctx.fillStyle = '#aaa';
  ctx.fillRect(-s * 0.38, -s * 0.26, s * 0.06, s * 0.06);
  ctx.fillRect(-s * 0.38,  s * 0.20, s * 0.06, s * 0.06);
  ctx.fillRect( s * 0.32, -s * 0.26, s * 0.06, s * 0.06);
  ctx.fillRect( s * 0.32,  s * 0.20, s * 0.06, s * 0.06);

  // Headlights
  ctx.fillStyle = '#fffde7';
  ctx.fillRect( s * 0.42, -s * 0.18, s * 0.05, s * 0.1);
  ctx.fillRect( s * 0.42,  s * 0.08, s * 0.05, s * 0.1);

  ctx.restore();
}

function drawTruck(x, y, color, dir) {
  const s = TILE;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  if (dir < 0) ctx.scale(-1, 1);

  // Cab
  ctx.fillStyle = color;
  ctx.fillRect( s * 0.1, -s * 0.38, s * 0.4, s * 0.76);
  // Cargo
  ctx.fillStyle = shadeColor(color, -30);
  ctx.fillRect(-s * 0.5, -s * 0.3, s * 0.62, s * 0.6);
  // Window
  ctx.fillStyle = '#90caf9';
  ctx.fillRect( s * 0.14, -s * 0.32, s * 0.3, s * 0.22);
  // Wheels
  ctx.fillStyle = '#111';
  [-0.38, 0.22].forEach(oy => {
    ctx.fillRect(-s * 0.44, s * oy, s * 0.16, s * 0.12);
    ctx.fillRect( s * 0.16, s * oy, s * 0.16, s * 0.12);
    ctx.fillRect( s * 0.32, s * oy, s * 0.16, s * 0.12);
  });

  ctx.restore();
}

function drawLog(x, y, w) {
  ctx.save();
  // Log body
  ctx.fillStyle = '#795548';
  ctx.fillRect(x, y + TILE * 0.15, w, TILE * 0.7);
  // Wood grain
  ctx.fillStyle = '#6d4c41';
  for (let i = 0; i < w; i += 16) {
    ctx.fillRect(x + i, y + TILE * 0.15, 2, TILE * 0.7);
  }
  // End caps
  ctx.fillStyle = '#a1887f';
  ctx.fillRect(x,         y + TILE * 0.15, 6, TILE * 0.7);
  ctx.fillRect(x + w - 6, y + TILE * 0.15, 6, TILE * 0.7);
  // Lily pad decoration on some logs
  ctx.fillStyle = '#388e3c';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + TILE * 0.5, TILE * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTurtle(x, y, diving) {
  const s = TILE;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  const alpha = diving ? 0.45 : 1;
  ctx.globalAlpha = alpha;
  // Shell
  ctx.fillStyle = '#33691e';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.35, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#558b2f';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.28, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shell pattern
  ctx.strokeStyle = '#33691e';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-s*0.14, 0); ctx.lineTo(s*0.14, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -s*0.14); ctx.lineTo(0, s*0.14); ctx.stroke();
  // Head
  ctx.fillStyle = '#558b2f';
  ctx.fillRect(s * 0.28, -s * 0.1, s * 0.14, s * 0.2);
  // Eyes
  ctx.fillStyle = '#000';
  ctx.fillRect(s * 0.35, -s * 0.08, s * 0.04, s * 0.04);
  // Flippers
  ctx.fillStyle = '#558b2f';
  ctx.fillRect(-s * 0.44, -s * 0.24, s * 0.12, s * 0.18);
  ctx.fillRect(-s * 0.44,  s * 0.06, s * 0.12, s * 0.18);
  ctx.restore();
}

// ── Background drawers ────────────────────────────────────

function drawBackground() {
  for (let row = 0; row < ROWS; row++) {
    const y = row * TILE;
    if (row === SAFE_TOP) {
      // Home row with pads
      ctx.fillStyle = PAL.grass;
      ctx.fillRect(0, y, W, TILE);
      drawGrassTexture(y);
    } else if (row >= WATER_START && row <= WATER_END) {
      // Water
      const wave = Math.floor(animFrame / 8) % 2;
      ctx.fillStyle = (row % 2 === 0) ? PAL.water : PAL.waterDark;
      ctx.fillRect(0, y, W, TILE);
      // Animated foam lines
      ctx.fillStyle = PAL.waterFoam;
      ctx.globalAlpha = 0.3;
      for (let fx = (wave * 20); fx < W; fx += 40) {
        ctx.fillRect(fx, y + TILE * 0.45, 18, 3);
      }
      ctx.globalAlpha = 1;
    } else if (row === SAFE_MID) {
      ctx.fillStyle = PAL.grass;
      ctx.fillRect(0, y, W, TILE);
      drawGrassTexture(y);
    } else if (row >= ROAD_START && row <= ROAD_END) {
      ctx.fillStyle = PAL.road;
      ctx.fillRect(0, y, W, TILE);
      // Dashed center line
      if (row % 2 === 1) {
        ctx.fillStyle = PAL.roadLine;
        ctx.globalAlpha = 0.4;
        for (let dx = 0; dx < W; dx += 30) {
          ctx.fillRect(dx, y + TILE / 2 - 2, 16, 4);
        }
        ctx.globalAlpha = 1;
      }
    } else {
      // Safe bottom
      ctx.fillStyle = PAL.grass;
      ctx.fillRect(0, y, W, TILE);
      drawGrassTexture(y);
    }
  }
}

function drawGrassTexture(y) {
  ctx.fillStyle = PAL.grassDark;
  for (let tx = 4; tx < W; tx += 16) {
    ctx.fillRect(tx, y + 6, 4, TILE - 12);
  }
}

function drawHomePads() {
  const slotW = Math.floor(W / 5);
  for (let i = 0; i < 5; i++) {
    const px = i * slotW + (slotW - TILE) / 2;
    const py = SAFE_TOP * TILE;
    const filled = homeSlots[i];
    ctx.fillStyle = filled ? PAL.pad : '#1b5e20';
    ctx.fillRect(px, py + 4, TILE, TILE - 8);
    ctx.strokeStyle = PAL.padBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py + 4, TILE, TILE - 8);
    if (filled) {
      // Draw small bunny silhouette
      ctx.fillStyle = '#fff';
      ctx.fillRect(px + 12, py + 10, 16, 20);
      ctx.fillRect(px + 14, py + 6,  6, 10);
      ctx.fillRect(px + 20, py + 6,  6, 10);
    }
  }
}

function drawHUD() {
  const hudH = 0; // HUD is baked into canvas rows
  ctx.fillStyle = PAL.hudBg;
  // Score bar at bottom
  ctx.fillStyle = '#111122';
  ctx.fillRect(0, H - 0, W, 0);

  // Score row uses SAFE_BOT and START rows as visual HUD
  // Draw lives as bunny icons in bottom safe area
  ctx.fillStyle = PAL.text;
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillText(`SCORE: ${score}`, 8, ROAD_END * TILE + TILE + 14);
  ctx.fillText(`HI: ${highScore}`, 8, ROAD_END * TILE + TILE + 30);
  ctx.fillText(`LVL: ${level}`, W - 100, ROAD_END * TILE + TILE + 14);

  // Lives
  for (let i = 0; i < lives; i++) {
    drawMiniRabbit(W - 40 - i * 22, ROAD_END * TILE + TILE + 5);
  }
}

function drawMiniRabbit(x, y) {
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(x + 4,  y,    12, 16);
  ctx.fillRect(x + 6,  y - 8, 4, 10);
  ctx.fillRect(x + 10, y - 8, 4, 10);
  ctx.fillStyle = '#f48fb1';
  ctx.fillRect(x + 7,  y - 7, 2, 7);
  ctx.fillRect(x + 11, y - 7, 2, 7);
}

// ── Level config ──────────────────────────────────────────

function getLevelConfig(lvl) {
  const speed = 0.8 + (lvl - 1) * 0.3;
  return {
    // [row, dir, speed, gap, vehicleType, color]
    road: [
      { row: 6,  dir:  1, speed: speed * 1.0,  gap: 220, type: 'car',   color: '#e53935' },
      { row: 7,  dir: -1, speed: speed * 1.3,  gap: 180, type: 'car',   color: '#1e88e5' },
      { row: 8,  dir:  1, speed: speed * 0.9,  gap: 260, type: 'truck', color: '#fdd835' },
      { row: 9,  dir: -1, speed: speed * 1.5,  gap: 160, type: 'car',   color: '#8e24aa' },
      { row: 10, dir:  1, speed: speed * 1.2,  gap: 190, type: 'car',   color: '#00897b' },
      { row: 11, dir: -1, speed: speed * 0.8,  gap: 240, type: 'truck', color: '#f4511e' },
    ],
    water: [
      { row: 1, dir: -1, speed: speed * 0.7,  len: 3, gap: 100, type: 'log' },
      { row: 2, dir:  1, speed: speed * 0.9,  len: 2, gap: 80,  type: 'turtle', diveInterval: 240 },
      { row: 3, dir: -1, speed: speed * 1.1,  len: 3, gap: 120, type: 'log' },
      { row: 4, dir:  1, speed: speed * 0.6,  len: 4, gap: 90,  type: 'log' },
    ],
  };
}

// ── Obstacle / log spawning ───────────────────────────────

function spawnLane(cfg) {
  const lane = { ...cfg, objects: [] };
  // Stagger initial positions
  let x = -(Math.random() * cfg.gap);
  while (x < W + 200) {
    const w = cfg.len ? cfg.len * TILE : (cfg.type === 'truck' ? TILE * 2 : TILE);
    lane.objects.push({
      x: cfg.dir > 0 ? x - w : W - x,
      w,
      diveTimer: 0,
      diving: false,
    });
    x += w + cfg.gap + Math.random() * 40;
  }
  return lane;
}

function initLevel() {
  const cfg = getLevelConfig(level);
  obstacles = cfg.road.map(spawnLane);
  logs      = cfg.water.map(spawnLane);
  homeSlots = [false, false, false, false, false];

  player = {
    col: 5,
    row: START_ROW,
    x:   5 * TILE,
    y:   START_ROW * TILE,
    riding:   null,
    alive:    true,
    deathAnim: 0,
  };
}

// ── Move handler ──────────────────────────────────────────

let moveCooldown = 0;

function handleMove(key) {
  if (!player.alive || moveCooldown > 0 || state !== 'playing') return;
  let dr = 0, dc = 0;
  if (key === 'ArrowUp'    || key === 'w' || key === 'W') dr = -1;
  if (key === 'ArrowDown'  || key === 's' || key === 'S') dr =  1;
  if (key === 'ArrowLeft'  || key === 'a' || key === 'A') dc = -1;
  if (key === 'ArrowRight' || key === 'd' || key === 'D') dc =  1;
  if (dr === 0 && dc === 0) return;

  const nr = player.row + dr;
  const nc = player.col + dc;
  if (nr < 0 || nr >= ROWS) return;
  if (nc < 0 || nc >= COLS) return;

  player.row = nr;
  player.col = nc;
  player.x   = nc * TILE;
  player.y   = nr * TILE;
  player.riding = null;
  moveCooldown = 6;

  if (dr === -1) score += 10; // reward forward movement

  checkState();
}

// ── Collision & state ─────────────────────────────────────

function checkState() {
  const row = player.row;
  const px  = player.x + TILE * 0.25;
  const pw  = TILE * 0.5;

  // Reached home row
  if (row === SAFE_TOP) {
    const slotW = Math.floor(W / 5);
    const slot  = Math.floor((player.x + TILE / 2) / slotW);
    if (slot < 0 || slot >= 5) { killPlayer(); return; }
    if (homeSlots[slot]) { killPlayer(); return; } // already occupied
    homeSlots[slot] = true;
    score += 100 + level * 20;
    player.row = START_ROW;
    player.col = 5;
    player.x   = 5 * TILE;
    player.y   = START_ROW * TILE;
    if (homeSlots.every(Boolean)) {
      // All home → next level!
      score += 500;
      level++;
      state = 'levelup';
      showLevelScreen();
    }
    return;
  }

  // Water zone – must be on a log/turtle
  if (row >= WATER_START && row <= WATER_END) {
    let onPlatform = false;
    for (const lane of logs) {
      if (lane.row !== row) continue;
      for (const obj of lane.objects) {
        if (obj.diving) continue;
        if (px + pw > obj.x && px < obj.x + obj.w) {
          onPlatform = true;
          player.riding = { lane, obj };
          break;
        }
      }
      if (onPlatform) break;
    }
    if (!onPlatform) { killPlayer(); return; }
  } else {
    player.riding = null;
  }

  // Road zone – check car/truck hit
  if (row >= ROAD_START && row <= ROAD_END) {
    for (const lane of obstacles) {
      if (lane.row !== row) continue;
      for (const obj of lane.objects) {
        if (px + pw > obj.x && px < obj.x + obj.w) {
          killPlayer(); return;
        }
      }
    }
  }
}

function killPlayer() {
  if (!player.alive) return;
  player.alive     = false;
  player.deathAnim = 30;
  lives--;
}

// ── Update loop ───────────────────────────────────────────

function update() {
  animFrame++;
  if (moveCooldown > 0) moveCooldown--;

  if (state !== 'playing') return;

  // Move obstacles
  for (const lane of obstacles) {
    for (const obj of lane.objects) {
      obj.x += lane.dir * lane.speed;
      // Wrap
      if (lane.dir > 0 && obj.x > W + obj.w)  obj.x = -obj.w - 10;
      if (lane.dir < 0 && obj.x < -obj.w - 10) obj.x = W + 10;
    }
  }

  // Move logs / turtles
  for (const lane of logs) {
    for (const obj of lane.objects) {
      obj.x += lane.dir * lane.speed;
      if (lane.dir > 0 && obj.x > W + obj.w)  obj.x = -obj.w - 10;
      if (lane.dir < 0 && obj.x < -obj.w - 10) obj.x = W + 10;

      // Turtle dive
      if (lane.type === 'turtle' && lane.diveInterval) {
        obj.diveTimer++;
        if (obj.diveTimer > lane.diveInterval) obj.diveTimer = 0;
        obj.diving = obj.diveTimer > lane.diveInterval * 0.7;
      }
    }
  }

  // Carry player on log/turtle
  if (player.alive && player.riding) {
    const { lane, obj } = player.riding;
    player.x   += lane.dir * lane.speed;
    player.col  = Math.round(player.x / TILE);
    // fell off screen
    if (player.x < -TILE || player.x > W) {
      killPlayer();
    }
    // Check continuous collision on road (riding is water only, skip)
  }

  // Continuous road collision while moving
  if (player.alive && player.row >= ROAD_START && player.row <= ROAD_END) {
    const px = player.x + TILE * 0.25;
    const pw = TILE * 0.5;
    for (const lane of obstacles) {
      if (lane.row !== player.row) continue;
      for (const obj of lane.objects) {
        if (px + pw > obj.x && px < obj.x + obj.w) {
          killPlayer();
        }
      }
    }
  }

  // Continuous water check (turtle dived under player)
  if (player.alive && player.row >= WATER_START && player.row <= WATER_END) {
    if (player.riding) {
      const { obj } = player.riding;
      if (obj.diving) { killPlayer(); }
    }
  }

  // Death animation countdown
  if (!player.alive) {
    player.deathAnim--;
    if (player.deathAnim <= 0) {
      if (lives <= 0) {
        gameOver();
      } else {
        // Respawn
        player.row    = START_ROW;
        player.col    = 5;
        player.x      = 5 * TILE;
        player.y      = START_ROW * TILE;
        player.alive  = true;
        player.riding = null;
        invTimer      = 120;
      }
    }
  }

  if (invTimer > 0) invTimer--;
  if (score > highScore) highScore = score;
}

// ── Draw ──────────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();

  if (state === 'title') return; // nothing else to draw until game starts

  drawHomePads();

  // Draw logs
  for (const lane of logs) {
    for (const obj of lane.objects) {
      const y = lane.row * TILE;
      if (lane.type === 'log') {
        drawLog(obj.x, y, obj.w);
      } else {
        drawTurtle(obj.x, y, obj.diving);
      }
    }
  }

  // Draw obstacles
  for (const lane of obstacles) {
    for (const obj of lane.objects) {
      const y = lane.row * TILE;
      if (lane.type === 'truck') {
        drawTruck(obj.x, y, lane.color, lane.dir);
      } else {
        drawCar(obj.x, y, lane.color, lane.dir, lane.type);
      }
    }
  }

  // Draw player
  if (player) {
    if (player.deathAnim > 0) {
      drawBunny(player.x, player.y, true);
    } else if (player.alive) {
      drawBunny(player.x, player.y, false, invTimer > 0);
    }
  }

  drawHUD();
}

// ── Game lifecycle ────────────────────────────────────────

function startGame() {
  overlay.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  levelScreen.classList.add('hidden');
  score      = 0;
  lives      = 3;
  level      = 1;
  invTimer   = 0;
  highScore  = highScore || 0;
  state      = 'playing';
  gameRunning = true;
  initLevel();
}

function gameOver() {
  state = 'gameover';
  gameOverScreen.classList.remove('hidden');
  finalScore.innerHTML =
    `SCORE: ${score}<br>HIGH SCORE: ${highScore}<br><br>` +
    (score >= highScore && score > 0 ? 'NEW HIGH SCORE!' : '');
}

function showLevelScreen() {
  levelScreen.classList.remove('hidden');
  levelTitle.textContent   = `LEVEL ${level}`;
  levelSubtitle.textContent = level <= 3 ? 'Faster traffic!' :
                              level <= 6 ? 'Much faster...'  :
                              'Maximum chaos!';
  setTimeout(() => {
    levelScreen.classList.add('hidden');
    initLevel();
    state = 'playing';
  }, 2200);
}

// ── Utility ───────────────────────────────────────────────

function shadeColor(hex, amt) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// ── Main loop ─────────────────────────────────────────────

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Boot
loop();
