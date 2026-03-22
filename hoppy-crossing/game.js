// ============================================================
//  HOPPY'S CROSSING  –  8-bit animal arcade game
//  Modes: Vivian (bunny) | Olivia (chameleon) | Mama (sloth, jungle) | Dada (penguin, arctic)
//  HTML5 Canvas + Web Audio API, no dependencies
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ── Layout constants ──────────────────────────────────────
const COLS        = 12;
const ROWS        = 14;
const TILE        = 40;
const W           = COLS * TILE; // 480
const H           = ROWS * TILE; // 560

const SAFE_TOP    = 0;
const WATER_START = 1;
const WATER_END   = 4;
const SAFE_MID    = 5;
const ROAD_START  = 6;
const ROAD_END    = 11;
const START_ROW   = 13;

// ── Palette ───────────────────────────────────────────────
const PAL = {
  grass: '#2d6a2d', grassDark: '#1e4d1e',
  road:  '#333344', roadLine:  '#ffe066',
  water: '#1565c0', waterDark: '#0d47a1', waterFoam: '#90caf9',
  pad:   '#4caf50', padBorder: '#ffe066',
  text:  '#ffe066',
  // Mama jungle
  jungleFloor: '#163b18', jungleDark: '#0d2910',
  junglePath:  '#3e2723', junglePathLine: '#6d4c41',
  jungleRiver: '#1b5e20', jungleRiverDark: '#0a3d0a', jungleRiverFoam: '#a5d6a7',
  // Dada arctic
  snow:  '#dceefb', snowDark: '#b0d4f1',
  tundra:'#b0bec5', tundraLine:'#eceff1',
  arctic:'#0d2b5e', arcticDark:'#091f45', arcticFoam:'#b3e5fc',
};

// ── Game state ────────────────────────────────────────────
let gameMode    = 'mama';
let state       = 'title';
let score       = 0, lives = 3, level = 1, highScore = 0, invTimer = 0;
let player      = null, obstacles = [], logs = [], homeSlots = [];
let animFrame   = 0, gameRunning = false, keys = {};
let moveCooldown = 0;

// ── DOM refs ──────────────────────────────────────────────
const overlay        = document.getElementById('overlay');
const gameOverScreen = document.getElementById('gameOverScreen');
const levelScreen    = document.getElementById('levelScreen');
const finalScoreEl   = document.getElementById('finalScore');
const levelTitle     = document.getElementById('levelTitle');
const levelSubtitle  = document.getElementById('levelSubtitle');

[['btnVivian','vivian'],['btnOlivia','olivia'],['btnMama','mama'],['btnDada','dada'],
 ['goVivian', 'vivian'],['goOlivia', 'olivia'],['goMama', 'mama'],['goDada', 'dada']
].forEach(([id, mode]) => document.getElementById(id).addEventListener('click', () => startGame(mode)));

document.addEventListener('keydown', e => { keys[e.key] = true;  if (gameRunning) handleMove(e.key); });
document.addEventListener('keyup',   e => { keys[e.key] = false; });

// ── Music & SFX ───────────────────────────────────────────
let audioCtx   = null;
let musicTimer = null;
let noteIdx    = 0;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, t, dur, vol = 0.08, type = 'square') {
  const ac = getAudio();
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.connect(gain); gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.01);
}

// Chiptune melodies per mode (frequencies, 0 = rest)
const MELODIES = {
  vivian: [330,294,262,294, 330,330,0,0, 294,294,0,0, 330,392,392,0,
           262,294,330,392, 330,294,262,0, 294,330,262,0, 0,0,0,0],
  olivia: [330,392,440,392, 330,0,294,330, 392,440,494,440, 392,330,0,0,
           262,330,392,440, 392,330,262,0, 330,294,262,0,   0,0,0,0],
  mama:   [392,440,392,0, 349,392,330,0, 294,330,349,0, 392,0,0,0,
           440,494,440,0, 392,440,349,0, 330,349,392,0, 440,0,0,0],
  dada:   [220,262,220,0, 196,220,175,0, 196,262,220,0, 175,0,0,0,
           220,175,196,0, 220,262,294,0, 262,220,196,0, 175,0,0,0],
};
const MELODY_BPM = { vivian: 108, olivia: 148, mama: 138, dada: 126 };

function startMusic() {
  stopMusic();
  const melody = MELODIES[gameMode];
  const beat   = (60 / MELODY_BPM[gameMode]) * 0.5;
  noteIdx = 0;
  musicTimer = setInterval(() => {
    const freq = melody[noteIdx % melody.length];
    if (freq > 0) {
      const ac = getAudio();
      playTone(freq, ac.currentTime, beat * 0.75, 0.06);
    }
    noteIdx++;
  }, beat * 1000);
}

function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

function sfxHop() {
  const ac = getAudio();
  playTone(660, ac.currentTime, 0.05, 0.1);
}
function sfxDie() {
  const ac = getAudio();
  [660, 440, 330, 220].forEach((f, i) => playTone(f, ac.currentTime + i * 0.07, 0.07, 0.12));
}
function sfxScore() {
  const ac = getAudio();
  [523, 659, 784].forEach((f, i) => playTone(f, ac.currentTime + i * 0.06, 0.07, 0.1));
}
function sfxLevelUp() {
  const ac = getAudio();
  [523, 659, 784, 1047].forEach((f, i) => playTone(f, ac.currentTime + i * 0.09, 0.09, 0.12));
}

// ── Sprite: Bunny (Vivian) ────────────────────────────────
function drawBunny(x, y, squished, inv) {
  if (inv && Math.floor(Date.now() / 120) % 2 === 0) return;
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (squished) {
    ctx.fillStyle = '#f8bbd0';
    ctx.fillRect(-s*0.4,-s*0.15,s*0.8,s*0.3);
    ctx.restore(); return;
  }
  // Body
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(-s*0.3,-s*0.2,s*0.6,s*0.4);
  // Head
  ctx.fillRect(-s*0.22,-s*0.42,s*0.44,s*0.26);
  // Ears
  ctx.fillRect(-s*0.2,-s*0.7,s*0.12,s*0.3);
  ctx.fillRect(s*0.08,-s*0.7,s*0.12,s*0.3);
  ctx.fillStyle = '#f48fb1';
  ctx.fillRect(-s*0.17,-s*0.67,s*0.06,s*0.24);
  ctx.fillRect(s*0.11,-s*0.67,s*0.06,s*0.24);
  // Eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(-s*0.16,-s*0.35,s*0.08,s*0.08);
  ctx.fillRect(s*0.08,-s*0.35,s*0.08,s*0.08);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-s*0.13,-s*0.35,s*0.03,s*0.03);
  ctx.fillRect(s*0.11,-s*0.35,s*0.03,s*0.03);
  // Nose
  ctx.fillStyle = '#f48fb1';
  ctx.fillRect(-s*0.04,-s*0.24,s*0.08,s*0.05);
  // Tail
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(s*0.28,0,s*0.1,0,Math.PI*2); ctx.fill();
  // Feet
  const hop = Math.floor(animFrame/4) % 2;
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(-s*0.28, s*0.18+(hop?s*0.04:0),  s*0.14, s*0.1);
  ctx.fillRect( s*0.14, s*0.18+(hop?0:s*0.04),  s*0.14, s*0.1);
  ctx.restore();
}

// ── Sprite: Chameleon (Olivia) ────────────────────────────
function drawChameleon(x, y, squished, inv) {
  if (inv && Math.floor(Date.now() / 120) % 2 === 0) return;
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (squished) {
    ctx.fillStyle = '#66bb6a';
    ctx.fillRect(-s*0.45,-s*0.12,s*0.9,s*0.24);
    ctx.restore(); return;
  }
  // Tail (behind body)
  ctx.fillStyle = '#4caf50';
  ctx.fillRect(-s*0.48,-s*0.04,s*0.14,s*0.18);
  ctx.fillRect(-s*0.44, s*0.1, s*0.12,s*0.12);
  ctx.fillRect(-s*0.38, s*0.18,s*0.1, s*0.1);
  // Body
  ctx.fillStyle = '#4caf50';
  ctx.fillRect(-s*0.36,-s*0.16,s*0.68,s*0.32);
  // Dorsal ridge bumps
  ctx.fillStyle = '#2e7d32';
  for (let i = 0; i < 5; i++) ctx.fillRect(-s*0.32+i*s*0.14, -s*0.24, s*0.09, s*0.1);
  // Head
  ctx.fillStyle = '#4caf50';
  ctx.fillRect(s*0.24,-s*0.22,s*0.3,s*0.3);
  // Head crest
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(s*0.28,-s*0.3,s*0.08,s*0.1);
  ctx.fillRect(s*0.36,-s*0.26,s*0.06,s*0.08);
  // Big eye
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(s*0.42,-s*0.09,s*0.1,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffe082';
  ctx.beginPath(); ctx.arc(s*0.42,-s*0.09,s*0.06,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(s*0.44,-s*0.09,s*0.03,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(s*0.44,-s*0.12,s*0.02,s*0.02);
  // Tongue (flicks every ~30 frames)
  if (Math.floor(animFrame / 22) % 4 === 0) {
    ctx.fillStyle = '#e91e63';
    ctx.fillRect(s*0.52,-s*0.06,s*0.2,s*0.04);
    ctx.beginPath(); ctx.arc(s*0.72,-s*0.04,s*0.04,0,Math.PI*2); ctx.fill();
  }
  // Legs
  ctx.fillStyle = '#388e3c';
  const hop = Math.floor(animFrame/4) % 2;
  ctx.fillRect(-s*0.14, s*0.16+(hop?s*0.04:0), s*0.1, s*0.14);
  ctx.fillRect( s*0.1,  s*0.16+(hop?0:s*0.04), s*0.1, s*0.14);
  ctx.restore();
}

// ── Sprite: Sloth (Mama) ──────────────────────────────────
function drawSloth(x, y, squished, inv) {
  if (inv && Math.floor(Date.now() / 120) % 2 === 0) return;
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (squished) {
    ctx.fillStyle = '#bcaaa4';
    ctx.fillRect(-s*0.44,-s*0.12,s*0.88,s*0.24);
    ctx.restore(); return;
  }
  // Long arms reaching out (sloths hang/crawl with arms spread)
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(-s*0.48,-s*0.28,s*0.18,s*0.12); // left arm
  ctx.fillRect( s*0.3, -s*0.28,s*0.18,s*0.12); // right arm
  // Curved claws left
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(-s*0.48,-s*0.3, s*0.06,s*0.16);
  ctx.fillRect(-s*0.42,-s*0.3, s*0.06,s*0.18);
  // Curved claws right
  ctx.fillRect( s*0.36,-s*0.3, s*0.06,s*0.16);
  ctx.fillRect( s*0.42,-s*0.3, s*0.06,s*0.18);
  // Body (round, fluffy)
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(-s*0.3,-s*0.24,s*0.6,s*0.48);
  // Lighter belly fur
  ctx.fillStyle = '#bcaaa4';
  ctx.fillRect(-s*0.2,-s*0.18,s*0.4,s*0.36);
  // Dark mask on face
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(-s*0.24,-s*0.44,s*0.48,s*0.24);
  // Lighter face center
  ctx.fillStyle = '#bcaaa4';
  ctx.fillRect(-s*0.16,-s*0.42,s*0.32,s*0.2);
  // Sleepy half-closed eyes
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.14,-s*0.36,s*0.1,s*0.05); // left eye (half closed)
  ctx.fillRect( s*0.04,-s*0.36,s*0.1,s*0.05); // right eye
  ctx.fillStyle = '#fff';
  ctx.fillRect(-s*0.13,-s*0.38,s*0.04,s*0.03);
  ctx.fillRect( s*0.05,-s*0.38,s*0.04,s*0.03);
  // Small nose
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(-s*0.04,-s*0.28,s*0.08,s*0.06);
  // Lazy smile
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(-s*0.1,-s*0.22,s*0.06,s*0.03);
  ctx.fillRect( s*0.04,-s*0.22,s*0.06,s*0.03);
  // Hind legs dangling
  const sway = Math.floor(animFrame / 20) % 2;
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(-s*0.22, s*0.22+(sway?s*0.04:0), s*0.14,s*0.18);
  ctx.fillRect( s*0.08, s*0.22+(sway?0:s*0.04), s*0.14,s*0.18);
  ctx.restore();
}

// ── Sprite: Penguin (Dada) ────────────────────────────────
function drawPenguin(x, y, squished, inv) {
  if (inv && Math.floor(Date.now() / 120) % 2 === 0) return;
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (squished) {
    ctx.fillStyle = '#212121';
    ctx.fillRect(-s*0.4,-s*0.1,s*0.8,s*0.2);
    ctx.restore(); return;
  }
  // Black body
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.26,-s*0.34,s*0.52,s*0.6);
  // White belly
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(-s*0.17,-s*0.26,s*0.34,s*0.46);
  // Head
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.22,-s*0.46,s*0.44,s*0.24);
  // White face patch
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(-s*0.15,-s*0.43,s*0.3,s*0.18);
  // Eyes
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.12,-s*0.4,s*0.07,s*0.07);
  ctx.fillRect( s*0.05,-s*0.4,s*0.07,s*0.07);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-s*0.1,-s*0.4,s*0.03,s*0.03);
  ctx.fillRect( s*0.07,-s*0.4,s*0.03,s*0.03);
  // Orange beak
  ctx.fillStyle = '#ff9800';
  ctx.fillRect(-s*0.07,-s*0.3,s*0.14,s*0.09);
  // Wings
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.38,-s*0.2,s*0.12,s*0.32);
  ctx.fillRect( s*0.26,-s*0.2,s*0.12,s*0.32);
  // Feet (waddle)
  const w = Math.floor(animFrame/6) % 2;
  ctx.fillStyle = '#ff9800';
  ctx.fillRect(-s*0.2, s*0.22+(w?s*0.04:0), s*0.16,s*0.09);
  ctx.fillRect( s*0.04, s*0.22+(w?0:s*0.04), s*0.16,s*0.09);
  ctx.restore();
}

// Dispatch to the right animal
function drawPlayer(x, y, squished = false, inv = false) {
  if (gameMode === 'vivian') return drawBunny(x, y, squished, inv);
  if (gameMode === 'olivia') return drawChameleon(x, y, squished, inv);
  if (gameMode === 'mama')   return drawSloth(x, y, squished, inv);
  if (gameMode === 'dada')   return drawPenguin(x, y, squished, inv);
}

// ── Vehicle sprites (Vivian / Olivia / Mama) ─────────────
function drawCar(x, y, color, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(-s*0.45,-s*0.22,s*0.9,s*0.44);
  ctx.fillStyle = shadeColor(color, -20);
  ctx.fillRect(-s*0.28,-s*0.38,s*0.56,s*0.18);
  ctx.fillStyle = '#90caf9';
  ctx.fillRect(-s*0.24,-s*0.35,s*0.2,s*0.14);
  ctx.fillRect( s*0.04,-s*0.35,s*0.2,s*0.14);
  ctx.fillStyle = '#111';
  ctx.fillRect(-s*0.42,-s*0.28,s*0.14,s*0.1);
  ctx.fillRect(-s*0.42, s*0.18,s*0.14,s*0.1);
  ctx.fillRect( s*0.28,-s*0.28,s*0.14,s*0.1);
  ctx.fillRect( s*0.28, s*0.18,s*0.14,s*0.1);
  ctx.fillStyle = '#fffde7';
  ctx.fillRect(s*0.42,-s*0.18,s*0.05,s*0.1);
  ctx.fillRect(s*0.42, s*0.08,s*0.05,s*0.1);
  ctx.restore();
}

function drawTruck(x, y, color, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(s*0.1,-s*0.38,s*0.4,s*0.76);
  ctx.fillStyle = shadeColor(color, -30);
  ctx.fillRect(-s*0.5,-s*0.3,s*0.62,s*0.6);
  ctx.fillStyle = '#90caf9';
  ctx.fillRect(s*0.14,-s*0.32,s*0.3,s*0.22);
  ctx.fillStyle = '#111';
  [-0.38, 0.22].forEach(oy => {
    ctx.fillRect(-s*0.44, s*oy, s*0.16, s*0.12);
    ctx.fillRect( s*0.16, s*oy, s*0.16, s*0.12);
    ctx.fillRect( s*0.32, s*oy, s*0.16, s*0.12);
  });
  ctx.restore();
}

// ── Arctic obstacle sprites (Dada mode) ──────────────────
function drawSeal(x, y, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.fillStyle = '#9e9e9e';
  ctx.fillRect(-s*0.42,-s*0.17,s*0.68,s*0.34);
  ctx.fillStyle = '#bdbdbd';
  ctx.fillRect(s*0.2,-s*0.22,s*0.28,s*0.3);
  ctx.fillStyle = '#212121';
  ctx.fillRect(s*0.34,-s*0.14,s*0.06,s*0.06);
  ctx.fillStyle = '#fff';
  ctx.fillRect(s*0.35,-s*0.14,s*0.02,s*0.02);
  // Whiskers
  ctx.fillStyle = '#eee';
  ctx.fillRect(s*0.44,-s*0.09,s*0.12,s*0.02);
  ctx.fillRect(s*0.44,-s*0.04,s*0.12,s*0.02);
  ctx.fillRect(s*0.44, s*0.01,s*0.12,s*0.02);
  // Flippers
  ctx.fillStyle = '#757575';
  ctx.fillRect(s*0.04, s*0.14,s*0.18,s*0.1);
  ctx.fillRect(-s*0.48,-s*0.1,s*0.1,s*0.2);
  ctx.restore();
}

function drawSeaLion(x, y, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(-s*0.44,-s*0.22,s*0.78,s*0.44);
  ctx.fillStyle = '#a1887f';
  ctx.fillRect(s*0.26,-s*0.28,s*0.26,s*0.36);
  // Mane
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(s*0.18,-s*0.32,s*0.2,s*0.12);
  // Eye
  ctx.fillStyle = '#212121';
  ctx.fillRect(s*0.36,-s*0.18,s*0.08,s*0.08);
  ctx.fillStyle = '#fff';
  ctx.fillRect(s*0.37,-s*0.18,s*0.03,s*0.03);
  // Flippers
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(s*0.08, s*0.18,s*0.24,s*0.12);
  ctx.fillRect(-s*0.5,-s*0.12,s*0.12,s*0.24);
  ctx.restore();
}

function drawShark(x, y, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Body
  ctx.fillStyle = '#546e7a';
  ctx.fillRect(-s*0.44,-s*0.08,s*0.88,s*0.28);
  // Underbelly
  ctx.fillStyle = '#eceff1';
  ctx.fillRect(-s*0.38, s*0.04,s*0.76,s*0.14);
  // Dorsal fin
  ctx.fillStyle = '#455a64';
  ctx.fillRect(-s*0.06,-s*0.38,s*0.14,s*0.32);
  ctx.fillRect( s*0.08,-s*0.24,s*0.08,s*0.18);
  // Eye
  ctx.fillStyle = '#000';
  ctx.fillRect(s*0.28,-s*0.04,s*0.08,s*0.08);
  // Teeth
  ctx.fillStyle = '#fff';
  [0.36, 0.42, 0.48].forEach(ox => ctx.fillRect(s*ox, s*0.04, s*0.04, s*0.06));
  // Tail
  ctx.fillStyle = '#546e7a';
  ctx.fillRect(-s*0.48,-s*0.14,s*0.1,s*0.12);
  ctx.fillRect(-s*0.48, s*0.04,s*0.1,s*0.12);
  ctx.restore();
}

function drawOrca(x, y, dir) {
  const s = TILE; // orca spans 2 tiles; translate to center of object
  ctx.save(); ctx.translate(x + s, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Black body
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.88,-s*0.3,s*1.76,s*0.6);
  // White belly
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(-s*0.52,-s*0.2,s*0.82,s*0.38);
  // White eye patch
  ctx.fillRect(s*0.38,-s*0.25,s*0.26,s*0.2);
  // Dorsal fin
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.12,-s*0.46,s*0.18,s*0.18);
  ctx.fillRect( s*0.06,-s*0.38,s*0.12,s*0.12);
  // Head
  ctx.fillRect(s*0.58,-s*0.28,s*0.3,s*0.36);
  // Eye
  ctx.fillStyle = '#212121';
  ctx.fillRect(s*0.6,-s*0.14,s*0.09,s*0.09);
  ctx.fillStyle = '#fff';
  ctx.fillRect(s*0.61,-s*0.14,s*0.04,s*0.04);
  // Tail flukes
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.9,-s*0.24,s*0.12,s*0.18);
  ctx.fillRect(-s*0.9, s*0.08,s*0.12,s*0.16);
  ctx.restore();
}

function drawWalrus(x, y, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Big body
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(-s*0.4,-s*0.28,s*0.68,s*0.56);
  // Head
  ctx.fillStyle = '#795548';
  ctx.fillRect(s*0.2,-s*0.34,s*0.28,s*0.32);
  // Tusks
  ctx.fillStyle = '#fffde7';
  ctx.fillRect(s*0.26,-s*0.06,s*0.07,s*0.22);
  ctx.fillRect(s*0.36,-s*0.06,s*0.07,s*0.22);
  // Whiskers
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(s*0.44,-s*0.16,s*0.14,s*0.03);
  ctx.fillRect(s*0.44,-s*0.1, s*0.14,s*0.03);
  ctx.fillRect(s*0.44,-s*0.04,s*0.14,s*0.03);
  // Eyes (beady)
  ctx.fillStyle = '#212121';
  ctx.fillRect(s*0.22,-s*0.28,s*0.06,s*0.06);
  ctx.fillRect(s*0.34,-s*0.28,s*0.06,s*0.06);
  // Flippers
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(-s*0.48,-s*0.14,s*0.12,s*0.28);
  ctx.fillRect( s*0.04, s*0.24,s*0.24,s*0.1);
  ctx.restore();
}

function drawDadaObstacle(x, y, type, dir) {
  if (type === 'seal')    return drawSeal(x, y, dir);
  if (type === 'sealion') return drawSeaLion(x, y, dir);
  if (type === 'shark')   return drawShark(x, y, dir);
  if (type === 'orca')    return drawOrca(x, y, dir);
  if (type === 'walrus')  return drawWalrus(x, y, dir);
}

// ── Jungle obstacle sprites (Mama mode) ──────────────────
function drawJaguar(x, y, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Body (low, sleek)
  ctx.fillStyle = '#f9a825';
  ctx.fillRect(-s*0.44,-s*0.18,s*0.78,s*0.36);
  // Head
  ctx.fillStyle = '#fbc02d';
  ctx.fillRect( s*0.28,-s*0.24,s*0.26,s*0.3);
  // Black spots on body
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.3,-s*0.14,s*0.1,s*0.1);
  ctx.fillRect(-s*0.1,-s*0.06,s*0.1,s*0.1);
  ctx.fillRect( s*0.08,-s*0.14,s*0.1,s*0.1);
  ctx.fillRect( s*0.18, s*0.0, s*0.1,s*0.1);
  // White muzzle
  ctx.fillStyle = '#fff8e1';
  ctx.fillRect( s*0.34,-s*0.14,s*0.16,s*0.14);
  // Eye (fierce)
  ctx.fillStyle = '#212121'; ctx.fillRect(s*0.32,-s*0.2,s*0.07,s*0.07);
  ctx.fillStyle = '#ffee58'; ctx.fillRect(s*0.33,-s*0.2,s*0.04,s*0.04);
  // Ear
  ctx.fillStyle = '#f9a825';
  ctx.fillRect(s*0.34,-s*0.3,s*0.08,s*0.1);
  // Tail curving up
  ctx.fillRect(-s*0.48,-s*0.12,s*0.1,s*0.22);
  ctx.fillRect(-s*0.44,-s*0.3, s*0.08,s*0.2);
  // Legs
  ctx.fillStyle = '#f9a825';
  ctx.fillRect(-s*0.3, s*0.16,s*0.12,s*0.12);
  ctx.fillRect( s*0.1, s*0.16,s*0.12,s*0.12);
  ctx.restore();
}

function drawGorilla(x, y, dir) {
  // 2-tile wide
  const s = TILE;
  ctx.save(); ctx.translate(x + s, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Huge body
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.78,-s*0.36,s*1.3,s*0.62);
  // Silver/grey back
  ctx.fillStyle = '#616161';
  ctx.fillRect(-s*0.22,-s*0.34,s*0.44,s*0.22);
  // Head
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.28,-s*0.48,s*0.56,s*0.28);
  // Brow ridge
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-s*0.26,-s*0.52,s*0.52,s*0.1);
  // Face
  ctx.fillStyle = '#424242';
  ctx.fillRect(-s*0.2,-s*0.44,s*0.4,s*0.22);
  // Eyes
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.18,-s*0.44,s*0.08,s*0.08);
  ctx.fillRect( s*0.1, -s*0.44,s*0.08,s*0.08);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-s*0.17,-s*0.44,s*0.03,s*0.03);
  ctx.fillRect( s*0.11,-s*0.44,s*0.03,s*0.03);
  // Nostrils
  ctx.fillStyle = '#111';
  ctx.fillRect(-s*0.08,-s*0.3,s*0.06,s*0.06);
  ctx.fillRect( s*0.02,-s*0.3,s*0.06,s*0.06);
  // Knuckle arms
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.82,-s*0.1,s*0.16,s*0.28);
  ctx.fillRect( s*0.52,-s*0.1,s*0.3, s*0.28);
  // Legs
  ctx.fillRect(-s*0.5, s*0.24,s*0.22,s*0.18);
  ctx.fillRect( s*0.06,s*0.24,s*0.22,s*0.18);
  ctx.restore();
}

function drawTapir(x, y, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Round body
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(-s*0.44,-s*0.22,s*0.76,s*0.44);
  // Head + distinctive long snout
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect( s*0.24,-s*0.24,s*0.24,s*0.28);
  // Long flexible snout/proboscis
  ctx.fillStyle = '#5d4037';
  ctx.fillRect( s*0.44,-s*0.18,s*0.18,s*0.12);
  ctx.fillRect( s*0.54,-s*0.26,s*0.1, s*0.1);
  // White/cream saddle marking
  ctx.fillStyle = '#d7ccc8';
  ctx.fillRect(-s*0.08,-s*0.22,s*0.28,s*0.1);
  // Eye
  ctx.fillStyle = '#212121'; ctx.fillRect(s*0.28,-s*0.18,s*0.07,s*0.07);
  ctx.fillStyle = '#fff'; ctx.fillRect(s*0.29,-s*0.18,s*0.03,s*0.03);
  // Small ear
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(s*0.3,-s*0.3,s*0.08,s*0.1);
  // Legs
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(-s*0.36, s*0.2,s*0.14,s*0.14);
  ctx.fillRect( s*0.06, s*0.2,s*0.14,s*0.14);
  ctx.restore();
}

function drawToucan(x, y, dir) {
  const s = TILE;
  ctx.save(); ctx.translate(x + s/2, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Black body
  ctx.fillStyle = '#212121';
  ctx.fillRect(-s*0.26,-s*0.28,s*0.52,s*0.46);
  // White throat patch
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(-s*0.16,-s*0.2,s*0.3,s*0.24);
  // Yellow breast
  ctx.fillStyle = '#ffeb3b';
  ctx.fillRect(-s*0.14,-s*0.1,s*0.26,s*0.14);
  // Red tail
  ctx.fillStyle = '#e53935';
  ctx.fillRect(-s*0.28,-s*0.06,s*0.1,s*0.26);
  // Huge colorful beak
  ctx.fillStyle = '#f9a825';
  ctx.fillRect( s*0.24,-s*0.16,s*0.28,s*0.12); // top beak
  ctx.fillStyle = '#43a047';
  ctx.fillRect( s*0.24,-s*0.08,s*0.24,s*0.1);  // bottom beak
  ctx.fillStyle = '#e53935';
  ctx.fillRect( s*0.24,-s*0.12,s*0.06,s*0.04); // beak stripe
  // Eye (bright)
  ctx.fillStyle = '#212121';
  ctx.beginPath(); ctx.arc(s*0.14,-s*0.16,s*0.08,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath(); ctx.arc(s*0.14,-s*0.16,s*0.05,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(s*0.15,-s*0.16,s*0.03,0,Math.PI*2); ctx.fill();
  // Feet gripping branch
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(-s*0.18, s*0.18,s*0.12,s*0.06);
  ctx.fillRect( s*0.06, s*0.18,s*0.12,s*0.06);
  ctx.restore();
}

function drawAnaconda(x, y, dir) {
  // 2-tile wide snake
  const s = TILE;
  ctx.save(); ctx.translate(x + s, y + s/2);
  if (dir < 0) ctx.scale(-1, 1);
  // Thick sinuous body (dark green with pattern)
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(-s*0.88,-s*0.2, s*1.76,s*0.4);
  // Scale pattern (yellow-green diamonds)
  ctx.fillStyle = '#558b2f';
  for (let i = -0.7; i < 0.8; i += 0.22) {
    ctx.fillRect(s*i-s*0.06, -s*0.12, s*0.12, s*0.24);
  }
  // Dark dorsal stripe
  ctx.fillStyle = '#1b5e20';
  ctx.fillRect(-s*0.88,-s*0.06,s*1.76,s*0.12);
  // Yellow belly
  ctx.fillStyle = '#c5e1a5';
  ctx.fillRect(-s*0.82,-s*0.1,s*1.64,s*0.08);
  // Head (larger, triangular)
  ctx.fillStyle = '#388e3c';
  ctx.fillRect( s*0.62,-s*0.28,s*0.32,s*0.36);
  ctx.fillRect( s*0.7, -s*0.32,s*0.2, s*0.1);
  // Forked tongue
  ctx.fillStyle = '#e53935';
  ctx.fillRect( s*0.9,-s*0.1, s*0.14,s*0.04);
  ctx.fillRect( s*1.0,-s*0.14,s*0.06,s*0.06);
  ctx.fillRect( s*1.0,-s*0.06,s*0.06,s*0.06);
  // Eye
  ctx.fillStyle = '#ffee58'; ctx.fillRect(s*0.68,-s*0.2,s*0.08,s*0.08);
  ctx.fillStyle = '#000';    ctx.fillRect(s*0.7,-s*0.2, s*0.04,s*0.04);
  // Tail tip
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(-s*0.88,-s*0.14,s*0.12,s*0.28);
  ctx.restore();
}

function drawJungleObstacle(x, y, type, dir) {
  if (type === 'jaguar')   return drawJaguar(x, y, dir);
  if (type === 'gorilla')  return drawGorilla(x, y, dir);
  if (type === 'tapir')    return drawTapir(x, y, dir);
  if (type === 'toucan')   return drawToucan(x, y, dir);
  if (type === 'anaconda') return drawAnaconda(x, y, dir);
}

// ── Platform sprites ──────────────────────────────────────
function drawLog(x, y, w) {
  ctx.save();
  ctx.fillStyle = '#795548';
  ctx.fillRect(x, y+TILE*0.15, w, TILE*0.7);
  ctx.fillStyle = '#6d4c41';
  for (let i = 0; i < w; i += 16) ctx.fillRect(x+i, y+TILE*0.15, 2, TILE*0.7);
  ctx.fillStyle = '#a1887f';
  ctx.fillRect(x,     y+TILE*0.15, 6, TILE*0.7);
  ctx.fillRect(x+w-6, y+TILE*0.15, 6, TILE*0.7);
  ctx.fillStyle = '#388e3c';
  ctx.beginPath(); ctx.arc(x+w/2, y+TILE*0.5, TILE*0.15, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawTurtle(x, y, diving) {
  const s = TILE;
  ctx.save(); ctx.translate(x+s/2, y+s/2);
  ctx.globalAlpha = diving ? 0.4 : 1;
  ctx.fillStyle = '#33691e';
  ctx.beginPath(); ctx.ellipse(0,0,s*0.35,s*0.28,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#558b2f';
  ctx.beginPath(); ctx.ellipse(0,0,s*0.27,s*0.22,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#33691e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-s*0.14,0); ctx.lineTo(s*0.14,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-s*0.14); ctx.lineTo(0,s*0.14); ctx.stroke();
  ctx.fillStyle = '#558b2f';
  ctx.fillRect(s*0.28,-s*0.1,s*0.14,s*0.2);
  ctx.fillStyle = '#000'; ctx.fillRect(s*0.35,-s*0.08,s*0.04,s*0.04);
  ctx.fillStyle = '#558b2f';
  ctx.fillRect(-s*0.44,-s*0.24,s*0.12,s*0.18);
  ctx.fillRect(-s*0.44, s*0.06,s*0.12,s*0.18);
  ctx.restore();
}

function drawIceFloe(x, y, w) {
  ctx.save();
  ctx.fillStyle = '#dceefb';
  ctx.fillRect(x+2, y+TILE*0.12, w-4, TILE*0.76);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x+4, y+TILE*0.14, w-8, TILE*0.2);
  ctx.fillStyle = '#b3d9f2';
  ctx.fillRect(x+2, y+TILE*0.76, w-4, TILE*0.12);
  // Cracks
  ctx.fillStyle = '#90caf9';
  ctx.fillRect(x+w*0.28, y+TILE*0.2, 2, TILE*0.52);
  ctx.fillRect(x+w*0.6,  y+TILE*0.3, 2, TILE*0.32);
  // Snow sparkles
  ctx.fillStyle = '#fff';
  ctx.fillRect(x+w*0.18, y+TILE*0.38, 4, 4);
  ctx.fillRect(x+w*0.52, y+TILE*0.56, 4, 4);
  ctx.restore();
}

function drawLilyPad(x, y, w) {
  ctx.save();
  const pads = Math.max(1, Math.round(w / TILE));
  for (let i = 0; i < pads; i++) {
    const cx = x + i * TILE + TILE / 2;
    const cy = y + TILE / 2;
    const r  = TILE * 0.42;
    // Main pad
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Lighter highlight
    ctx.fillStyle = '#43a047';
    ctx.beginPath(); ctx.arc(cx - TILE*0.06, cy - TILE*0.08, r * 0.62, 0, Math.PI * 2); ctx.fill();
    // Pad veins
    ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - r*0.7, cy - r*0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r*0.7, cy - r*0.5); ctx.stroke();
    // Flower
    ctx.fillStyle = '#fff9c4';
    ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffee58';
    ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.06, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ── Background ────────────────────────────────────────────
function drawBackground() {
  const dada   = (gameMode === 'dada');
  const jungle = (gameMode === 'mama');
  for (let row = 0; row < ROWS; row++) {
    const y = row * TILE;
    const isSafe  = row === SAFE_TOP || row === SAFE_MID || row >= ROAD_END + 1;
    const isWater = row >= WATER_START && row <= WATER_END;
    const isRoad  = row >= ROAD_START  && row <= ROAD_END;

    if (isSafe) {
      ctx.fillStyle = dada ? PAL.snow : jungle ? PAL.jungleFloor : PAL.grass;
      ctx.fillRect(0, y, W, TILE);
      if (dada)   drawSnowTexture(y);
      else if (jungle) drawJungleTexture(y);
      else        drawGrassTexture(y);
    } else if (isWater) {
      const wave = Math.floor(animFrame / 8) % 2;
      ctx.fillStyle = dada   ? (row % 2 ? PAL.arctic      : PAL.arcticDark)
                   : jungle  ? (row % 2 ? PAL.jungleRiver : PAL.jungleRiverDark)
                   :           (row % 2 ? PAL.water       : PAL.waterDark);
      ctx.fillRect(0, y, W, TILE);
      ctx.fillStyle = dada ? PAL.arcticFoam : jungle ? PAL.jungleRiverFoam : PAL.waterFoam;
      ctx.globalAlpha = 0.25;
      for (let fx = wave * 20; fx < W; fx += 40) ctx.fillRect(fx, y+TILE*0.45, 18, 3);
      ctx.globalAlpha = 1;
    } else if (isRoad) {
      ctx.fillStyle = dada ? PAL.tundra : jungle ? PAL.junglePath : PAL.road;
      ctx.fillRect(0, y, W, TILE);
      if (jungle) {
        // Jungle path: roots and dirt texture
        ctx.fillStyle = PAL.junglePathLine;
        ctx.globalAlpha = 0.4;
        for (let dx = 0; dx < W; dx += 28) ctx.fillRect(dx, y + 4, 6, TILE - 8);
        ctx.globalAlpha = 1;
      } else if (row % 2 === 1) {
        ctx.fillStyle = dada ? PAL.tundraLine : PAL.roadLine;
        ctx.globalAlpha = 0.35;
        for (let dx = 0; dx < W; dx += 30) ctx.fillRect(dx, y+TILE/2-2, 16, 4);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function drawGrassTexture(y) {
  ctx.fillStyle = PAL.grassDark;
  for (let tx = 4; tx < W; tx += 16) ctx.fillRect(tx, y+6, 4, TILE-12);
}

function drawSnowTexture(y) {
  ctx.fillStyle = PAL.snowDark;
  for (let tx = 6; tx < W; tx += 20) ctx.fillRect(tx, y+10, 3, 3);
  ctx.fillStyle = '#fff';
  for (let tx = 14; tx < W; tx += 26) ctx.fillRect(tx, y+22, 2, 2);
}

function drawJungleTexture(y) {
  // Dense leaf shapes
  ctx.fillStyle = PAL.jungleDark;
  for (let tx = 2; tx < W; tx += 20) ctx.fillRect(tx, y + 4, 10, 4);
  ctx.fillStyle = '#1e5220';
  for (let tx = 10; tx < W; tx += 24) ctx.fillRect(tx, y + 14, 4, 10);
  ctx.fillStyle = '#2d6a2d';
  for (let tx = 6; tx < W; tx += 30) ctx.fillRect(tx, y + 26, 8, 4);
}

function drawHomePads() {
  const dada = (gameMode === 'dada');
  const slotW = Math.floor(W / 5);
  for (let i = 0; i < 5; i++) {
    const px = i * slotW + (slotW - TILE) / 2;
    const py = SAFE_TOP * TILE;
    const filled = homeSlots[i];
    if (dada) {
      ctx.fillStyle = filled ? '#1565c0' : '#607d8b';
      ctx.fillRect(px, py+4, TILE, TILE-8);
      ctx.strokeStyle = '#e3f2fd'; ctx.lineWidth = 2;
      ctx.strokeRect(px, py+4, TILE, TILE-8);
      if (filled) {
        ctx.fillStyle = '#212121'; ctx.fillRect(px+11,py+8,18,22);
        ctx.fillStyle = '#f5f5f5'; ctx.fillRect(px+14,py+11,12,14);
      }
    } else if (gameMode === 'mama') {
      // Jungle tree hollow
      ctx.fillStyle = filled ? '#5d4037' : '#3e2723';
      ctx.fillRect(px, py+2, TILE, TILE-4);
      ctx.fillStyle = filled ? '#795548' : '#4e342e';
      ctx.fillRect(px+4, py+6, TILE-8, TILE-12);
      // Dark hollow inside
      ctx.fillStyle = filled ? '#4e342e' : '#1a0a00';
      ctx.beginPath(); ctx.ellipse(px+TILE/2, py+TILE/2, TILE*0.3, TILE*0.32, 0, 0, Math.PI*2); ctx.fill();
      if (filled) {
        // Mini sloth in hollow
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(px+12, py+10, 16, 18);
        ctx.fillStyle = '#bcaaa4'; ctx.fillRect(px+15, py+12, 10, 12);
      }
    } else {
      ctx.fillStyle = filled ? PAL.pad : '#1b5e20';
      ctx.fillRect(px, py+4, TILE, TILE-8);
      ctx.strokeStyle = PAL.padBorder; ctx.lineWidth = 2;
      ctx.strokeRect(px, py+4, TILE, TILE-8);
      if (filled) {
        ctx.fillStyle = gameMode === 'olivia' ? '#4caf50' : '#f8f8f8';
        ctx.fillRect(px+12, py+10, 16, 20);
        ctx.fillRect(px+14, py+6,   6, 10);
        ctx.fillRect(px+20, py+6,   6, 10);
      }
    }
  }
}

function drawHUD() {
  const hudY = ROAD_END * TILE + TILE;
  ctx.fillStyle = PAL.text;
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillText(`SCORE: ${score}`,  8,       hudY + 14);
  ctx.fillText(`HI: ${highScore}`, 8,       hudY + 30);
  ctx.fillText(`LVL: ${level}`,    W - 100, hudY + 14);
  // Mode badge
  const badgeCol = { vivian:'#f48fb1', olivia:'#69f0ae', mama:'#a5d6a7', dada:'#80d8ff' };
  ctx.fillStyle = badgeCol[gameMode];
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText(gameMode.toUpperCase(), W - 100, hudY + 30);
  // Lives
  for (let i = 0; i < lives; i++) drawMiniPlayer(W - 42 - i * 22, hudY + 4);
}

function drawMiniPlayer(x, y) {
  if (gameMode === 'dada') {
    ctx.fillStyle = '#212121'; ctx.fillRect(x+4, y, 12, 16);
    ctx.fillStyle = '#f5f5f5'; ctx.fillRect(x+6, y+3, 8, 9);
  } else if (gameMode === 'mama') {
    // Mini sloth: brown body + lighter belly
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(x+3, y+1, 14, 16);
    ctx.fillStyle = '#bcaaa4'; ctx.fillRect(x+6, y+4, 8, 10);
  } else if (gameMode === 'olivia') {
    ctx.fillStyle = '#4caf50'; ctx.fillRect(x+2, y+4, 16, 10);
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(x+14,y+2,  6,  6);
  } else {
    ctx.fillStyle = '#f8f8f8'; ctx.fillRect(x+4, y, 12, 16);
    ctx.fillRect(x+6, y-8, 4, 10); ctx.fillRect(x+10, y-8, 4, 10);
    ctx.fillStyle = '#f48fb1';
    ctx.fillRect(x+7, y-7, 2, 7); ctx.fillRect(x+11, y-7, 2, 7);
  }
}

// ── Level configs ─────────────────────────────────────────
function getLevelConfig(lvl) {
  switch (gameMode) {
    case 'vivian': {
      // Near-impossible to lose: tiny speed, enormous gaps, almost full log coverage
      const s = 0.18 + (lvl - 1) * 0.04;
      return {
        road: [
          { row:6,  dir: 1, speed:s*1.0, gap:500, type:'car',   color:'#e53935' },
          { row:7,  dir:-1, speed:s*1.0, gap:480, type:'car',   color:'#1e88e5' },
          { row:8,  dir: 1, speed:s*0.8, gap:520, type:'truck', color:'#fdd835' },
          { row:9,  dir:-1, speed:s*1.1, gap:460, type:'car',   color:'#8e24aa' },
          { row:10, dir: 1, speed:s*0.9, gap:490, type:'car',   color:'#00897b' },
          { row:11, dir:-1, speed:s*0.7, gap:530, type:'truck', color:'#f4511e' },
        ],
        water: [
          { row:1, dir:-1, speed:s*0.5, len:5, gap:12, type:'log' },
          { row:2, dir: 1, speed:s*0.5, len:5, gap:12, type:'turtle' },
          { row:3, dir:-1, speed:s*0.5, len:5, gap:12, type:'log' },
          { row:4, dir: 1, speed:s*0.5, len:5, gap:12, type:'log' },
        ],
      };
    }
    case 'olivia': {
      const s = 0.4 + (lvl - 1) * 0.1;
      return {
        road: [
          { row:6,  dir: 1, speed:s*1.0, gap:320, type:'car',   color:'#e53935' },
          { row:7,  dir:-1, speed:s*1.1, gap:300, type:'car',   color:'#1e88e5' },
          { row:8,  dir: 1, speed:s*0.8, gap:360, type:'truck', color:'#fdd835' },
          { row:9,  dir:-1, speed:s*1.2, gap:280, type:'car',   color:'#8e24aa' },
          { row:10, dir: 1, speed:s*1.0, gap:300, type:'car',   color:'#00897b' },
          { row:11, dir:-1, speed:s*0.7, gap:340, type:'truck', color:'#f4511e' },
        ],
        water: [
          { row:1, dir:-1, speed:s*0.6, len:4, gap:60,  type:'log' },
          { row:2, dir: 1, speed:s*0.7, len:3, gap:50,  type:'turtle' },
          { row:3, dir:-1, speed:s*0.8, len:4, gap:70,  type:'log' },
          { row:4, dir: 1, speed:s*0.5, len:5, gap:55,  type:'log' },
        ],
      };
    }
    case 'mama': {
      // Jungle theme: animals on dirt paths, lily pads on river
      const s = 0.8 + (lvl - 1) * 0.3;
      return {
        road: [
          { row:6,  dir: 1, speed:s*1.2, gap:200, type:'toucan',   color:'#212121' },
          { row:7,  dir:-1, speed:s*1.4, gap:170, type:'jaguar',   color:'#f9a825' },
          { row:8,  dir: 1, speed:s*0.7, gap:240, type:'gorilla',  color:'#212121' },
          { row:9,  dir:-1, speed:s*1.5, gap:150, type:'tapir',    color:'#5d4037' },
          { row:10, dir: 1, speed:s*1.1, gap:190, type:'jaguar',   color:'#f9a825' },
          { row:11, dir:-1, speed:s*0.6, gap:220, type:'anaconda', color:'#2e7d32' },
        ],
        water: [
          { row:1, dir:-1, speed:s*0.7, len:3, gap:95,  type:'log' },
          { row:2, dir: 1, speed:s*0.8, len:2, gap:80,  type:'lily' },
          { row:3, dir:-1, speed:s*1.0, len:3, gap:110, type:'log' },
          { row:4, dir: 1, speed:s*0.6, len:4, gap:85,  type:'lily' },
        ],
      };
    }
    case 'dada': {
      const s = 1.1 + (lvl - 1) * 0.35;
      return {
        road: [
          { row:6,  dir: 1, speed:s*1.1, gap:160, type:'seal',    color:'#9e9e9e' },
          { row:7,  dir:-1, speed:s*1.5, gap:130, type:'shark',   color:'#607d8b' },
          { row:8,  dir: 1, speed:s*1.0, gap:180, type:'walrus',  color:'#795548' },
          { row:9,  dir:-1, speed:s*1.7, gap:110, type:'sealion', color:'#8d6e63' },
          { row:10, dir: 1, speed:s*1.3, gap:150, type:'orca',    color:'#212121' },
          { row:11, dir:-1, speed:s*0.9, gap:170, type:'walrus',  color:'#795548' },
        ],
        water: [
          { row:1, dir:-1, speed:s*0.8, len:3, gap:110, type:'ice' },
          { row:2, dir: 1, speed:s*1.0, len:2, gap:100, type:'ice' },
          { row:3, dir:-1, speed:s*1.2, len:3, gap:130, type:'ice' },
          { row:4, dir: 1, speed:s*0.7, len:4, gap:100, type:'ice' },
        ],
      };
    }
  }
}

// ── Spawning ──────────────────────────────────────────────
function spawnLane(cfg) {
  const lane = { ...cfg, objects: [] };
  let x = -(Math.random() * cfg.gap);
  while (x < W + 200) {
    const w = cfg.len ? cfg.len * TILE
            : cfg.type === 'truck'    ? TILE * 2
            : cfg.type === 'orca'     ? TILE * 2
            : cfg.type === 'gorilla'  ? TILE * 2
            : cfg.type === 'anaconda' ? TILE * 2
            : TILE;
    lane.objects.push({ x: cfg.dir > 0 ? x - w : W - x, w, diveTimer: 0, diving: false });
    x += w + cfg.gap + Math.random() * 40;
  }
  return lane;
}

function initLevel() {
  const cfg = getLevelConfig(level);
  obstacles = cfg.road.map(spawnLane);
  logs      = cfg.water.map(spawnLane);
  homeSlots = [false, false, false, false, false];
  player = { col:5, row:START_ROW, x:5*TILE, y:START_ROW*TILE, riding:null, alive:true, deathAnim:0 };
}

// ── Move handler ──────────────────────────────────────────
function handleMove(key) {
  if (!player?.alive || moveCooldown > 0 || state !== 'playing') return;
  let dr = 0, dc = 0;
  if (key === 'ArrowUp'   || key === 'w' || key === 'W') dr = -1;
  if (key === 'ArrowDown' || key === 's' || key === 'S') dr =  1;
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') dc = -1;
  if (key === 'ArrowRight'|| key === 'd' || key === 'D') dc =  1;
  if (!dr && !dc) return;
  const nr = player.row + dr, nc = player.col + dc;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
  player.row = nr; player.col = nc;
  player.x = nc * TILE; player.y = nr * TILE;
  player.riding = null;
  moveCooldown = 6;
  sfxHop();
  if (dr === -1) score += 10;
  checkState();
}

// ── Collision & state ─────────────────────────────────────
function checkState() {
  const row = player.row;
  const px  = player.x + TILE * 0.25;
  const pw  = TILE * 0.5;

  if (row === SAFE_TOP) {
    const slotW = Math.floor(W / 5);
    const slot  = Math.floor((player.x + TILE / 2) / slotW);
    if (slot < 0 || slot >= 5 || homeSlots[slot]) { killPlayer(); return; }
    homeSlots[slot] = true;
    score += 100 + level * 20;
    sfxScore();
    player.row = START_ROW; player.col = 5;
    player.x = 5 * TILE; player.y = START_ROW * TILE;
    if (homeSlots.every(Boolean)) {
      sfxLevelUp();
      score += 500; level++;
      state = 'levelup'; showLevelScreen();
    }
    return;
  }

  if (row >= WATER_START && row <= WATER_END) {
    let onPlatform = false;
    for (const lane of logs) {
      if (lane.row !== row) continue;
      for (const obj of lane.objects) {
        if (obj.diving) continue;
        if (px + pw > obj.x && px < obj.x + obj.w) {
          onPlatform = true; player.riding = { lane, obj }; break;
        }
      }
      if (onPlatform) break;
    }
    if (!onPlatform) { killPlayer(); return; }
  } else {
    player.riding = null;
  }

  if (row >= ROAD_START && row <= ROAD_END) {
    const inset = 6;
    for (const lane of obstacles) {
      if (lane.row !== row) continue;
      for (const obj of lane.objects) {
        if (px + pw > obj.x + inset && px < obj.x + obj.w - inset) { killPlayer(); return; }
      }
    }
  }
}

function killPlayer() {
  if (!player.alive || invTimer > 0) return;
  player.alive = false; player.deathAnim = 30;
  sfxDie(); lives--;
}

// ── Update ────────────────────────────────────────────────
function update() {
  animFrame++;
  if (moveCooldown > 0) moveCooldown--;
  if (state !== 'playing') return;

  for (const lane of obstacles) {
    for (const obj of lane.objects) {
      obj.x += lane.dir * lane.speed;
      if (lane.dir > 0 && obj.x >  W + obj.w)   obj.x = -obj.w - 10;
      if (lane.dir < 0 && obj.x < -obj.w - 10)  obj.x =  W + 10;
    }
  }

  for (const lane of logs) {
    for (const obj of lane.objects) {
      obj.x += lane.dir * lane.speed;
      if (lane.dir > 0 && obj.x >  W + obj.w)   obj.x = -obj.w - 10;
      if (lane.dir < 0 && obj.x < -obj.w - 10)  obj.x =  W + 10;
      if (lane.type === 'turtle' && lane.diveInterval) {
        obj.diveTimer++;
        if (obj.diveTimer > lane.diveInterval) obj.diveTimer = 0;
        obj.diving = obj.diveTimer > lane.diveInterval * 0.7;
      }
    }
  }

  if (player.alive && player.riding) {
    const { lane, obj } = player.riding;
    player.x  += lane.dir * lane.speed;
    player.col = Math.round(player.x / TILE);
    if (player.x < -TILE || player.x > W) killPlayer();
  }

  if (player.alive && invTimer === 0 && player.row >= ROAD_START && player.row <= ROAD_END) {
    const px = player.x + TILE * 0.25, pw = TILE * 0.5, inset = 6;
    for (const lane of obstacles) {
      if (lane.row !== player.row) continue;
      for (const obj of lane.objects) {
        if (px + pw > obj.x + inset && px < obj.x + obj.w - inset) killPlayer();
      }
    }
  }

  if (player.alive && player.row >= WATER_START && player.row <= WATER_END) {
    if (player.riding?.obj.diving) killPlayer();
  }

  if (!player.alive) {
    player.deathAnim--;
    if (player.deathAnim <= 0) {
      if (lives <= 0) { gameOver(); }
      else {
        player.row = START_ROW; player.col = 5;
        player.x = 5 * TILE; player.y = START_ROW * TILE;
        player.alive = true; player.riding = null;
        invTimer = { vivian: 300, olivia: 200, mama: 120, dada: 120 }[gameMode];
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
  if (state === 'title') return;
  drawHomePads();

  for (const lane of logs) {
    for (const obj of lane.objects) {
      const y = lane.row * TILE;
      if      (lane.type === 'log')    drawLog(obj.x, y, obj.w);
      else if (lane.type === 'turtle') drawTurtle(obj.x, y, obj.diving);
      else if (lane.type === 'ice')    drawIceFloe(obj.x, y, obj.w);
      else if (lane.type === 'lily')   drawLilyPad(obj.x, y, obj.w);
    }
  }

  for (const lane of obstacles) {
    for (const obj of lane.objects) {
      const y = lane.row * TILE;
      if      (gameMode === 'dada') drawDadaObstacle(obj.x, y, lane.type, lane.dir);
      else if (gameMode === 'mama') drawJungleObstacle(obj.x, y, lane.type, lane.dir);
      else if (lane.type === 'truck') drawTruck(obj.x, y, lane.color, lane.dir);
      else drawCar(obj.x, y, lane.color, lane.dir);
    }
  }

  if (player) {
    if (player.deathAnim > 0) drawPlayer(player.x, player.y, true, false);
    else if (player.alive)    drawPlayer(player.x, player.y, false, invTimer > 0);
  }

  drawHUD();
}

// ── Game lifecycle ────────────────────────────────────────
function startGame(mode) {
  getAudio(); // ensure AudioContext created during user gesture
  gameMode    = mode;
  overlay.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  levelScreen.classList.add('hidden');
  score       = 0;
  lives       = { vivian: 7, olivia: 5, mama: 3, dada: 3 }[mode];
  level       = 1;
  invTimer    = 0;
  state       = 'playing';
  gameRunning = true;
  initLevel();
  startMusic();
}

function gameOver() {
  state = 'gameover';
  stopMusic();
  gameOverScreen.classList.remove('hidden');
  finalScoreEl.innerHTML =
    `SCORE: ${score}<br>HI: ${highScore}` +
    (score > 0 && score >= highScore ? '<br><br>NEW HIGH SCORE!' : '');
}

function showLevelScreen() {
  levelScreen.classList.remove('hidden');
  const msgs = {
    vivian: ['Yay! Keep going!',    'You\'re amazing!',  'Hoppy loves you!'],
    olivia: ['Nice work!',          'Getting faster!',   'Incredible!'],
    mama:   ['Faster traffic!',     'Much faster...',    'Maximum chaos!'],
    dada:   ['More animals!',       'Watch out!',        'Total mayhem!'],
  };
  const m = msgs[gameMode];
  levelTitle.textContent   = `LEVEL ${level}`;
  levelSubtitle.textContent = level <= 3 ? m[0] : level <= 6 ? m[1] : m[2];
  setTimeout(() => {
    levelScreen.classList.add('hidden');
    initLevel(); state = 'playing';
    startMusic();
  }, 2200);
}

// ── Utility ───────────────────────────────────────────────
function shadeColor(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// ── Main loop ─────────────────────────────────────────────
function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();
