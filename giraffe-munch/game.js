'use strict';

// ─── Canvas Setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const W = 480, H = 520;
const TILE = 40; // each maze cell is 40x40
const COLS = 12, ROWS = 13;

// ─── Palette ─────────────────────────────────────────────────────────────────
const PAL = {
  sky:      '#87ceeb',
  ground:   '#4a3728',
  wall:     '#2d5a1b',
  wallEdge: '#1a3a0f',
  wallTop:  '#3a7a25',
  dirt:     '#8b6914',
  leaf:     '#66bb6a',
  leafAlt:  '#a5d6a7',
  super:    '#ffe066',
  giraffe1: '#f5c842',
  giraffe2: '#c8860a',
  giraffe3: '#3d2b1f',
  lion1:    '#e8a030',
  lion2:    '#c47820',
  lion3:    '#5c3a1a',
  lionMane: '#8b4513',
};

// ─── Maze Layout ─────────────────────────────────────────────────────────────
// 0=path, 1=wall, 2=leaf(dot), 3=super-leaf, 4=giraffe-start, 5=lion-start
// 12 cols x 13 rows
const MAZE_TEMPLATE = [
  [1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,1,2,2,2,2,1],
  [1,3,1,1,2,1,1,2,1,1,3,1],
  [1,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,2,1,1,1,1,2,1,2,1],
  [1,2,1,2,2,2,4,2,2,1,2,1],
  [1,2,1,1,1,0,0,1,1,1,2,1],
  [1,2,2,2,2,5,5,2,2,2,2,1],
  [1,2,1,2,1,1,1,1,2,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,1],
  [1,3,1,1,2,1,1,2,1,1,3,1],
  [1,2,2,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1],
];

// ─── Game State ──────────────────────────────────────────────────────────────
let gameMode = 'vivian';
let state    = 'title'; // title | playing | gameover | win
let score    = 0;
let lives    = 3;
let level    = 1;
let dotsLeft = 0;

let player = null;
let lions  = [];
let dots   = [];
let maze   = [];

let mouthAngle   = 0.2;
let mouthDir     = 1;
let neckBob      = 0;
let frameCount   = 0;

// ─── Audio ───────────────────────────────────────────────────────────────────
let audioCtx = null;
let musicNodes = [];
let musicRunning = false;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, dur, type = 'square', vol = 0.15, delay = 0) {
  if (!audioCtx) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + dur);
  osc.start(audioCtx.currentTime + delay);
  osc.stop(audioCtx.currentTime + delay + dur + 0.01);
}

function playEat() { playTone(880, 0.05, 'square', 0.1); }
function playSuperEat() {
  playTone(440, 0.08, 'square', 0.15);
  playTone(660, 0.12, 'square', 0.15, 0.08);
}
function playDie() {
  [400,300,200,150,100].forEach((f,i) => playTone(f, 0.12, 'sawtooth', 0.2, i*0.1));
}
function playWin() {
  [523,659,784,1047].forEach((f,i) => playTone(f, 0.15, 'square', 0.2, i*0.12));
}

const MELODIES = {
  vivian: [523,587,659,698,784,880,988,1047],
  olivia: [392,440,494,523,587,659,698,784],
  mama:   [330,370,415,440,494,554,622,659],
  dada:   [262,294,330,349,392,440,494,523],
};
const BPM = { vivian:120, olivia:140, mama:160, dada:180 };

function startMusic() {
  if (!audioCtx || musicRunning) return;
  musicRunning = true;
  const mel = MELODIES[gameMode];
  const beat = 60 / BPM[gameMode];
  let i = 0;
  function tick() {
    if (!musicRunning) return;
    const freq = mel[i % mel.length];
    playTone(freq, beat * 0.4, 'square', 0.08);
    i++;
    setTimeout(tick, beat * 1000);
  }
  tick();
}

function stopMusic() { musicRunning = false; }

// ─── Input ───────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// ─── Maze Helpers ────────────────────────────────────────────────────────────
function buildMaze() {
  maze = MAZE_TEMPLATE.map(row => [...row]);
  dots = [];
  dotsLeft = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = maze[r][c];
      if (v === 2 || v === 3) {
        dots.push({ r, c, super: v === 3, eaten: false });
        dotsLeft++;
        maze[r][c] = 0; // treat as open path with dot overlay
      }
      if (v === 4 || v === 5) maze[r][c] = 0;
    }
  }
}

function isWall(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
  return maze[r][c] === 1;
}

function cellCenter(r, c) {
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}

// ─── Player ──────────────────────────────────────────────────────────────────
function createPlayer() {
  const { x, y } = cellCenter(11, 5); // start bottom, far from lions
  return {
    x, y,
    targetR: 11, targetC: 5,
    dir: { dx: 0, dy: 0 },
    nextDir: { dx: 0, dy: 0 },
    speed: { vivian: 1.5, olivia: 2.0, mama: 3.5, dada: 4.0 }[gameMode],
    alive: true,
    invTimer: 180,
    moving: false,
  };
}

function getPlayerDir() {
  if (keys['ArrowUp']    || keys['w'] || keys['W']) return { dx:  0, dy: -1 };
  if (keys['ArrowDown']  || keys['s'] || keys['S']) return { dx:  0, dy:  1 };
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) return { dx: -1, dy:  0 };
  if (keys['ArrowRight'] || keys['d'] || keys['D']) return { dx:  1, dy:  0 };
  return null;
}

function updatePlayer() {
  if (!player.alive) return;
  if (player.invTimer > 0) player.invTimer--;

  const inp = getPlayerDir();
  if (inp) player.nextDir = inp;

  // Tile-based movement: snap to grid, then move toward next tile
  const { x, y } = cellCenter(player.targetR, player.targetC);
  const dx = x - player.x, dy = y - player.y;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (dist < player.speed) {
    // Arrived at target cell
    player.x = x; player.y = y;

    // Try next direction first, then current
    const dirs = [player.nextDir, player.dir].filter(d => d.dx !== 0 || d.dy !== 0);
    let moved = false;
    for (const d of dirs) {
      const nr = player.targetR + d.dy;
      const nc = player.targetC + d.dx;
      if (!isWall(nr, nc)) {
        player.targetR = nr; player.targetC = nc;
        player.dir = d;
        moved = true;
        break;
      }
    }
    player.moving = moved;

    // Tunnel wrap (row 6 only — ghost house row)
    if (player.targetC < 0) player.targetC = COLS - 1;
    if (player.targetC >= COLS) player.targetC = 0;

    // Eat dot
    const dot = dots.find(d => !d.eaten && d.r === player.targetR && d.c === player.targetC);
    if (dot) {
      dot.eaten = true;
      dotsLeft--;
      score += dot.super ? 50 : 10;
      if (dot.super) { playSuperEat(); frightenLions(); }
      else playEat();
      if (dotsLeft === 0) { triggerWin(); return; }
    }
  } else {
    // Move toward target
    player.x += (dx / dist) * player.speed;
    player.y += (dy / dist) * player.speed;
    player.moving = true;
  }
}

// ─── Lions (Ghosts) ──────────────────────────────────────────────────────────
const LION_COLORS = ['#e8a030','#e84040','#40c0e8','#e880c0'];
const LION_NAMES  = ['Simba','Nala','Mufasa','Scar'];

function createLion(r, c, idx) {
  return {
    r, c, x: cellCenter(r,c).x, y: cellCenter(r,c).y,
    targetR: r, targetC: c,
    dir: { dx: 1, dy: 0 },
    speed: { vivian: 0.7, olivia: 1.1, mama: 2.4, dada: 3.0 }[gameMode],
    frightened: false,
    frightenTimer: 0,
    color: LION_COLORS[idx],
    name: LION_NAMES[idx],
    alive: true,
    eyeFrame: 0,
  };
}

function frightenLions() {
  lions.forEach(l => {
    l.frightened = true;
    l.frightenTimer = 600; // frames (~10 seconds at 60fps)
    // Reverse direction
    l.dir = { dx: -l.dir.dx, dy: -l.dir.dy };
  });
}

function lionAI(lion) {
  const { x, y } = cellCenter(lion.targetR, lion.targetC);
  const dx = x - lion.x, dy = y - lion.y;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (dist < lion.speed) {
    lion.x = x; lion.y = y;

    // Choose next direction
    const dirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ];
    // Remove reverse
    const valid = dirs.filter(d => {
      if (d.dx === -lion.dir.dx && d.dy === -lion.dir.dy) return false;
      return !isWall(lion.targetR + d.dy, lion.targetC + d.dx);
    });

    let chosen;
    if (valid.length === 0) {
      // Dead end — reverse
      chosen = { dx: -lion.dir.dx, dy: -lion.dir.dy };
    } else if (lion.frightened) {
      // Random movement when frightened
      chosen = valid[Math.floor(Math.random() * valid.length)];
    } else {
      // Chase: pick direction that minimizes distance to player
      const pr = player.targetR, pc = player.targetC;
      chosen = valid.reduce((best, d) => {
        const nr = lion.targetR + d.dy, nc = lion.targetC + d.dx;
        const dist = Math.abs(nr - pr) + Math.abs(nc - pc);
        const bdist = Math.abs(lion.targetR + best.dy - pr) + Math.abs(lion.targetC + best.dx - pc);
        return dist < bdist ? d : best;
      });
    }

    lion.dir = chosen;
    lion.targetR += chosen.dy;
    lion.targetC += chosen.dx;
    if (lion.targetC < 0) lion.targetC = COLS - 1;
    if (lion.targetC >= COLS) lion.targetC = 0;
  } else {
    lion.x += (dx / dist) * lion.speed;
    lion.y += (dy / dist) * lion.speed;
  }

  if (lion.frightenTimer > 0) {
    lion.frightenTimer--;
    if (lion.frightenTimer === 0) lion.frightened = false;
  }
}

function checkCollisions() {
  if (!player.alive || player.invTimer > 0) return;
  lions.forEach(lion => {
    const pdx = player.x - lion.x, pdy = player.y - lion.y;
    if (Math.sqrt(pdx*pdx + pdy*pdy) < 20) {
      if (lion.frightened) {
        // Eat the lion
        lion.frightened = false;
        lion.frightenTimer = 0;
        score += 200;
        const { x, y } = cellCenter(7, 5);
        lion.x = x; lion.y = y;
        lion.targetR = 7; lion.targetC = 5;
        playTone(1047, 0.1, 'square', 0.2);
      } else {
        killPlayer();
      }
    }
  });
}

function killPlayer() {
  if (!player.alive) return;
  player.alive = false;
  stopMusic();
  playDie();
  lives--;
  setTimeout(() => {
    if (lives <= 0) {
      state = 'gameover';
      showScreen('gameOverScreen');
      document.getElementById('finalScore').innerHTML =
        `Score: ${score}<br>Level: ${level}`;
    } else {
      respawnPlayer();
    }
  }, 1200);
}

function respawnPlayer() {
  const { x, y } = cellCenter(11, 5);
  player.x = x; player.y = y;
  player.targetR = 11; player.targetC = 5;
  player.dir = { dx: 0, dy: 0 };
  player.alive = true;
  player.invTimer = 180;
  // Reset lions to corners
  const lionStarts = [[1,1],[1,10],[3,5],[3,6]];
  lions.forEach((l, i) => {
    const [sr, sc] = lionStarts[i];
    const { x: lx, y: ly } = cellCenter(sr, sc);
    l.x = lx; l.y = ly;
    l.targetR = sr; l.targetC = sc;
    l.frightened = false; l.frightenTimer = 0;
  });
  startMusic();
}

function triggerWin() {
  state = 'win';
  stopMusic();
  playWin();
  showScreen('winScreen');
  document.getElementById('winScore').innerHTML =
    `Score: ${score}<br>Level: ${level}`;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawMaze() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      if (maze[r][c] === 1) {
        // Wall — draw as hedgerow / bush
        ctx.fillStyle = PAL.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PAL.wallTop;
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE * 0.45);
        ctx.fillStyle = PAL.wallEdge;
        ctx.fillRect(x, y + TILE - 4, TILE, 4);
        // Leaf bumps
        ctx.fillStyle = PAL.wallTop;
        for (let bx = x + 4; bx < x + TILE - 4; bx += 10) {
          ctx.beginPath();
          ctx.arc(bx + 3, y + 6, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Path — savanna dirt
        ctx.fillStyle = '#3a2a14';
        ctx.fillRect(x, y, TILE, TILE);
        // Subtle texture lines
        ctx.fillStyle = '#2e2010';
        ctx.fillRect(x, y + TILE - 2, TILE, 2);
      }
    }
  }
}

function drawDots() {
  dots.forEach(d => {
    if (d.eaten) return;
    const cx = d.c * TILE + TILE / 2;
    const cy = d.r * TILE + TILE / 2;
    if (d.super) {
      // Super leaf — animated
      const pulse = 0.85 + 0.15 * Math.sin(frameCount * 0.1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      // Leaf shape
      ctx.fillStyle = PAL.super;
      ctx.beginPath();
      ctx.ellipse(0, -2, 8, 11, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8a000';
      ctx.fillRect(-1, -10, 2, 12);
      ctx.restore();
    } else {
      // Small leaf dot
      ctx.fillStyle = PAL.leaf;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

function drawGiraffe(x, y) {
  ctx.save();
  ctx.translate(x, y);

  const bob = player.moving ? Math.sin(frameCount * 0.25) * 2 : 0;

  // ── Body ──
  ctx.fillStyle = PAL.giraffe1;
  ctx.fillRect(-12, -8 + bob, 24, 16);
  // Spots on body
  ctx.fillStyle = PAL.giraffe2;
  ctx.fillRect(-8, -5 + bob, 6, 6);
  ctx.fillRect(3, -2 + bob, 5, 5);
  ctx.fillRect(-4, 4 + bob, 4, 4);

  // ── Neck ──
  ctx.fillStyle = PAL.giraffe1;
  ctx.fillRect(-5, -22 + bob, 10, 18);
  // Neck spot
  ctx.fillStyle = PAL.giraffe2;
  ctx.fillRect(-3, -18 + bob, 5, 5);
  ctx.fillRect(0, -11 + bob, 4, 4);

  // ── Head ──
  ctx.fillStyle = PAL.giraffe1;
  ctx.fillRect(-9, -34 + bob, 18, 14);
  // Ossicones (horns)
  ctx.fillStyle = PAL.giraffe3;
  ctx.fillRect(-6, -42 + bob, 3, 10);
  ctx.fillRect(3, -42 + bob, 3, 10);
  // Horn tips
  ctx.fillStyle = PAL.giraffe2;
  ctx.fillRect(-6, -44 + bob, 3, 3);
  ctx.fillRect(3, -44 + bob, 3, 3);

  // ── Face ──
  // Eye
  ctx.fillStyle = '#fff';
  ctx.fillRect(4, -32 + bob, 6, 6);
  ctx.fillStyle = PAL.giraffe3;
  ctx.fillRect(6, -31 + bob, 3, 3);
  ctx.fillStyle = '#fff';
  ctx.fillRect(7, -31 + bob, 1, 1);

  // Nostril
  ctx.fillStyle = PAL.giraffe3;
  ctx.fillRect(6, -22 + bob, 2, 2);

  // ── Mouth / chomp ──
  const mOpen = player.moving ? (mouthAngle > 0.1 ? 6 : 2) : 2;
  ctx.fillStyle = PAL.giraffe3;
  ctx.fillRect(2, -23 + bob, 8, 2); // top lip
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(2, -23 + mOpen + bob, 8, 2); // tongue / bottom lip

  // ── Legs ──
  ctx.fillStyle = PAL.giraffe1;
  const legSwing = player.moving ? Math.sin(frameCount * 0.3) * 4 : 0;
  ctx.fillRect(-10, 8 + bob + legSwing, 5, 10);
  ctx.fillRect(-2, 8 + bob - legSwing, 5, 10);
  ctx.fillRect(5, 8 + bob + legSwing, 5, 10);
  // Hooves
  ctx.fillStyle = PAL.giraffe3;
  ctx.fillRect(-10, 16 + bob, 5, 3);
  ctx.fillRect(-2, 16 + bob, 5, 3);
  ctx.fillRect(5, 16 + bob, 5, 3);

  // ── Tail ──
  ctx.fillStyle = PAL.giraffe2;
  ctx.fillRect(-14, 0 + bob, 3, 8);
  ctx.fillStyle = PAL.giraffe3;
  ctx.fillRect(-14, 7 + bob, 3, 4);

  // Invincibility flash
  if (player.invTimer > 0 && Math.floor(frameCount / 4) % 2 === 0) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-14, -44 + bob, 30, 60);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawUnicorn(x, y) {
  ctx.save();
  ctx.translate(x, y);

  const bob = player.moving ? Math.sin(frameCount * 0.25) * 2 : 0;
  const legSwing = player.moving ? Math.sin(frameCount * 0.3) * 4 : 0;
  // Rainbow cycle for mane/tail
  const hue = (frameCount * 3) % 360;

  // ── Body ──
  ctx.fillStyle = '#f8f0ff';
  ctx.fillRect(-12, -8 + bob, 24, 16);
  // Sparkle spots
  ctx.fillStyle = `hsl(${hue}, 100%, 80%)`;
  ctx.fillRect(-7, -5 + bob, 4, 4);
  ctx.fillStyle = `hsl(${(hue+120)%360}, 100%, 80%)`;
  ctx.fillRect(4, 0 + bob, 4, 4);

  // ── Neck ──
  ctx.fillStyle = '#f8f0ff';
  ctx.fillRect(-5, -22 + bob, 10, 18);

  // ── Mane (rainbow stripes down neck) ──
  ['#ff6eb4','#ffb347','#ffe066','#66ff99','#66cfff','#cc99ff'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(4, -20 + bob + i * 3, 3, 4);
  });

  // ── Head ──
  ctx.fillStyle = '#f8f0ff';
  ctx.fillRect(-9, -34 + bob, 18, 14);

  // ── Horn (single spiraling rainbow) ──
  const hornColors = ['#ff6eb4','#ffb347','#ffe066','#66ff99','#66cfff','#cc99ff'];
  for (let s = 0; s < 6; s++) {
    ctx.fillStyle = hornColors[s];
    ctx.fillRect(1, -50 + bob + s * 3, 4 - Math.floor(s * 0.5), 4);
  }
  // Horn tip sparkle
  ctx.fillStyle = '#fff';
  ctx.fillRect(2, -52 + bob, 3, 3);

  // ── Face ──
  // Eye (big with lashes)
  ctx.fillStyle = '#fff';
  ctx.fillRect(3, -32 + bob, 7, 7);
  ctx.fillStyle = '#9b59b6';
  ctx.fillRect(5, -31 + bob, 4, 4);
  ctx.fillStyle = '#000';
  ctx.fillRect(5, -31 + bob, 2, 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(5, -31 + bob, 1, 1);
  // Lashes
  ctx.fillStyle = '#333';
  ctx.fillRect(3, -33 + bob, 2, 2);
  ctx.fillRect(6, -33 + bob, 2, 2);
  ctx.fillRect(9, -33 + bob, 2, 2);

  // Rosy cheek
  ctx.fillStyle = 'rgba(255,150,180,0.5)';
  ctx.fillRect(3, -26 + bob, 6, 4);

  // Nostril
  ctx.fillStyle = '#d4a0c0';
  ctx.fillRect(7, -22 + bob, 2, 2);

  // ── Mouth / chomp ──
  const mOpen = player.moving ? (mouthAngle > 0.1 ? 6 : 2) : 2;
  ctx.fillStyle = '#d4a0c0';
  ctx.fillRect(2, -23 + bob, 8, 2);
  ctx.fillStyle = '#ff9eb5';
  ctx.fillRect(2, -23 + mOpen + bob, 8, 2);

  // ── Legs ──
  ctx.fillStyle = '#f8f0ff';
  ctx.fillRect(-10, 8 + bob + legSwing, 5, 10);
  ctx.fillRect(-2, 8 + bob - legSwing, 5, 10);
  ctx.fillRect(5, 8 + bob + legSwing, 5, 10);
  // Hooves
  ctx.fillStyle = `hsl(${hue}, 80%, 70%)`;
  ctx.fillRect(-10, 16 + bob, 5, 3);
  ctx.fillRect(-2, 16 + bob, 5, 3);
  ctx.fillRect(5, 16 + bob, 5, 3);

  // ── Rainbow tail ──
  ['#ff6eb4','#ffb347','#ffe066','#66ff99','#66cfff','#cc99ff'].forEach((c, i) => {
    ctx.fillStyle = c;
    const wave = Math.sin(frameCount * 0.15 + i * 0.5) * 2;
    ctx.fillRect(-16 + wave, -2 + bob + i * 2, 4, 3);
  });

  // Invincibility flash
  if (player.invTimer > 0 && Math.floor(frameCount / 4) % 2 === 0) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-16, -52 + bob, 32, 72);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawPlayer(x, y) {
  if (gameMode === 'vivian') drawUnicorn(x, y);
  else drawGiraffe(x, y);
}

function drawLion(lion) {
  ctx.save();
  ctx.translate(lion.x, lion.y);

  const bob = Math.sin(frameCount * 0.2 + lions.indexOf(lion)) * 2;

  if (lion.frightened) {
    // Frightened — draw crouching lion in blue
    const flash = lion.frightenTimer < 150 && Math.floor(frameCount / 6) % 2;
    const col = flash ? '#fff' : '#4488ff';
    // Body (crouched)
    ctx.fillStyle = col;
    ctx.fillRect(-12, -6, 24, 14);
    // Head
    ctx.fillRect(-8, -16, 16, 12);
    // Eyes (worried)
    ctx.fillStyle = '#fff';
    ctx.fillRect(-5, -14, 4, 4);
    ctx.fillRect(2, -14, 4, 4);
    ctx.fillStyle = col === '#fff' ? '#000' : '#fff';
    ctx.fillRect(-4, -13, 2, 2);
    ctx.fillRect(3, -13, 2, 2);
    // Wavy mouth
    ctx.fillStyle = '#fff';
    ctx.fillRect(-4, -8, 2, 2);
    ctx.fillRect(0, -6, 2, 2);
    ctx.fillRect(3, -8, 2, 2);
  } else {
    const col = lion.color;
    // Body
    ctx.fillStyle = col;
    ctx.fillRect(-13, -8 + bob, 26, 16);
    // Head
    ctx.fillRect(-10, -22 + bob, 20, 16);
    // Mane
    ctx.fillStyle = PAL.lionMane;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      ctx.fillRect(
        Math.cos(a) * 12 - 3 - 0,
        Math.sin(a) * 11 - 15 + bob,
        6, 6
      );
    }
    // Face
    ctx.fillStyle = '#fff';
    ctx.fillRect(-5, -20 + bob, 5, 5);
    ctx.fillRect(2, -20 + bob, 5, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(-4, -19 + bob, 3, 3);
    ctx.fillRect(3, -19 + bob, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3, -19 + bob, 1, 1);
    ctx.fillRect(4, -19 + bob, 1, 1);
    // Nose
    ctx.fillStyle = PAL.lion2;
    ctx.fillRect(-3, -13 + bob, 6, 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(-2, -12 + bob, 2, 2);
    ctx.fillRect(1, -12 + bob, 2, 2);
    // Tail
    ctx.fillStyle = col;
    ctx.fillRect(13, 0 + bob, 4, 8);
    ctx.fillStyle = PAL.lionMane;
    ctx.fillRect(12, 7 + bob, 6, 5);
    // Legs
    ctx.fillStyle = col;
    ctx.fillRect(-10, 8 + bob, 5, 8);
    ctx.fillRect(-2, 8 + bob, 5, 8);
    ctx.fillRect(5, 8 + bob, 5, 8);
    ctx.fillStyle = PAL.lion3;
    ctx.fillRect(-10, 14 + bob, 5, 3);
    ctx.fillRect(-2, 14 + bob, 5, 3);
    ctx.fillRect(5, 14 + bob, 5, 3);
  }

  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#ffe066';
  ctx.font = '10px "Press Start 2P"';
  ctx.fillText(`SCORE: ${score}`, 8, H - 8);
  // Lives as giraffe heads
  for (let i = 0; i < lives; i++) {
    const lx = W - 30 - i * 28;
    ctx.fillStyle = PAL.giraffe1;
    ctx.fillRect(lx - 6, H - 20, 12, 10);
    ctx.fillRect(lx - 3, H - 28, 6, 10);
    ctx.fillStyle = PAL.giraffe3;
    ctx.fillRect(lx - 4, H - 30, 2, 4);
    ctx.fillRect(lx + 2, H - 30, 2, 4);
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────
function update() {
  if (state !== 'playing') return;
  frameCount++;

  // Mouth animation
  mouthAngle += 0.15 * mouthDir;
  if (mouthAngle > 0.4 || mouthAngle < 0.05) mouthDir *= -1;

  updatePlayer();
  lions.forEach(l => lionAI(l));
  checkCollisions();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (state === 'title') {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  drawMaze();
  drawDots();
  if (player && player.alive) drawPlayer(player.x, player.y);
  lions.forEach(l => drawLion(l));
  drawHUD();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ─── Start Game ──────────────────────────────────────────────────────────────
function startGame(mode) {
  gameMode = mode;
  score = 0;
  level = 1;
  lives = { vivian: 7, olivia: 5, mama: 3, dada: 3 }[mode];

  buildMaze();
  player = createPlayer();
  lions = [
    createLion(1, 1, 0),
    createLion(1, 10, 1),
    createLion(3, 5, 2),
    createLion(3, 6, 3),
  ];

  state = 'playing';
  hideAllScreens();
  initAudio();
  startMusic();
}

// ─── Screen Helpers ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
function hideAllScreens() {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
}

// ─── Button Wiring ───────────────────────────────────────────────────────────
[
  ['btnVivian','vivian'],['btnOlivia','olivia'],['btnMama','mama'],['btnDada','dada'],
  ['goVivian','vivian'], ['goOlivia','olivia'], ['goMama','mama'], ['goDada','dada'],
  ['winVivian','vivian'],['winOlivia','olivia'],['winMama','mama'],['winDada','dada'],
].forEach(([id, mode]) => {
  document.getElementById(id).addEventListener('click', () => startGame(mode));
});

// ─── Kick off ────────────────────────────────────────────────────────────────
loop();
