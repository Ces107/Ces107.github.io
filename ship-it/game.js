/* Ship It! - a launch-day arcade game. No libraries, no assets, no tracking. */
(() => {
'use strict';

// ---------- build flags ----------
// DELUXE is flipped to true by build.py for the paid offline download only. The web build ships false
// and has the Deluxe block (marked @deluxe-begin/@deluxe-end below) stripped out entirely.
const DELUXE = false;
// Store links shown on the free end-of-run screen. Leave as REPLACE_ME to hide the buttons.
const DELUXE_URL = 'REPLACE_ME';
const TIP_URL = 'REPLACE_ME';
const linkOk = u => typeof u === 'string' && /^https:\/\/\S+$/.test(u);

const cv = document.getElementById('game');
let ctx = cv.getContext('2d');
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const C = {
  bg: '#15122a', ink: '#f5f2ff', dim: '#a49fc4', faint: '#6c6790',
  bug: '#ff5d73', ping: '#ffd23f', mail: '#4cc9f0', creep: '#b388ff',
  meet: '#ff9f43', feat: '#3ddc97', coffee: '#d69a6a', danger: '#ff4757',
  panel: '#221d40', panel2: '#2c2652', line: 'rgba(255,255,255,0.12)'
};
const params = new URLSearchParams(location.search);
const tp = parseFloat(params.get('time'));
const TIME_OVERRIDE = tp > 0 ? Math.min(600, Math.max(5, tp)) : 0;

const DIFFS = [
  // balance: test_play.py `balance` plays a human-like bot (350 ms reaction, 20 % misses) and checks these
  { id: 'intern', name: 'Intern', tag: 'chill', time: 60, spawn: 0.5, speed: 0.7, burn: 0.28, users: 0.8, color: C.feat },
  { id: 'founder', name: 'Founder', tag: 'normal', time: 60, spawn: 1.1, speed: 1.06, burn: 0.8, users: 0.75, color: C.ping },
  { id: '10x', name: '10x Engineer', tag: 'chaos', time: 60, spawn: 1.5, speed: 1.25, burn: 1.25, users: 1.3, color: C.bug }
];

// ---------- content ----------
const FEATURES = ['Login', 'Sign-up', 'Payments', 'Onboarding', 'Search', 'Password reset', 'Landing page',
  'Settings', 'Email alerts', 'CSV export', 'Mobile view', 'Pricing page', 'Billing', 'Dashboard', 'Logout button'];
const CREEPS = [['Add AI?', 'AI chatbot'], ['Blockchain it?', 'Blockchain'], ['Dark mode v2?', 'Dark mode v2'],
  ['Metaverse?', 'Metaverse'], ['NFT avatars?', 'NFT avatars'], ['Gamify it?', 'Badges'], ['Voice UI?', 'Voice UI'],
  ['Smart fridge app?', 'Fridge app'], ['Make it social?', 'Feed'], ['Add a chatbot?', 'Chatbot'],
  ['Super app?', 'Super app'], ['Web3 login?', 'Web3 login'], ['Rewrite in Rust?', 'Rewrite']];
const MEETINGS = [['Quick sync', '60 min'], ['Alignment', '90 min'], ['Brainstorm', 'all hands'],
  ['Quick call?', '"5 min"'], ['Retro of retro', '45 min'], ['Coffee chat', 'mandatory'], ['Kickoff', 'recurring']];
const SQUASH_LINES = ['works on my machine', 'LGTM', 'fixed in prod', 'not a bug, a feature', 'hotfix!', 'git push -f', 'TODO: test'];
const LEAK_LINES = ['bug in prod!', 'stack overflow', 'undefined is not a function', '500!', 'it compiled though'];

// ---------- utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = n => Math.round(n).toLocaleString('en-US');
const inRect = (px, py, x, y, w, h, pad = 0) => px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad;
function circleRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('shipit.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('shipit.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
};

// ---------- audio (WebAudio synth, generated at runtime) ----------
let AC = null, master = null, noiseBuf = null, muted = !!store.get('muted', false);
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = muted ? 0 : 0.4;
    master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function tone(f, dur, type = 'sine', v = 0.2, f2 = null, delay = 0) {
  if (!AC || muted) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, v = 0.2, fc = 1500, ftype = 'bandpass', delay = 0, fc2 = null) {
  if (!AC || muted || !noiseBuf) return;
  const t = AC.currentTime + delay;
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf;
  f.type = ftype; f.frequency.setValueAtTime(fc, t);
  if (fc2) f.frequency.exponentialRampToValueAtTime(fc2, t + dur);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const SFX = {
  squash() { noise(0.08, 0.3, 1500); tone(380, 0.1, 'square', 0.07, 60); },
  ping() { tone(1320, 0.06, 'sine', 0.16); tone(1760, 0.08, 'sine', 0.12, null, 0.05); },
  tap() { tone(620, 0.05, 'triangle', 0.14); },
  archive() { tone(520, 0.07, 'triangle', 0.16); tone(780, 0.1, 'triangle', 0.14, null, 0.06); },
  no() { tone(180, 0.08, 'square', 0.12); tone(135, 0.12, 'square', 0.12, null, 0.08); },
  pick() { tone(440, 0.06, 'sine', 0.12, 660); },
  drop() { tone(523, 0.08, 'triangle', 0.18); tone(784, 0.1, 'triangle', 0.16, null, 0.07); tone(1046, 0.16, 'triangle', 0.12, null, 0.14); },
  nope() { tone(210, 0.12, 'sawtooth', 0.06, 150); },
  hurt() { tone(260, 0.22, 'sawtooth', 0.12, 70); noise(0.12, 0.14, 600, 'lowpass'); },
  meeting() { tone(110, 0.55, 'square', 0.08, 90); tone(117, 0.55, 'square', 0.06, 95); },
  coffee() { noise(0.25, 0.12, 700, 'bandpass', 0, 2600); tone(300, 0.16, 'sine', 0.08, 600); },
  combo(l) { const b = 440 * Math.pow(1.12, Math.min(l, 10)); [0, 4, 7].forEach((s, i) => tone(b * Math.pow(2, s / 12), 0.09, 'square', 0.06, null, i * 0.05)); },
  tick() { tone(1000, 0.03, 'square', 0.05); },
  banner() { tone(330, 0.14, 'sawtooth', 0.07, 660); },
  start() { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, null, i * 0.07)); },
  launch() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, null, i * 0.11)); noise(0.7, 0.07, 3000, 'highpass', 0.6); },
  burnout() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.09, f * 0.9, i * 0.18)); },
  click() { tone(800, 0.03, 'square', 0.05); }
};
function setMuted(m) {
  muted = m; store.set('muted', m);
  if (master) master.gain.value = m ? 0 : 0.4;
}

// ---------- canvas sizing ----------
let W = 960, H = 600, scale = 1, dpr = 1;
const bgCanvas = document.createElement('canvas');
function resize() {
  const cw = window.innerWidth, ch = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  scale = Math.min(cw, ch) / 600;
  if (Math.max(cw, ch) / scale > 1300) scale = Math.max(cw, ch) / 1300;
  W = cw / scale; H = ch / scale;
  S.mvpBox = { x: 16, y: H - 166, w: 186, h: 150 };
  const L = S.laptop;
  if (!L.x) { L.x = W / 2; L.y = H / 2 + 10; }
  L.x = L.tx = clamp(L.x, 70, W - 70); L.y = L.ty = clamp(L.y, 136, H - 60);
  renderBg();
}
function renderBg() {
  bgCanvas.width = cv.width; bgCanvas.height = cv.height;
  const g = bgCanvas.getContext('2d');
  const old = ctx; ctx = g;
  g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  // coffee ring + sticky note: desk props
  g.save(); g.translate(W - 80, H - 80); g.rotate(0.06);
  g.fillStyle = 'rgba(255,210,63,0.08)'; g.fillRect(-46, -40, 92, 80);
  g.fillStyle = 'rgba(255,210,63,0.16)'; g.font = `700 13px ${FONT}`; g.textAlign = 'center';
  g.fillText('TODO:', 0, -10); g.fillText('sleep?', 0, 10);
  g.restore();
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  ctx = old;
}

// ---------- state ----------
const S = {
  screen: 'title', diffIdx: 1, diff: DIFFS[1], time: 60, elapsed: 0, k: 0, score: 0, combo: 0, comboT: 0, maxCombo: 0,
  burnout: 0, ents: [], parts: [], texts: [], mvp: [], queue: [], stuck: 0, shake: 0, flash: 0, flashColor: C.danger,
  banner: null, events: [], acc: {}, laptop: { x: 0, y: 0, tx: 0, ty: 0, r: 46, drag: false }, paused: false,
  report: null, stats: null, clock: 0, lastSec: -1, final10: false, reportT: 0, best: store.get('best', {}), deco: [],
  mode: 'day', week: null, helpers: [], zaps: []
};
const drags = new Map();
let buttons = [];
let pointer = { x: -999, y: -999 };

function startGame(i) {
  S.mode = 'day'; S.week = null;
  beginRound(DIFFS[i], i);
  banner('LAUNCH DAY', 'ship before the timer ends');
}
function restart() {
  if (DELUXE && S.mode !== 'day') DLX.restart(); else startGame(S.diffIdx);
}
// one round of play: a classic launch day, one day of Series A Week, or a Zen session
function beginRound(d, idx, burnout = 0) {
  audioInit();
  if (DELUXE) DLX.stopMusic();
  Object.assign(S, {
    diffIdx: idx, diff: d, time: TIME_OVERRIDE || d.time, elapsed: 0, k: 0, score: 0, combo: 0, comboT: 0, maxCombo: 0,
    burnout, ents: [], parts: [], texts: [], mvp: [], queue: [], stuck: 0, shake: 0, flash: 0, paused: false,
    final10: false, lastSec: -1, report: null, screen: 'play', helpers: [], zaps: [],
    acc: { bug: 0.6, ping: 0, email: 0, creep: 0, meeting: -0.3, feature: 0.85, coffee: 0 },
    stats: { squashed: 0, leaked: 0, muted: 0, pings: 0, archived: 0, emails: 0, nos: 0, creeps: 0, meetings: 0, coffees: 0, shipped: 0 },
    events: [
      { at: 0.3, done: false, fn: evFrontPage },
      { at: 0.55, done: false, fn: evInvestor },
      { at: 0.8, done: false, fn: evPivot }
    ]
  });
  const L = S.laptop; L.x = L.tx = W / 2; L.y = L.ty = H / 2 + 10; L.drag = false;
  drags.clear();
  SFX.start();
}
function banner(text, sub) { S.banner = { text, sub, t: 0, life: 2.2 }; if (S.screen === 'play' && S.elapsed > 0.5) SFX.banner(); }
function evFrontPage() { banner('FRONT PAGE!', 'traffic spike'); for (let i = 0; i < 8; i++) S.queue.push({ type: 'bug', at: S.elapsed + i * 0.16 }); }
function evInvestor() {
  banner('"JUST CHECKING IN"', 'an investor');
  for (let i = 0; i < 4; i++) S.queue.push({ type: 'email', at: S.elapsed + i * 0.3 });
  S.queue.push({ type: 'meeting', at: S.elapsed + 1.4 });
}
function evPivot() { banner('"TINY PIVOT"', 'your cofounder'); for (let i = 0; i < 4; i++) S.queue.push({ type: 'creep', at: S.elapsed + i * 0.35 }); }

// ---------- spawning ----------
function edgePoint(m = 40) {
  switch ((Math.random() * 4) | 0) {
    case 0: return { x: rand(0, W), y: -m };
    case 1: return { x: W + m, y: rand(70, H) };
    case 2: return { x: rand(0, W), y: H + m };
    default: return { x: -m, y: rand(70, H) };
  }
}
function measure(text, font) { ctx.font = font; return ctx.measureText(text).width; }
function countType(t) { let n = 0; for (const e of S.ents) if (e.type === t && !e.dead) n++; return n; }
function spawn(type) {
  const d = S.diff, L = S.laptop;
  const e = { type, t: 0, seed: Math.random() * 100, dead: false, vx: 0, vy: 0 };
  const p = edgePoint(); e.x = p.x; e.y = p.y;
  switch (type) {
    case 'bug': e.r = 17; e.sp = rand(58, 88) * d.speed * (1 + S.k * 0.5); e.turn = 2.2; break;
    case 'ping': e.r = 15; e.sp = rand(125, 165) * d.speed * (1 + S.k * 0.3); e.turn = 0.9; break;
    case 'email': e.r = 22; e.sp = rand(42, 62) * d.speed; e.hp = 2; e.turn = 1.4; break;
    case 'creep': {
      const c = pick(CREEPS); e.label = c[0]; e.junk = c[1];
      e.w = measure(e.label, `700 14px ${FONT}`) + 34; e.h = 32; e.r = 20;
      e.sp = rand(52, 72) * d.speed; e.turn = 1.6; break;
    }
    case 'meeting': {
      if (countType('meeting') >= 2) return;
      const m = pick(MEETINGS); e.label = m[0]; e.sub = m[1]; e.w = 168; e.h = 56;
      const a = Math.atan2(L.y - e.y, L.x - e.x) + rand(-0.12, 0.12);
      e.sp = rand(85, 115) * d.speed; e.vx = Math.cos(a) * e.sp; e.vy = Math.sin(a) * e.sp; break;
    }
    case 'feature': {
      if (countType('feature') >= 3) return;
      const used = new Set(S.mvp.map(m => m.label).concat(S.ents.filter(x => x.type === 'feature').map(x => x.label)));
      const pool = FEATURES.filter(f => !used.has(f));
      e.label = pick(pool.length ? pool : FEATURES);
      e.w = measure(e.label, `700 14px ${FONT}`) + 44; e.h = 34;
      const left = Math.random() < 0.5;
      e.x = left ? -e.w : W + e.w; e.y = rand(110, H - 110);
      e.vx = (left ? 1 : -1) * rand(38, 56); break;
    }
    case 'coffee': {
      if (countType('coffee') >= 1) return;
      const left = Math.random() < 0.5; e.r = 20;
      e.x = left ? -30 : W + 30; e.y = rand(120, H - 80); e.vx = (left ? 1 : -1) * rand(50, 70); break;
    }
  }
  if (e.sp && !e.vx) {
    const dx = L.x - e.x, dy = L.y - e.y, dd = Math.hypot(dx, dy) || 1;
    e.vx = dx / dd * e.sp; e.vy = dy / dd * e.sp;
  }
  S.ents.push(e);
}
function addAcc(type, rate, dt) {
  S.acc[type] += rate * dt;
  while (S.acc[type] >= 1) { S.acc[type] -= rand(0.7, 1.3); spawn(type); }
}

// ---------- scoring / fx ----------
function comboMult() { return Math.min(8, 1 + Math.floor(S.combo / 5)); }
function bumpCombo() {
  S.combo++; S.comboT = 2.4; S.maxCombo = Math.max(S.maxCombo, S.combo);
  if (S.combo % 5 === 0) {
    SFX.combo(S.combo / 5);
    const m = comboMult();
    text(S.laptop.x, S.laptop.y - 86, m >= 8 ? 'x8 MAX COMBO' : 'x' + m + ' COMBO', C.ping, 22);
  }
}
function breakCombo() { S.combo = 0; S.comboT = 0; }
function addScore(base, x, y) { const pts = base * comboMult(); S.score += pts; text(x, y, '+' + pts, C.ink, 15); }
function text(x, y, s, color = C.ink, size = 16, opt = {}) {
  S.texts.push({ x, y, s, color, size, life: opt.life || 1.1, t: 0, rot: opt.rot || 0, stamp: !!opt.stamp });
  if (S.texts.length > 40) S.texts.shift();
}
function splat(x, y, color, n = 12, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
    S.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.35, 0.7), t: 0, color, size: rand(2, 5), kind: 'dot' });
  }
}
function confetti(n = 90) {
  const cols = [C.feat, C.ping, C.bug, C.mail, C.creep, C.meet];
  for (let i = 0; i < n; i++) {
    S.parts.push({ x: rand(0, W), y: rand(-60, -10), vx: rand(-40, 40), vy: rand(60, 220), life: rand(2, 3.5), t: 0,
      color: pick(cols), size: rand(4, 8), kind: 'conf', rot: rand(0, 6), vr: rand(-8, 8) });
  }
}

// ---------- gameplay ----------
function tapEnt(e) {
  switch (e.type) {
    case 'bug':
      e.dead = true; S.stats.squashed++; bumpCombo(); addScore(10, e.x, e.y - 22); splat(e.x, e.y, C.bug, 14);
      if (DELUXE && S.mode === 'zen') DLX.pluck(); else SFX.squash();
      if (Math.random() < 0.22) text(e.x, e.y - 46, pick(SQUASH_LINES), C.dim, 13);
      break;
    case 'ping':
      e.dead = true; S.stats.muted++; bumpCombo(); addScore(15, e.x, e.y - 20); splat(e.x, e.y, C.ping, 9); SFX.ping();
      break;
    case 'email':
      e.hp--;
      if (e.hp <= 0) {
        e.dead = true; S.stats.archived++; bumpCombo(); addScore(25, e.x, e.y - 24); splat(e.x, e.y, C.mail, 12); SFX.archive();
        text(e.x, e.y - 48, 'archived', C.mail, 13);
      } else { SFX.tap(); e.vx *= -0.6; e.vy *= -0.6; e.hitT = 0.15; }
      break;
    case 'creep':
      e.dead = true; S.stats.nos++; bumpCombo(); addScore(20, e.x, e.y - 26); SFX.no();
      text(e.x, e.y + 4, 'NO.', C.danger, 30, { stamp: true, rot: rand(-0.3, 0.3), life: 0.8 });
      splat(e.x, e.y, C.creep, 10);
      break;
    case 'coffee':
      e.dead = true; S.stats.coffees++; S.burnout = Math.max(0, S.burnout - 15); SFX.coffee();
      text(e.x, e.y - 24, '-15% burnout', C.coffee, 15); splat(e.x, e.y, C.coffee, 10);
      break;
  }
}
function addJunk(label) {
  const m = S.mvp;
  if (m.length < 5) { m.push({ label, junk: true, t: 0 }); return; }
  for (let i = m.length - 1; i >= 0; i--) if (!m[i].junk) { m[i] = { label, junk: true, t: 0 }; return; }
}
function shipFeature(e) {
  const m = S.mvp;
  if (m.length < 5) m.push({ label: e.label, junk: false, t: 0 });
  else {
    const j = m.findIndex(i => i.junk);
    if (j < 0) {
      e.drag = false; e.vx = 60; e.x = S.mvpBox.x + S.mvpBox.w + e.w / 2 + 10;
      text(S.mvpBox.x + S.mvpBox.w / 2, S.mvpBox.y - 14, 'MVP full. Ship it!', C.ping, 15); SFX.nope(); return;
    }
    m[j] = { label: e.label, junk: false, t: 0 };
    text(S.mvpBox.x + S.mvpBox.w / 2, S.mvpBox.y - 14, 'scope cut!', C.feat, 15);
  }
  e.dead = true; S.stats.shipped++; bumpCombo(); addScore(40, e.x, e.y - 24); SFX.drop();
  splat(S.mvpBox.x + S.mvpBox.w / 2, S.mvpBox.y + 20, C.feat, 16, 200);
}
function hitLaptop(e) {
  const L = S.laptop, d = S.diff;
  if (DELUXE && S.mode === 'zen') { e.dead = true; breakCombo(); splat(e.x, e.y, C.faint, 6, 60); return; }
  const dmg ={ bug: 7, ping: 3, email: 8, creep: 5, meeting: 9 }[e.type] * d.burn;
  S.burnout = Math.min(100, S.burnout + dmg);
  breakCombo();
  S.shake = Math.max(S.shake, e.type === 'meeting' ? 14 : 8);
  S.flash = 0.25; S.flashColor = e.type === 'meeting' ? C.meet : C.danger;
  switch (e.type) {
    case 'bug': e.dead = true; S.stats.leaked++; text(L.x, L.y - 70, pick(LEAK_LINES), C.bug, 16); splat(L.x, L.y, C.bug, 10); SFX.hurt(); break;
    case 'ping': e.dead = true; S.stats.pings++; text(L.x, L.y - 70, 'distracted', C.ping, 15); SFX.hurt(); break;
    case 'email': e.dead = true; S.stats.emails++; text(L.x, L.y - 70, pick(['replied-all', '"per my last email"', 'inbox: 4,096']), C.mail, 15); SFX.hurt(); break;
    case 'creep': e.dead = true; S.stats.creeps++; addJunk(e.junk); text(L.x, L.y - 70, 'scope creep: ' + e.junk, C.creep, 15); SFX.hurt(); break;
    case 'meeting':
      e.hit = true; S.stuck = 1.7; S.stats.meetings++; SFX.meeting();
      text(L.x, L.y - 76, 'this could have been an email', C.meet, 16, { life: 1.6 });
      for (const [id, dr] of drags) { if (dr.kind === 'feature') { dr.e.drag = false; dr.e.vx = dr.e.vx || 45; } drags.delete(id); }
      L.drag = false; L.tx = L.x; L.ty = L.y;
      break;
  }
  if (S.burnout >= 100) endGame('burnout');
}
function update(dt) {
  S.clock += dt;
  updateFx(dt);
  if (DELUXE) DLX.musicTick();
  if (S.screen === 'title') { updateDeco(dt); return; }
  if (S.screen === 'report' || S.screen === 'shop') { S.reportT += dt; return; }
  if (S.screen !== 'play' || S.paused) return;
  const d = S.diff, L = S.laptop;
  const zen = DELUXE && S.mode === 'zen';
  S.elapsed += dt;
  const k = S.k = zen ? 0 : clamp(S.elapsed / S.time, 0, 1);
  for (let i = S.queue.length - 1; i >= 0; i--) if (S.queue[i].at <= S.elapsed) { spawn(S.queue[i].type); S.queue.splice(i, 1); }
  if (zen) DLX.zenSpawn(dt);
  else {
    for (const ev of S.events) if (!ev.done && k >= ev.at) { ev.done = true; ev.fn(); }
    const left = S.time - S.elapsed;
    if (!S.final10 && left <= 10) { S.final10 = true; banner('T-10', 'final push'); }
    const sec = Math.ceil(left);
    if (S.final10 && sec !== S.lastSec && sec > 0) { S.lastSec = sec; SFX.tick(); }
    const grace = S.elapsed < 1.2 ? 0 : 1;
    const m = d.spawn * (0.55 + 1.9 * Math.pow(k, 1.15)) * (S.final10 ? 1.25 : 1) * grace;
    addAcc('bug', 1.05 * m, dt);
    addAcc('ping', 0.45 * m, dt);
    addAcc('email', (k > 0.1 ? 0.28 : 0) * m, dt);
    addAcc('creep', (k > 0.15 ? 0.28 : 0) * m, dt);
    addAcc('meeting', (k > 0.18 ? 0.1 : 0) * m, dt);
    addAcc('feature', 0.5 * Math.sqrt(d.spawn), dt);
    addAcc('coffee', 0.055 * (d.coffee || 1), dt);
    S.burnout = Math.min(100, S.burnout + 0.35 * d.burn * (1 + k) * dt);
  }
  if (DELUXE && S.mode === 'series') DLX.helpers(dt);

  if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
  if (S.stuck > 0) S.stuck = Math.max(0, S.stuck - dt);
  if (S.burnout > 85 && Math.random() < dt * 8) S.parts.push({ x: L.x + rand(-30, 30), y: L.y - 44, vx: rand(-10, 10), vy: rand(-50, -30), life: 1, t: 0, color: 'rgba(200,200,220,0.35)', size: rand(5, 9), kind: 'smoke' });

  const f = Math.min(1, dt * 18);
  L.x = lerp(L.x, L.tx, f); L.y = lerp(L.y, L.ty, f);

  for (const e of S.ents) {
    if (e.dead) continue;
    e.t += dt;
    if (e.hitT) e.hitT = Math.max(0, e.hitT - dt);
    switch (e.type) {
      case 'bug': case 'ping': case 'email': case 'creep': {
        const dx = L.x - e.x, dy = L.y - e.y, dist = Math.hypot(dx, dy) || 1;
        const ft = Math.min(1, dt * e.turn);
        e.vx = lerp(e.vx, dx / dist * e.sp, ft); e.vy = lerp(e.vy, dy / dist * e.sp, ft);
        let wx = 0, wy = 0;
        if (e.type === 'bug') { const w = Math.sin(e.t * 7 + e.seed) * 55; wx = -dy / dist * w; wy = dx / dist * w; }
        e.x += (e.vx + wx) * dt; e.y += (e.vy + wy) * dt;
        if (dist < e.r + L.r * 0.75) hitLaptop(e);
        break;
      }
      case 'meeting':
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (!e.hit && circleRect(L.x, L.y, L.r * 0.8, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)) hitLaptop(e);
        if (e.t > 1.5 && (e.x < -260 || e.x > W + 260 || e.y < -200 || e.y > H + 200)) e.dead = true;
        break;
      case 'feature': case 'coffee':
        if (!e.drag) { e.x += e.vx * dt; e.y += Math.sin(e.t * 2 + e.seed) * 12 * dt; }
        if (e.t > 1 && (e.x < -200 || e.x > W + 200)) e.dead = true;
        break;
    }
    if (S.screen !== 'play') return;
  }
  S.ents = S.ents.filter(e => !e.dead);
  for (const it of S.mvp) it.t += dt;
  if (!zen && S.elapsed >= S.time) endGame('launch');
}
function updateFx(dt) {
  for (const p of S.parts) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'dot') { p.vx *= 0.92; p.vy *= 0.92; }
    if (p.kind === 'conf') { p.rot += p.vr * dt; p.vx += Math.sin(p.t * 3 + p.size) * 30 * dt; }
  }
  S.parts = S.parts.filter(p => p.t < p.life);
  if (S.parts.length > 400) S.parts.splice(0, S.parts.length - 400);
  for (const t of S.texts) t.t += dt;
  S.texts = S.texts.filter(t => t.t < t.life);
  if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.life) S.banner = null; }
  S.shake = Math.max(0, S.shake - dt * 40);
  S.flash = Math.max(0, S.flash - dt);
}
function updateDeco(dt) {
  if (S.deco.length < 7 && Math.random() < dt * 2) {
    const types = ['bug', 'bug', 'ping', 'email', 'bug'];
    const left = Math.random() < 0.5;
    S.deco.push({ type: pick(types), x: left ? -30 : W + 30, y: rand(40, H - 40), vx: (left ? 1 : -1) * rand(30, 70), vy: rand(-12, 12), t: 0, seed: rand(0, 99), r: 16, hp: 2 });
  }
  for (const e of S.deco) { e.t += dt; e.x += e.vx * dt; e.y += (e.vy + Math.sin(e.t * 6 + e.seed) * 30) * dt; }
  S.deco = S.deco.filter(e => e.x > -60 && e.x < W + 60);
}

function endGame(reason) {
  if (S.screen !== 'play') return;
  S.paused = false; drags.clear(); S.laptop.drag = false;
  if (DELUXE && S.mode === 'series') { DLX.endDay(reason); return; }
  S.screen = 'report'; S.reportT = 0;
  S.report = buildReport(reason);
  const id = S.diff.id;
  const prev = S.best[id] || 0;
  S.report.newBest = S.report.users > prev;
  if (S.report.newBest) { S.best[id] = S.report.users; store.set('best', S.best); }
  if (reason === 'launch') { SFX.launch(); confetti(); } else SFX.burnout();
}

// ---------- report ----------
function verdictFor(users, reason) {
  if (reason === 'burnout') return ['Burned Out', 'shipped anyway. sort of.'];
  if (users < 60) return ['Ghost Town', 'your mom signed up. twice.'];
  if (users < 600) return ['Side Project', 'it is on your CV now'];
  if (users < 3000) return ['Ramen Profitable', 'if the ramen is free'];
  if (users < 12000) return ['Trending (briefly)', 'for 40 glorious minutes'];
  if (users < 40000) return ['Series A Material', 'the deck writes itself'];
  return ['Unicorn (allegedly)', 'valuation: vibes'];
}
function buildReport(reason) {
  const st = S.stats, d = S.diff;
  const shipped = S.mvp.filter(i => !i.junk).map(i => i.label);
  const junk = S.mvp.filter(i => i.junk).map(i => i.label);
  const quality = clamp(1 - st.leaked * 0.03, 0.15, 1);
  let users = (S.score * 3.2 + shipped.length * 850 - junk.length * 220 + S.maxCombo * 25) * quality * d.users;
  if (reason === 'burnout') users *= 0.35;
  if (!shipped.length) users *= 0.2;
  users = Math.max(3, Math.round(users));
  const [verdict, sub] = verdictFor(users, reason);

  const cand = [];
  const add = (cond, handle, txt) => { if (cond) cand.push({ handle, text: txt }); };
  add(!shipped.length, '@tabs_not_spaces', 'launched a landing page with zero product. bold. respect.');
  add(junk.length >= 2, '@vc_vibes_only', `love that it has ${junk[0]} AND ${junk[1]}. what does it do though`);
  add(junk.length === 1, '@pm_priya', `the ${junk[0]} is very 2021 of you`);
  add(st.leaked >= 8, '@qa_quinn', `found ${st.leaked} bugs in the first minute. is this a product or performance art`);
  add(st.meetings >= 2, '@calendar_carl', `${st.meetings} "quick syncs" on launch day. visionary leadership`);
  add(S.burnout >= 80, '@wellness_wren', 'founder last seen whispering "just one more deploy" to a houseplant');
  add(users >= 20000, '@early_adopter_ed', 'signed up instantly. cancelled 14 other subscriptions to afford it');
  add(S.maxCombo >= 20, '@speedrun_sam', `${S.maxCombo}-hit combo on launch day. founder is built different`);
  add(st.squashed >= 40, '@bugbounty_bea', `${st.squashed} bugs squashed. the exterminators are nervous`);
  add(st.nos >= 6, '@scope_sheriff', `said NO ${st.nos} times today. a true product visionary`);
  add(shipped.includes('Payments'), '@ramen_rick', 'it takes my money and that is all I ask');
  add(shipped.length === 5 && !junk.length, '@minimal_mo', 'five features, zero fluff. this is the way');
  const generic = [
    ['@lurker_42', 'I could build this in a weekend'], ['@ux_ursula', 'why is the button that color'],
    ['@proud_parent', 'so proud of you sweetie. what is it again?'], ['@devnull_dana', 'is it open source?'],
    ['@growth_greg', 'have you considered a waitlist'], ['@hot_take_hal', 'this is just a spreadsheet with extra steps'],
    ['@sysadmin_sol', 'works fine. for now.']
  ];
  for (let i = generic.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [generic[i], generic[j]] = [generic[j], generic[i]]; }
  const tweets = cand.slice(0, 2);
  for (const g of generic) { if (tweets.length >= 3) break; tweets.push({ handle: g[0], text: g[1] }); }
  for (const t of tweets) t.likes = Math.max(1, Math.round(rand(0.002, 0.03) * users + rand(0, 40)));
  return {
    reason, users, verdict, sub, tweets, shipped, junk, score: S.score, burnout: Math.round(S.burnout),
    squashed: st.squashed, leaked: st.leaked, meetings: st.meetings, maxCombo: S.maxCombo, diff: d.name, diffColor: d.color
  };
}

// ---------- drawing primitives ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function txt(s, x, y, size, color, align = 'left', weight = 700, font = FONT, base = 'middle') {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}
function fitTxt(s, x, y, size, color, maxW, align = 'left', weight = 700) {
  let sz = size;
  ctx.font = `${weight} ${sz}px ${FONT}`;
  while (sz > 9 && ctx.measureText(s).width > maxW) { sz--; ctx.font = `${weight} ${sz}px ${FONT}`; }
  txt(s, x, y, sz, color, align, weight);
}
function wrap(s, maxW, size, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const words = s.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function hover(x, y, w, h) { return inRect(pointer.x, pointer.y, x, y, w, h); }
function btn(id, x, y, w, h, label, fn, opt = {}) {
  buttons.push({ id, x, y, w, h, fn });
  const hv = hover(x, y, w, h);
  const col = opt.color || C.feat;
  ctx.save();
  if (hv) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(1.04, 1.04); ctx.translate(-(x + w / 2), -(y + h / 2)); }
  rr(x, y + 4, w, h, 12); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  rr(x, y, w, h, 12);
  if (opt.solid) { ctx.fillStyle = col; ctx.fill(); }
  else { ctx.fillStyle = hv ? C.panel2 : C.panel; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); }
  const tc = opt.solid ? '#14122a' : C.ink;
  if (opt.sub) {
    fitTxt(label, x + w / 2, y + h / 2 - 9, opt.size || 18, tc, w - 16, 'center', 800);
    txt(opt.sub, x + w / 2, y + h / 2 + 13, 12, opt.solid ? 'rgba(20,18,42,0.7)' : C.dim, 'center', 600);
  } else fitTxt(label, x + w / 2, y + h / 2 + 1, opt.size || 17, tc, w - 16, 'center', 800);
  ctx.restore();
}

// ---------- entity drawing ----------
function drawBug(x, y, r, t, ang, seed = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = '#3a1020'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const wig = Math.sin(t * 22 + i * 2 + seed) * 4;
    ctx.beginPath(); ctx.moveTo(i * r * 0.45, -r * 0.5); ctx.lineTo(i * r * 0.55 + wig, -r * 1.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * r * 0.45, r * 0.5); ctx.lineTo(i * r * 0.55 - wig, r * 1.05); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(r * 1.2, -3); ctx.quadraticCurveTo(r * 1.6, -r * 0.6, r * 1.75, -r * 0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * 1.2, 3); ctx.quadraticCurveTo(r * 1.6, r * 0.6, r * 1.75, r * 0.7); ctx.stroke();
  ctx.fillStyle = C.bug; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(58,16,32,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
  ctx.fillStyle = '#3a1020';
  ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.35, r * 0.16, 0, 7); ctx.arc(-r * 0.3, r * 0.35, r * 0.16, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.95, 0, r * 0.45, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(r * 1.1, -r * 0.18, r * 0.12, 0, 7); ctx.arc(r * 1.1, r * 0.18, r * 0.12, 0, 7); ctx.fill();
  ctx.restore();
}
function drawPing(x, y, r, t) {
  ctx.save(); ctx.translate(x, y);
  const pulse = 1 + Math.sin(t * 14) * 0.06;
  ctx.globalAlpha = 0.25; ctx.fillStyle = C.ping;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.6 * pulse, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.7); ctx.lineTo(-r * 0.9, r * 1.25); ctx.lineTo(0, r * 0.9); ctx.fill();
  txt('@', 0, 1, r * 1.25, '#2a2208', 'center', 900);
  ctx.restore();
}
function drawEmail(x, y, r, t, hp, hitT) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 3) * 0.12);
  if (hitT) ctx.scale(1.15, 0.9);
  const w = r * 2, h = r * 1.4;
  rr(-w / 2, -h / 2, w, h, 4); ctx.fillStyle = C.mail; ctx.fill();
  ctx.strokeStyle = '#0d3a4a'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (hp > 1) { ctx.moveTo(-w / 2 + 2, -h / 2 + 2); ctx.lineTo(0, 3); ctx.lineTo(w / 2 - 2, -h / 2 + 2); }
  else { ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(0, -h); ctx.lineTo(w / 2, -h / 2); }
  ctx.stroke();
  ctx.fillStyle = C.danger; ctx.beginPath(); ctx.arc(w / 2 - 2, -h / 2 + 2, 7, 0, 7); ctx.fill();
  txt(String(hp), w / 2 - 2, -h / 2 + 2.5, 10, '#fff', 'center', 900);
  ctx.restore();
}
function drawCreep(e) {
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.sin(e.t * 4 + e.seed) * 0.08);
  const w = e.w, h = e.h, glow = 0.5 + Math.sin(e.t * 8) * 0.5;
  ctx.shadowColor = C.creep; ctx.shadowBlur = 10 + glow * 8;
  rr(-w / 2, -h / 2, w, h, 9); ctx.fillStyle = '#3b2a63'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = C.creep; ctx.stroke();
  ctx.fillStyle = C.creep; ctx.beginPath(); ctx.arc(-w / 2 + 15, 0, 8, 0, 7); ctx.fill();
  txt('+', -w / 2 + 15, 1, 14, '#2a1a4a', 'center', 900);
  txt(e.label, -w / 2 + 28, 1, 14, C.ink, 'left', 700);
  ctx.restore();
}
function drawMeeting(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  const w = e.w, h = e.h;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(-w / 2 + 4, -h / 2 + 6, w, h, 8); ctx.fill();
  rr(-w / 2, -h / 2, w, h, 8); ctx.fillStyle = C.meet; ctx.fill();
  ctx.save(); rr(-w / 2, -h / 2, w, h, 8); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 8;
  for (let i = -w; i < w; i += 22) { ctx.beginPath(); ctx.moveTo(i, h / 2); ctx.lineTo(i + h, -h / 2); ctx.stroke(); }
  ctx.fillStyle = '#7a3d07'; ctx.fillRect(-w / 2, -h / 2, 8, h);
  ctx.restore();
  txt(e.label, -w / 2 + 18, -8, 16, '#2b1300', 'left', 800);
  txt(e.sub, -w / 2 + 18, 12, 12, 'rgba(43,19,0,0.75)', 'left', 700);
  ctx.strokeStyle = '#2b1300'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(w / 2 - 20, 0, 10, 0, 7); ctx.moveTo(w / 2 - 20, 0); ctx.lineTo(w / 2 - 20, -6); ctx.moveTo(w / 2 - 20, 0); ctx.lineTo(w / 2 - 15, 3); ctx.stroke();
  ctx.restore();
}
function drawFeature(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  const w = e.w, h = e.h;
  if (e.drag) { ctx.scale(1.08, 1.08); ctx.shadowColor = C.feat; ctx.shadowBlur = 18; }
  else { ctx.rotate(Math.sin(e.t * 2 + e.seed) * 0.04); }
  rr(-w / 2, -h / 2, w, h, 9); ctx.fillStyle = C.feat; ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#10261c'; rr(-w / 2 + 9, -8, 16, 16, 4); ctx.fill();
  ctx.strokeStyle = C.feat; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-w / 2 + 13, 0); ctx.lineTo(-w / 2 + 16, 4); ctx.lineTo(-w / 2 + 22, -4); ctx.stroke();
  txt(e.label, -w / 2 + 33, 1, 14, '#10261c', 'left', 800);
  ctx.restore();
}
function drawCoffee(x, y, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(i * 6, -16);
    ctx.quadraticCurveTo(i * 6 + Math.sin(t * 5 + i) * 5, -24, i * 6, -32); ctx.stroke();
  }
  ctx.fillStyle = '#f2e6d8'; rr(-13, -12, 26, 26, 5); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#f2e6d8';
  ctx.beginPath(); ctx.arc(14, 1, 6, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.fillStyle = C.coffee; ctx.fillRect(-13, -12, 26, 6);
  ctx.restore();
}
function drawLaptop(x, y, burn, stuck, prog, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 50, 78, 10, 0, 0, 7); ctx.fill();
  rr(-58, -46, 116, 78, 9); ctx.fillStyle = '#cfd3ea'; ctx.fill();
  rr(-51, -39, 102, 62, 5); ctx.fillStyle = stuck ? '#3a3550' : '#0e1a2b'; ctx.fill();
  ctx.save(); rr(-51, -39, 102, 62, 5); ctx.clip();
  if (!stuck) {
    const cols = ['#3ddc97', '#4cc9f0', '#b388ff', '#ffd23f', '#ff9f43'];
    for (let i = 0; i < 9; i++) {
      const ly = -36 + ((i * 8 + t * 18) % 70);
      ctx.fillStyle = cols[i % 5]; ctx.globalAlpha = 0.22;
      ctx.fillRect(-46 + (i % 3) * 6, ly, 18 + ((i * 37) % 50), 3);
    }
    ctx.globalAlpha = 1;
    const ex = burn > 80 ? 1 : 0;
    ctx.strokeStyle = '#e9f6ff'; ctx.fillStyle = '#e9f6ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (ex) {
      for (const sx of [-17, 17]) {
        ctx.beginPath(); ctx.moveTo(sx - 5, -16); ctx.lineTo(sx + 5, -6); ctx.moveTo(sx + 5, -16); ctx.lineTo(sx - 5, -6); ctx.stroke();
      }
    } else {
      const blink = (Math.sin(t * 1.7) > 0.97) ? 0.15 : 1;
      ctx.beginPath(); ctx.ellipse(-17, -11, 4, 5 * blink, 0, 0, 7); ctx.ellipse(17, -11, 4, 5 * blink, 0, 0, 7); ctx.fill();
    }
    ctx.beginPath();
    if (burn < 35) ctx.arc(0, 0, 11, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (burn < 65) { ctx.moveTo(-9, 6); ctx.lineTo(9, 6); }
    else { ctx.moveTo(-10, 10); ctx.quadraticCurveTo(-5, 2, 0, 8); ctx.quadraticCurveTo(5, 14, 10, 6); }
    ctx.stroke();
    if (burn > 55) {
      ctx.fillStyle = C.mail; ctx.beginPath(); ctx.moveTo(34, -24); ctx.quadraticCurveTo(40, -14, 34, -12); ctx.quadraticCurveTo(28, -14, 34, -24); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-44, 15, 88, 4);
    ctx.fillStyle = C.feat; ctx.fillRect(-44, 15, 88 * prog, 4);
  } else {
    ctx.fillStyle = C.meet; rr(-20, -26, 40, 34, 4); ctx.fill();
    ctx.fillStyle = '#7a3d07'; ctx.fillRect(-20, -26, 40, 9);
    ctx.fillStyle = '#2b1300';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-14 + i * 11, -13 + j * 9, 6, 5);
    txt('in a meeting', 0, 16, 11, C.ink, 'center', 700);
  }
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(-64, 32); ctx.lineTo(64, 32); ctx.lineTo(74, 44); ctx.lineTo(-74, 44); ctx.closePath();
  ctx.fillStyle = '#a9afcb'; ctx.fill();
  ctx.fillStyle = '#8b91ad'; rr(-14, 34, 28, 4, 2); ctx.fill();
  ctx.restore();
}
function drawEnt(e) {
  switch (e.type) {
    case 'bug': drawBug(e.x, e.y, e.r, e.t, Math.atan2(e.vy, e.vx), e.seed); break;
    case 'ping': drawPing(e.x, e.y, e.r, e.t); break;
    case 'email': drawEmail(e.x, e.y, e.r, e.t, e.hp, e.hitT); break;
    case 'creep': drawCreep(e); break;
    case 'meeting': drawMeeting(e); break;
    case 'feature': drawFeature(e); break;
    case 'coffee': drawCoffee(e.x, e.y, e.t); break;
  }
}

// ---------- HUD / panels ----------
function drawMVP() {
  if (DELUXE && S.mode === 'zen') return;
  const b = S.mvpBox;
  const dragging = [...drags.values()].some(d => d.kind === 'feature');
  const over = dragging && hover(b.x, b.y, b.w, b.h);
  ctx.save();
  if (dragging) { ctx.shadowColor = C.feat; ctx.shadowBlur = over ? 30 : 14 + Math.sin(S.clock * 8) * 6; }
  rr(b.x, b.y, b.w, b.h, 12); ctx.fillStyle = 'rgba(34,29,64,0.92)'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = dragging ? 3 : 2; ctx.strokeStyle = dragging ? C.feat : C.line;
  if (!dragging) ctx.setLineDash([6, 5]);
  ctx.stroke(); ctx.setLineDash([]);
  txt('MVP', b.x + 12, b.y + 16, 14, C.feat, 'left', 900);
  txt(S.mvp.length + '/5', b.x + b.w - 12, b.y + 16, 13, C.dim, 'right', 700);
  for (let i = 0; i < 5; i++) {
    const it = S.mvp[i], sy = b.y + 30 + i * 23;
    rr(b.x + 10, sy, b.w - 20, 19, 5);
    if (!it) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); continue; }
    const pop = Math.max(0, 1 - it.t * 4);
    ctx.fillStyle = it.junk ? 'rgba(179,136,255,0.28)' : 'rgba(61,220,151,0.25)'; ctx.fill();
    if (pop) { ctx.strokeStyle = it.junk ? C.creep : C.feat; ctx.lineWidth = 2 * pop + 0.5; ctx.stroke(); }
    fitTxt((it.junk ? '? ' : '✓ ') + it.label, b.x + 18, sy + 10, 12, it.junk ? C.creep : C.feat, b.w - 36, 'left', 700);
  }
  ctx.restore();
}
function drawIconPause(x, y, s, paused) {
  ctx.fillStyle = C.ink;
  if (paused) { ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.4); ctx.lineTo(x + s * 0.4, y); ctx.lineTo(x - s * 0.3, y + s * 0.4); ctx.fill(); }
  else { ctx.fillRect(x - s * 0.32, y - s * 0.38, s * 0.22, s * 0.76); ctx.fillRect(x + s * 0.1, y - s * 0.38, s * 0.22, s * 0.76); }
}
function drawIconSound(x, y, s, off) {
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.15); ctx.lineTo(x - s * 0.25, y - s * 0.15); ctx.lineTo(x, y - s * 0.4);
  ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x - s * 0.25, y + s * 0.15); ctx.lineTo(x - s * 0.45, y + s * 0.15); ctx.fill();
  ctx.strokeStyle = off ? C.danger : C.ink; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath();
  if (off) { ctx.moveTo(x + s * 0.12, y - s * 0.2); ctx.lineTo(x + s * 0.45, y + s * 0.2); ctx.moveTo(x + s * 0.45, y - s * 0.2); ctx.lineTo(x + s * 0.12, y + s * 0.2); }
  else { ctx.arc(x + s * 0.05, y, s * 0.25, -0.9, 0.9); ctx.moveTo(x + s * 0.2, y - s * 0.38); ctx.arc(x + s * 0.05, y, s * 0.42, -0.9, 0.9); }
  ctx.stroke();
}
function iconBtn(id, x, y, s, draw, fn) {
  buttons.push({ id, x, y, w: s, h: s, fn });
  rr(x, y, s, s, 9); ctx.fillStyle = hover(x, y, s, s) ? C.panel2 : 'rgba(34,29,64,0.85)'; ctx.fill();
  ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
  draw(x + s / 2, y + s / 2, s * 0.55);
}
function drawCornerButtons() {
  const s = 38, y = 14;
  iconBtn('mute', W - 16 - s, y, s, (cx, cy, z) => drawIconSound(cx, cy, z, muted), () => setMuted(!muted));
  if (S.screen === 'play') iconBtn('pause', W - 16 - s * 2 - 8, y, s, (cx, cy, z) => drawIconPause(cx, cy, z, S.paused), togglePause);
}
function drawHUD() {
  txt('SCORE', 18, 22, 11, C.dim, 'left', 800);
  txt(fmt(S.score), 18, 46, 26, C.ink, 'left', 900, MONO);
  const m = comboMult();
  if (S.combo > 0) {
    const sw = measure(fmt(S.score), `900 26px ${MONO}`);
    const cx = 18 + sw + 32, cy = 40;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 7); ctx.stroke();
    ctx.strokeStyle = C.ping; ctx.beginPath(); ctx.arc(cx, cy, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (S.comboT / 2.4)); ctx.stroke();
    txt('x' + m, cx, cy + 1, 15, C.ping, 'center', 900);
    txt(S.combo + ' hit', cx + 26, cy + 1, 12, C.dim, 'left', 700);
  }
  const zen = DELUXE && S.mode === 'zen';
  const left = zen ? S.elapsed : Math.max(0, S.time - S.elapsed);
  const sec = zen ? Math.floor(left) : Math.ceil(left);
  const tstr = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  const urgent = !zen && left <= 10;
  const pulse = urgent ? 1 + Math.max(0, Math.sin((left % 1) * Math.PI)) * 0.12 : 1;
  ctx.save(); ctx.translate(W / 2, 38); ctx.scale(pulse, pulse);
  txt(tstr, 0, 0, 34, urgent ? C.danger : zen ? C.dim : C.ink, 'center', 900, MONO);
  ctx.restore();
  txt(DELUXE && S.mode !== 'day' ? DLX.timerLabel() : 'UNTIL LAUNCH', W / 2, 64, 10, C.dim, 'center', 800);
  if (DELUXE && S.mode !== 'day') DLX.hud();
  if (zen) return;
  const bw = Math.min(150, W * 0.2), bx = W - 16 - 38 * 2 - 8 - 14 - bw, by = 30;
  txt('BURNOUT', bx, 21, 11, C.dim, 'left', 800);
  txt(Math.round(S.burnout) + '%', bx + bw, 21, 12, S.burnout > 75 ? C.danger : C.ink, 'right', 900, MONO);
  rr(bx, by, bw, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  g.addColorStop(0, C.feat); g.addColorStop(0.55, C.ping); g.addColorStop(1, C.danger);
  if (S.burnout > 0.5) { rr(bx, by, Math.max(14, bw * S.burnout / 100), 14, 7); ctx.fillStyle = g; ctx.fill(); }
  if (S.burnout > 75 && Math.sin(S.clock * 12) > 0) { rr(bx - 2, by - 2, bw + 4, 18, 9); ctx.strokeStyle = C.danger; ctx.lineWidth = 2; ctx.stroke(); }
}
function drawFx() {
  for (const p of S.parts) {
    const a = 1 - p.t / p.life;
    ctx.globalAlpha = a; ctx.fillStyle = p.color;
    if (p.kind === 'conf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'smoke' ? p.size * (1 + p.t) : p.size * a, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const t of S.texts) {
    const a = 1 - t.t / t.life;
    ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.6);
    const y = t.stamp ? t.y : t.y - t.t * 40;
    const sc = t.stamp ? 1 + Math.max(0, 0.6 - t.t * 4) : 1;
    ctx.translate(t.x, y); ctx.rotate(t.rot); ctx.scale(sc, sc);
    ctx.font = `900 ${t.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(15,12,30,0.85)'; ctx.lineJoin = 'round';
    let x = 0; const half = ctx.measureText(t.s).width / 2;
    x = clamp(t.x, half + 8, W - half - 8) - t.x;
    if (t.stamp) { ctx.lineWidth = 3; ctx.strokeStyle = C.danger; rr(-half - 10, -t.size * 0.6, half * 2 + 20, t.size * 1.2, 6); ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(15,12,30,0.85)'; }
    ctx.strokeText(t.s, x, 0); ctx.fillStyle = t.color; ctx.fillText(t.s, x, 0);
    ctx.restore();
  }
}
function drawBanner() {
  const b = S.banner; if (!b) return;
  const inT = Math.min(1, b.t / 0.25), outT = Math.min(1, (b.life - b.t) / 0.3);
  const a = Math.min(inT, outT);
  const y = H * 0.3;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,8,24,0.6)'; ctx.fillRect(0, y - 44, W, 88);
  ctx.translate(W / 2 + (1 - inT) * -60, y);
  ctx.font = `900 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = '#15122a'; ctx.strokeText(b.text, 0, -8);
  ctx.fillStyle = C.ping; ctx.fillText(b.text, 0, -8);
  if (b.sub) txt(b.sub, 0, 24, 15, C.ink, 'center', 700);
  ctx.restore();
}
function drawGuides() {
  if (S.stats.shipped > 0 || S.elapsed > 20) return;
  const b = S.mvpBox;
  ctx.save(); ctx.setLineDash([4, 8]); ctx.lineDashOffset = -S.clock * 30;
  ctx.strokeStyle = 'rgba(61,220,151,0.45)'; ctx.lineWidth = 2;
  for (const e of S.ents) if (e.type === 'feature' && !e.drag && e.x > 0 && e.x < W) {
    ctx.beginPath(); ctx.moveTo(e.x, e.y + e.h / 2); ctx.quadraticCurveTo(e.x, b.y + b.h / 2, b.x + b.w, b.y + b.h / 2); ctx.stroke();
  }
  ctx.restore();
}

// ---------- screens ----------
function drawLogo(cx, cy, size) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.04);
  ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0b0918'; ctx.fillText('SHIP IT!', 4, 6);
  ctx.lineWidth = size * 0.08; ctx.strokeStyle = '#0b0918'; ctx.lineJoin = 'round'; ctx.strokeText('SHIP IT!', 0, 0);
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, C.ping); g.addColorStop(1, C.meet);
  ctx.fillStyle = g; ctx.fillText('SHIP IT!', 0, 0);
  ctx.restore();
}
function drawTitle() {
  for (const e of S.deco) {
    ctx.globalAlpha = 0.55;
    if (e.type === 'bug') drawBug(e.x, e.y, e.r, e.t, Math.atan2(e.vy + Math.cos(e.t * 6 + e.seed) * 30, e.vx), e.seed);
    else if (e.type === 'ping') drawPing(e.x, e.y, 13, e.t);
    else drawEmail(e.x, e.y, 18, e.t, 2, 0);
  }
  ctx.globalAlpha = 1;
  const narrow = W < 700;
  const rows = DELUXE ? 5 : 3;
  const blockH = narrow ? 500 + (rows - 3) * 76 : 360 + (DELUXE ? 78 : 0);
  const ly = Math.max(100, (H - blockH) / 2 + 60);
  const logoS = Math.min(110, W * 0.16);
  drawLogo(W / 2, ly, logoS);
  if (DELUXE) {
    ctx.save(); ctx.translate(W / 2 + logoS * 1.95, ly - logoS * 0.5); ctx.rotate(0.12);
    rr(-40, -13, 80, 26, 13); ctx.fillStyle = C.mail; ctx.fill();
    txt('DELUXE', 0, 1, 13, '#0d2a36', 'center', 900);
    ctx.restore();
  }
  txt('launch day simulator', W / 2, ly + Math.min(70, W * 0.1), 18, C.dim, 'center', 700);
  const bw = narrow ? Math.min(300, W - 48) : 200, bh = 64, gap = 16;
  const startY = ly + Math.min(70, W * 0.1) + 44;
  DIFFS.forEach((d, i) => {
    const x = narrow ? W / 2 - bw / 2 : W / 2 - (bw * 3 + gap * 2) / 2 + i * (bw + gap);
    const y = narrow ? startY + i * (bh + 12) : startY;
    const best = S.best[d.id];
    btn('diff' + i, x, y, bw, bh, (i + 1) + '  ' + d.name, () => startGame(i),
      { color: d.color, sub: best ? 'best ' + fmt(best) + ' users' : d.tag, solid: hover(x, y, bw, bh) });
  });
  if (DELUXE) DLX.titleButtons(narrow, startY, bw, bh, gap);
  const hy = narrow ? startY + rows * (bh + 12) + 34 : startY + bh + 64 + (DELUXE ? bh + 14 : 0);
  const hints = [
    [(x, y) => drawBug(x, y, 12, S.clock, -Math.PI / 2), 'tap'],
    [(x, y) => { ctx.save(); ctx.translate(x, y); ctx.scale(0.6, 0.6); drawFeature({ x: 0, y: 0, w: 60, h: 34, t: S.clock, seed: 0, label: '' }); ctx.restore(); }, 'drag → MVP'],
    [(x, y) => { ctx.save(); ctx.translate(x, y); ctx.scale(0.3, 0.3); drawLaptop(0, -6, 10, false, 0.5, S.clock); ctx.restore(); }, 'drag = dodge'],
    [(x, y) => drawCoffee(x, y + 6, S.clock), 'tap']
  ];
  const hw = Math.min(150, (W - 40) / 4);
  hints.forEach((h, i) => {
    const x = W / 2 - hw * 2 + hw * (i + 0.5);
    if (hy + 40 < H) { h[0](x, hy); txt(h[1], x, hy + 34, 13, C.dim, 'center', 700); }
  });
}
function drawPause() {
  ctx.fillStyle = 'rgba(10,8,24,0.72)'; ctx.fillRect(0, 0, W, H);
  txt('PAUSED', W / 2, H / 2 - 50, 42, C.ink, 'center', 900);
  btn('resume', W / 2 - 110, H / 2, 220, 54, 'Resume', togglePause, { solid: true });
  btn('quit', W / 2 - 110, H / 2 + 68, 220, 48, 'Menu', toMenu, { color: C.faint });
}
function drawReport() {
  const R = S.report; if (!R) return;
  const a = Math.min(1, S.reportT / 0.4);
  ctx.fillStyle = `rgba(10,8,24,${0.78 * a})`; ctx.fillRect(0, 0, W, H);
  const cw = Math.min(W - 24, 720), pad = 22, btnH = 48;
  const ups = upsellLinks(), upH = ups.length ? 48 : 0;
  const fixedH = 30 + 36 + 28 + 46 + 40 + 64 + 6 + btnH + pad + upH;
  const tw2 = cw - pad * 2 - 110;
  const tweets = [];
  let tweetsH = 0;
  for (const t of R.tweets) {
    const lines = wrap(t.text, tw2, 13, 500).slice(0, 2);
    const th = 22 + lines.length * 16;
    if (fixedH + tweetsH + th + 8 > H - 24) break;
    tweets.push({ t, lines, th }); tweetsH += th + 8;
  }
  const ch = fixedH + tweetsH;
  const cx = W / 2 - cw / 2, cy = H / 2 - ch / 2 + (1 - a) * 40;
  ctx.save(); ctx.globalAlpha = a;
  rr(cx, cy, cw, ch, 18); ctx.fillStyle = '#1c1836'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = R.reason === 'launch' ? C.feat : C.danger; ctx.stroke();
  let y = cy + 30;
  const chip = R.reason === 'launch' ? 'LAUNCHED' : 'BURNED OUT';
  const chipC = R.reason === 'launch' ? C.feat : C.danger;
  ctx.font = `900 12px ${FONT}`; const chw = ctx.measureText(chip).width + 20;
  rr(cx + pad, y - 11, chw, 22, 11); ctx.fillStyle = chipC; ctx.fill();
  txt(chip, cx + pad + chw / 2, y + 1, 12, '#14122a', 'center', 900);
  txt(R.diff.toUpperCase(), cx + pad + chw + 10, y + 1, 12, R.diffColor, 'left', 800);
  txt('LAUNCH REPORT', cx + cw - pad, y + 1, 12, C.dim, 'right', 800);
  y += 36;
  fitTxt(R.verdict, cx + pad, y, 32, C.ink, cw - pad * 2 - 100, 'left', 900);
  const gx = cx + cw - pad - 36, gy = y + 18;
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(gx, gy, 28, 0, 7); ctx.stroke();
  ctx.strokeStyle = R.burnout > 75 ? C.danger : R.burnout > 45 ? C.ping : C.feat;
  if (R.burnout > 0) { ctx.beginPath(); ctx.arc(gx, gy, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * R.burnout / 100); ctx.stroke(); }
  txt(R.burnout + '%', gx, gy + 1, 15, C.ink, 'center', 900, MONO);
  txt('burnout', gx, gy + 44, 11, C.dim, 'center', 700);
  y += 28; txt(R.sub, cx + pad, y, 15, C.dim, 'left', 600);
  y += 46;
  const shown = Math.round(R.users * Math.min(1, S.reportT / 1.2) ** 0.6);
  txt(fmt(shown), cx + pad, y, 48, C.ping, 'left', 900);
  const uw = measure(fmt(R.users), `900 48px ${FONT}`);
  txt('users', cx + pad + uw + 10, y + 10, 16, C.dim, 'left', 700);
  if (R.newBest && S.reportT > 1.2) txt('NEW BEST', cx + pad + uw + 10, y - 12, 12, C.feat, 'left', 900);
  y += 40;
  const tiles = R.tiles || [
    [R.squashed, 'bugs squashed', C.bug], [R.shipped.length + '/5', 'shipped', C.feat],
    [R.meetings, 'meetings', C.meet], [R.maxCombo, 'max combo', C.ping]
  ];
  const tw = (cw - pad * 2 - 30) / 4;
  tiles.forEach((tl, i) => {
    const tx = cx + pad + i * (tw + 10);
    rr(tx, y, tw, 50, 10); ctx.fillStyle = C.panel; ctx.fill();
    txt(String(tl[0]), tx + tw / 2, y + 19, 20, tl[2], 'center', 900);
    fitTxt(tl[1], tx + tw / 2, y + 38, 11, C.dim, tw - 8, 'center', 700);
  });
  y += 64;
  for (const { t, lines, th } of tweets) {
    rr(cx + pad, y, cw - pad * 2, th, 10); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    const hc = [C.mail, C.creep, C.meet, C.feat, C.bug][t.handle.length % 5];
    ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(cx + pad + 18, y + th / 2, 11, 0, 7); ctx.fill();
    txt(t.handle[1].toUpperCase(), cx + pad + 18, y + th / 2 + 1, 12, '#14122a', 'center', 900);
    txt(t.handle, cx + pad + 38, y + 13, 12, C.ink, 'left', 800);
    lines.forEach((l, i) => txt(l, cx + pad + 38, y + 29 + i * 16, 13, C.dim, 'left', 500));
    txt('♥ ' + fmt(t.likes), cx + cw - pad - 12, y + th / 2, 12, C.bug, 'right', 800);
    y += th + 8;
  }
  ctx.restore();
  if (S.reportT > 0.6) {
    const by = cy + ch - pad - btnH - upH, gap = 10, bw = (cw - pad * 2 - gap * 2) / 3;
    btn('again', cx + pad, by, bw, btnH, 'Ship again', restart, { solid: true });
    btn('save', cx + pad + bw + gap, by, bw, btnH, 'Save image', openShare, { color: C.ping });
    btn('menu', cx + pad + (bw + gap) * 2, by, bw, btnH, 'Menu', toMenu, { color: C.faint });
    // free build only, end of run only: one quiet line, never during play
    let ux = cx + pad;
    const tipW = Math.min(150, (cw - pad * 2) / 3);
    for (const u of ups) {
      const w = ups.length === 1 ? cw - pad * 2 : u.id === 'tip' ? tipW : cw - pad * 2 - tipW - gap;
      btn(u.id, ux, by + btnH + 12, w, 36, u.label, () => openLink(u.url), { color: u.color, size: 14 });
      ux += w + gap;
    }
  }
}
function upsellLinks() {
  if (DELUXE) return [];
  return [
    { id: 'deluxe', label: 'Liked it? Deluxe adds Series A Week and Zen Mode', url: DELUXE_URL, color: C.mail },
    { id: 'tip', label: 'Tip the dev', url: TIP_URL, color: C.coffee }
  ].filter(u => linkOk(u.url));
}
function openLink(url) {
  if (!linkOk(url)) return;
  SFX.click();
  try { window.open(url, '_blank', 'noopener'); } catch (e) { /* popup blocked */ }
}

// ---------- share image ----------
function renderShare() {
  const R = S.report;
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const g = c.getContext('2d');
  const old = ctx; ctx = g;
  try {
    g.fillStyle = C.bg; g.fillRect(0, 0, 1200, 630);
    g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1;
    for (let x = 0; x < 1200; x += 40) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 630); g.stroke(); }
    for (let y = 0; y < 630; y += 40) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(1200, y + 0.5); g.stroke(); }
    drawBug(1130, 70, 20, 1.3, 2.4); drawBug(640, 590, 16, 2.1, -0.6); drawEmail(1110, 560, 22, 0.5, 2, 0); drawPing(560, 50, 15, 0.3);
    drawLogo(210, 82, 76);
    const chip = R.reason === 'launch' ? 'LAUNCHED' : 'BURNED OUT', chipC = R.reason === 'launch' ? C.feat : C.danger;
    g.font = `900 16px ${FONT}`; const chw = g.measureText(chip).width + 28;
    rr(60, 150, chw, 30, 15); g.fillStyle = chipC; g.fill();
    txt(chip, 60 + chw / 2, 166, 16, '#14122a', 'center', 900);
    txt(R.diff.toUpperCase() + ' MODE', 60 + chw + 14, 166, 16, R.diffColor, 'left', 800);
    fitTxt(R.verdict, 60, 222, 48, C.ink, 500, 'left', 900);
    txt(R.sub, 60, 264, 20, C.dim, 'left', 600);
    txt(fmt(R.users), 60, 338, 76, C.ping, 'left', 900);
    const uw = measure(fmt(R.users), `900 76px ${FONT}`);
    txt('users', 60 + uw + 14, 354, 24, C.dim, 'left', 700);
    const tiles = [[R.burnout + '%', 'burnout', R.burnout > 75 ? C.danger : C.ping], [R.squashed, 'bugs squashed', C.bug],
      [R.shipped.length + '/5', 'shipped', C.feat], [R.meetings, 'meetings', C.meet]];
    tiles.forEach((t, i) => {
      const x = 60 + (i % 2) * 250, y = 410 + Math.floor(i / 2) * 84;
      rr(x, y, 236, 72, 14); g.fillStyle = C.panel; g.fill();
      txt(String(t[0]), x + 20, y + 30, 30, t[2], 'left', 900);
      txt(t[1], x + 20, y + 56, 15, C.dim, 'left', 700);
    });
    let y = 150;
    txt('THE INTERNET REACTS', 620, y, 15, C.dim, 'left', 900);
    y += 22;
    for (const t of R.tweets) {
      const lines = wrap(t.text, 440, 19, 500).slice(0, 3);
      const th = 52 + lines.length * 25;
      rr(620, y, 520, th, 16); g.fillStyle = '#1f1a3c'; g.fill(); g.strokeStyle = C.line; g.lineWidth = 1.5; g.stroke();
      const hc = [C.mail, C.creep, C.meet, C.feat, C.bug][t.handle.length % 5];
      g.fillStyle = hc; g.beginPath(); g.arc(652, y + 30, 16, 0, 7); g.fill();
      txt(t.handle[1].toUpperCase(), 652, y + 31, 16, '#14122a', 'center', 900);
      txt(t.handle, 680, y + 30, 18, C.ink, 'left', 800);
      txt('♥ ' + fmt(t.likes), 1120, y + 30, 16, C.bug, 'right', 800);
      lines.forEach((l, i) => txt(l, 680, y + 62 + i * 25, 19, C.dim, 'left', 500));
      y += th + 14;
    }
    txt('SHIP IT!  ·  launch day simulator  ·  score ' + fmt(R.score), 60, 600, 16, C.faint, 'left', 700);
  } finally { ctx = old; }
  return c;
}
const shareEl = document.getElementById('share');
const shareImg = document.getElementById('shareImg');
const shareDl = document.getElementById('shareDl');
const shareNative = document.getElementById('shareNative');
let shareCanvas = null;
function openShare() {
  if (!S.report) return;
  shareCanvas = renderShare();
  const url = shareCanvas.toDataURL('image/png');
  api.lastShare = url;
  shareImg.src = url; shareDl.href = url;
  shareNative.hidden = !(navigator.canShare && window.File);
  shareEl.hidden = false;
  SFX.click();
}
function closeShare() { shareEl.hidden = true; }
document.getElementById('shareClose').addEventListener('click', closeShare);
shareEl.addEventListener('click', ev => { if (ev.target === shareEl) closeShare(); });
shareNative.addEventListener('click', () => {
  if (!shareCanvas) return;
  shareCanvas.toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], 'ship-it-launch-report.png', { type: 'image/png' });
    const data = { files: [file], title: 'Ship It! launch report', text: `${S.report.verdict}: ${fmt(S.report.users)} users, ${S.report.burnout}% burnout.` };
    if (navigator.canShare && navigator.canShare(data)) navigator.share(data).catch(() => {});
  }, 'image/png');
});

// ---------- input ----------
function togglePause() { if (S.screen !== 'play') return; S.paused = !S.paused; drags.clear(); S.laptop.drag = false; SFX.click(); }
function toMenu() {
  if (DELUXE) DLX.leave();
  S.screen = 'title'; S.paused = false; S.ents = []; S.texts = []; S.helpers = []; S.zaps = []; drags.clear(); SFX.click();
}
function toLogical(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
}
const TAPPABLE = { bug: 1, ping: 1, email: 1, creep: 1, coffee: 1 };
function playDown(p, ptype, id) {
  const L = S.laptop;
  if (S.stuck > 0) { text(p.x, p.y - 10, 'in a meeting…', C.meet, 14, { life: 0.6 }); SFX.nope(); return; }
  const tol = ptype === 'touch' ? 24 : 12;
  let best = null, bd = 1e9;
  for (const e of S.ents) {
    if (e.dead || !TAPPABLE[e.type]) continue;
    const dd = Math.hypot(e.x - p.x, e.y - p.y);
    const ok = e.type === 'creep' ? inRect(p.x, p.y, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, tol) : dd < e.r + tol;
    if (ok && dd < bd) { bd = dd; best = e; }
  }
  if (best) { tapEnt(best); return; }
  for (let i = S.ents.length - 1; i >= 0; i--) {
    const e = S.ents[i];
    if (e.type !== 'feature' || e.dead || e.drag) continue;
    if (inRect(p.x, p.y, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, tol / 2)) {
      e.drag = true; drags.set(id, { kind: 'feature', e, ox: e.x - p.x, oy: e.y - p.y }); SFX.pick(); return;
    }
  }
  if (Math.hypot(L.x - p.x, L.y - p.y) > L.r + 20) {
    for (const e of S.ents) if (e.type === 'meeting' && inRect(p.x, p.y, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h) && !e.warned) {
      e.warned = true; text(e.x, e.y - 44, "can't decline. dodge it!", C.meet, 14); SFX.nope(); break;
    }
  }
  // anywhere else: drag the laptop (relative, like a trackpad)
  for (const d of drags.values()) if (d.kind === 'laptop') return;
  L.drag = true; drags.set(id, { kind: 'laptop', ox: L.x - p.x, oy: L.y - p.y });
}
function dragMove(d, p) {
  if (d.kind === 'feature') { d.e.x = p.x + d.ox; d.e.y = p.y + d.oy; }
  else if (S.stuck <= 0) {
    const L = S.laptop;
    L.tx = clamp(p.x + d.ox, 70, W - 70); L.ty = clamp(p.y + d.oy, 136, H - 60);
  }
}
function handleUp(id, p) {
  const d = drags.get(id); if (!d) return;
  drags.delete(id);
  if (d.kind === 'feature') {
    const e = d.e, b = S.mvpBox;
    const px = p ? p.x : e.x, py = p ? p.y : e.y;
    if (S.screen === 'play' && (inRect(px, py, b.x, b.y, b.w, b.h, 22) || inRect(e.x, e.y, b.x, b.y, b.w, b.h, 10))) shipFeature(e);
    else { e.drag = false; if (!e.vx) e.vx = 45; }
  } else S.laptop.drag = false;
}
cv.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  audioInit();
  try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  const p = toLogical(ev); pointer = p;
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (inRect(p.x, p.y, b.x, b.y, b.w, b.h, ev.pointerType === 'touch' ? 6 : 0)) { b.fn(); return; }
  }
  if (S.screen === 'play') { if (S.paused) togglePause(); else playDown(p, ev.pointerType, ev.pointerId); }
});
cv.addEventListener('pointermove', ev => {
  const p = toLogical(ev); pointer = p;
  const d = drags.get(ev.pointerId); if (d) dragMove(d, p);
});
cv.addEventListener('pointerup', ev => { const p = toLogical(ev); handleUp(ev.pointerId, p); if (ev.pointerType === 'touch') pointer = { x: -999, y: -999 }; });
cv.addEventListener('pointercancel', ev => handleUp(ev.pointerId, null));
cv.addEventListener('contextmenu', ev => ev.preventDefault());
window.addEventListener('keydown', ev => {
  audioInit();
  if (!shareEl.hidden) { if (ev.key === 'Escape') closeShare(); return; }
  const k = ev.key.toLowerCase();
  if (k === 'm') setMuted(!muted);
  if (S.screen === 'title') {
    if (k === '1' || k === '2' || k === '3') startGame(+k - 1);
    else if (DELUXE && k === '4') DLX.startSeries();
    else if (DELUXE && k === '5') DLX.startZen();
    else if (k === ' ' || k === 'enter') startGame(S.diffIdx);
  } else if (S.screen === 'play') {
    if (k === 'p' || k === 'escape') togglePause();
  } else if (DELUXE && S.screen === 'shop') {
    DLX.shopKey(k);
  } else if (S.screen === 'report' && S.reportT > 0.6) {
    if (k === 'r' || k === ' ' || k === 'enter') restart();
    else if (k === 's') openShare();
    else if (k === 'escape') toMenu();
  }
  if ([' ', 'arrowup', 'arrowdown'].includes(k)) ev.preventDefault();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && S.screen === 'play' && !S.paused) togglePause(); });
window.addEventListener('blur', () => { if (S.screen === 'play' && !S.paused) togglePause(); });
window.addEventListener('resize', resize);

// ---------- cover art (used for the store page) ----------
function drawCover() {
  const L = { x: W / 2, y: H * 0.6 };
  const ring = [['bug', -2.6, 150], ['bug', -0.5, 170], ['ping', -1.6, 190], ['email', 0.4, 175], ['bug', 2.4, 160], ['ping', 1.4, 150], ['bug', 3.1, 210], ['email', -3.0, 230]];
  drawMeeting({ x: L.x + 230, y: L.y - 150, w: 168, h: 56, label: 'Quick sync', sub: '60 min' });
  drawFeature({ x: L.x - 220, y: L.y + 120, w: 130, h: 34, t: 0, seed: 0, label: 'Payments', drag: true });
  drawCreep({ x: L.x + 210, y: L.y + 120, w: 130, h: 32, t: 0.3, seed: 0, label: 'Add AI?' });
  ring.forEach(([t, a, d], i) => {
    const x = L.x + Math.cos(a) * d, y = L.y + Math.sin(a) * d * 0.8;
    if (t === 'bug') drawBug(x, y, 18, i, a + Math.PI, i); else if (t === 'ping') drawPing(x, y, 15, i); else drawEmail(x, y, 22, i, 2, 0);
  });
  drawLaptop(L.x, L.y, 70, false, 0.8, 2);
  drawLogo(W / 2, H * 0.2, Math.min(120, W * 0.17));
  txt('launch day simulator', W / 2, H * 0.2 + 64, 22, C.ink, 'center', 800);
}

// ---------- Deluxe: Series A Week + Zen Mode ----------
// Everything between the two markers exists only in the paid build. build.py replaces the whole
// block with `const DLX = null;` for the free web zip, so keep every Deluxe-only line inside it.
const DLX = null; // Deluxe modes live in the paid download

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { update(dt); draw(); } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
function draw() {
  buttons = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  if (S.screen === 'cover') { drawCover(); return; }
  if (S.screen === 'title') { drawTitle(); drawFx(); drawCornerButtons(); return; }
  if (DELUXE && S.screen === 'shop') { DLX.drawShop(); drawFx(); drawCornerButtons(); return; }
  ctx.save();
  if (S.shake > 0) ctx.translate(rand(-1, 1) * S.shake, rand(-1, 1) * S.shake);
  drawMVP();
  drawGuides();
  for (const e of S.ents) if (e.type === 'feature' || e.type === 'meeting') if (!e.drag) drawEnt(e);
  drawLaptop(S.laptop.x, S.laptop.y, S.burnout, S.stuck > 0, S.k, S.clock);
  if (DELUXE && S.mode === 'series') DLX.drawTeam();
  for (const e of S.ents) if (e.type !== 'feature' && e.type !== 'meeting') drawEnt(e);
  for (const e of S.ents) if (e.type === 'feature' && e.drag) drawEnt(e);
  drawFx();
  ctx.restore();
  if (S.flash > 0) { ctx.fillStyle = S.flashColor; ctx.globalAlpha = S.flash * 0.6; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (S.burnout > 70 && S.screen === 'play') {
    const a = (S.burnout - 70) / 30 * (0.25 + Math.sin(S.clock * 6) * 0.1);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,71,87,0)'); g.addColorStop(1, `rgba(255,71,87,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  drawHUD();
  drawBanner();
  if (S.screen === 'play' && S.paused) drawPause();
  if (S.screen === 'report') drawReport();
  else drawCornerButtons();
}

// small automation hook for tests and store screenshots (no network, no tracking)
const api = {
  get state() { return S; },
  get size() { return { W, H, scale }; },
  start: startGame,
  end: () => endGame('launch'),
  share: openShare,
  cover: () => { S.screen = 'cover'; },
  buttons: () => buttons.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
  deluxe: DELUXE,
  dlx: DELUXE ? DLX : null,
  lastShare: null
};
window.ShipIt = api;

resize();
if (params.get('cover')) S.screen = 'cover';
requestAnimationFrame(frame);
})();
