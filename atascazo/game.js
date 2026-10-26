/* Atascazo 0.1.0 | (c) Cesar Pereiro | all code, art and sounds original, no third-party assets */

/* ---- game/rules.js ---- */
/* Atascazo rules: the pure game logic (no DOM). Works in the browser (window.AtascoRules) and in node.
 *
 * Level spec (JSON):
 *   { v: 1, id, seed, pack, cols, rows,
 *     slots: 5,                  hard-shoulder ("arcen") waiting places
 *     cap: 3,                    cars per transporter truck
 *     trucks: ['red', ...],      truck colours, in arrival order (each takes `cap` cars of its colour)
 *     obstacles: [[x, y], ...],  cones: block paths, never move
 *     cars: [{ x, y, len, dir: 'U'|'D'|'L'|'R', c: 'red', kind?, key?: true, lock?: carIndex }] }
 *   (x, y) is the top-left cell of the car. Horizontal cars face L/R, vertical cars U/D.
 *   A car with `lock: k` cannot leave until car k (which shows a key) has left.
 *
 * Rules:
 *   - Tap a car: if every cell between its nose and the lot edge is empty (and it is not locked) it drives out
 *     onto the ring road and up to the dock. Otherwise it bumps (the tap still counts as a move).
 *   - At the dock: if the truck being loaded has its colour, the car boards. Otherwise it parks on the arcen.
 *   - A full truck leaves; the next one docks and pulls its colour from the arcen at once.
 *   - A car with nowhere to go (arcen full, wrong colour) does not leave: "no room" bump, counts as a move.
 *   - You lose when no car can leave (arcen full and no free car of the truck's colour). Win: every truck full.
 * Boarding never involves a choice (all cars of a colour are equal), so the whole state is the set of cars
 * that have left: the solver keys on that set only.
 */
(function (root) {
  'use strict';

  var COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'teal'];
  var DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  var MAX_CARS = 53;   // two 30-bit words packed into one double for the solver key

  function cellsOf(car) {
    var out = [], horiz = car.dir === 'L' || car.dir === 'R';
    for (var i = 0; i < car.len; i++) out.push(horiz ? [car.x + i, car.y] : [car.x, car.y + i]);
    return out;
  }

  // cells from the nose to the lot edge, nearest first
  function pathOf(car, cols, rows) {
    var d = DIRS[car.dir], out = [];
    var hx = car.dir === 'R' ? car.x + car.len - 1 : car.x;
    var hy = car.dir === 'D' ? car.y + car.len - 1 : car.y;
    var x = hx + d[0], y = hy + d[1];
    while (x >= 0 && y >= 0 && x < cols && y < rows) { out.push([x, y]); x += d[0]; y += d[1]; }
    return out;
  }

  function validate(L) {
    var err = [];
    if (!L || typeof L !== 'object') return ['not an object'];
    if (!(L.cols >= 1 && L.cols <= 12 && L.rows >= 1 && L.rows <= 14)) err.push('bad grid size');
    if (!(L.cap >= 1 && L.cap <= 6)) err.push('bad cap');
    if (!(L.slots >= 1 && L.slots <= 9)) err.push('bad slots');
    if (!Array.isArray(L.cars) || !L.cars.length) return err.concat('no cars');
    if (L.cars.length > MAX_CARS) err.push('too many cars (max ' + MAX_CARS + ')');
    var grid = {}, need = {}, have = {};
    (L.obstacles || []).forEach(function (o) { grid[o[0] + ',' + o[1]] = 'o'; });
    L.cars.forEach(function (c, i) {
      if (!DIRS[c.dir]) err.push('car ' + i + ': bad dir');
      if (!(c.len >= 1 && c.len <= 3)) err.push('car ' + i + ': bad len');
      if (COLORS.indexOf(c.c) < 0) err.push('car ' + i + ': bad colour ' + c.c);
      cellsOf(c).forEach(function (p) {
        if (p[0] < 0 || p[1] < 0 || p[0] >= L.cols || p[1] >= L.rows) err.push('car ' + i + ': out of bounds');
        var k = p[0] + ',' + p[1];
        if (grid[k] !== undefined) err.push('car ' + i + ': overlaps ' + grid[k]);
        grid[k] = i;
      });
      if (c.lock !== undefined && (!(c.lock >= 0 && c.lock < L.cars.length) || c.lock === i || !L.cars[c.lock].key)) err.push('car ' + i + ': bad lock');
      have[c.c] = (have[c.c] || 0) + 1;
    });
    (L.trucks || []).forEach(function (t) { need[t] = (need[t] || 0) + L.cap; });
    Object.keys(need).concat(Object.keys(have)).forEach(function (k) {
      if ((need[k] || 0) !== (have[k] || 0)) err.push('colour ' + k + ': ' + (have[k] || 0) + ' cars for ' + (need[k] || 0) + ' truck places');
    });
    L.cars.forEach(function (c, i) {
      pathOf(c, L.cols, L.rows).forEach(function (p) { if (grid[p[0] + ',' + p[1]] === 'o') err.push('car ' + i + ': a cone blocks its path for ever'); });
    });
    return err;
  }

  /* Static analysis of a level: blockers never change (cars only ever leave), so each car gets the list of
   * cars sitting on its path. Colours live in the state (the recolour booster changes them). */
  function compile(L) {
    var n = L.cars.length, owner = {}, palette = [];
    L.cars.forEach(function (c, i) { cellsOf(c).forEach(function (p) { owner[p[0] + ',' + p[1]] = i; }); });
    L.trucks.forEach(function (t) { if (palette.indexOf(t) < 0) palette.push(t); });
    L.cars.forEach(function (c) { if (palette.indexOf(c.c) < 0) palette.push(c.c); });
    var blockers = L.cars.map(function (c) {
      var seen = [];
      pathOf(c, L.cols, L.rows).forEach(function (p) {
        var o = owner[p[0] + ',' + p[1]];
        if (o !== undefined && seen.indexOf(o) < 0) seen.push(o);
      });
      return seen;
    });
    return {
      level: L, n: n, cap: L.cap, baseSlots: L.slots, palette: palette,
      trucks: L.trucks.map(function (t) { return palette.indexOf(t); }),
      color0: L.cars.map(function (c) { return palette.indexOf(c.c); }),
      blockers: blockers,
      lock: L.cars.map(function (c) { return c.lock === undefined ? -1 : c.lock; }),
      owner: owner
    };
  }

  // ---------------------------------------------------------------- state
  function newState(K) {
    var nc = K.palette.length;
    var st = {
      gone: new Uint8Array(K.n), col: Int8Array.from(K.color0),
      truck: 0, fill: 0, seats: [],                 // seats: car indices in the docked truck
      slots: K.baseSlots, wait: [],                 // wait[k] = car index or -1
      waitCount: new Int16Array(nc), waitTotal: 0,
      moves: 0, bumps: 0, exits: 0, continues: 0, boosters: 0, over: false, won: false, failReason: null
    };
    for (var k = 0; k < st.slots; k++) st.wait.push(-1);
    settle(K, st, []);   // a truck with no cars? (never in valid levels) keeps the invariant anyway
    return st;
  }

  function clone(st) {
    return {
      gone: st.gone.slice(), col: st.col.slice(), truck: st.truck, fill: st.fill, seats: st.seats.slice(),
      slots: st.slots, wait: st.wait.slice(), waitCount: st.waitCount.slice(), waitTotal: st.waitTotal,
      moves: st.moves, bumps: st.bumps, exits: st.exits, continues: st.continues, boosters: st.boosters,
      over: st.over, won: st.won, failReason: st.failReason
    };
  }

  function blockedBy(K, st, i) {
    var b = K.blockers[i];
    for (var j = 0; j < b.length; j++) if (!st.gone[b[j]]) return b[j];
    return -1;
  }
  function isLocked(K, st, i) { return K.lock[i] >= 0 && !st.gone[K.lock[i]]; }
  function isFree(K, st, i) { return !st.gone[i] && !isLocked(K, st, i) && blockedBy(K, st, i) < 0; }
  function truckColor(K, st) { return st.truck < K.trucks.length ? K.trucks[st.truck] : -1; }
  function hasRoom(K, st, i) { return st.col[i] === truckColor(K, st) || st.waitTotal < st.slots; }
  function canLeave(K, st, i) { return isFree(K, st, i) && hasRoom(K, st, i); }

  function legalMoves(K, st) {
    var out = [];
    for (var i = 0; i < K.n; i++) if (canLeave(K, st, i)) out.push(i);
    return out;
  }

  /* After a departure: dock the next trucks and pull their colour from the arcen (cascading). */
  function settle(K, st, ev) {
    while (st.truck < K.trucks.length && st.fill === K.cap) {
      ev.push({ t: 'depart', truck: st.truck, seats: st.seats.slice() });
      st.truck++; st.fill = 0; st.seats = [];
      if (st.truck >= K.trucks.length) break;
      ev.push({ t: 'arrive', truck: st.truck });
      var c = K.trucks[st.truck];
      for (var k = 0; k < st.wait.length && st.fill < K.cap; k++) {
        var car = st.wait[k];
        if (car >= 0 && st.col[car] === c) {
          st.wait[k] = -1; st.waitCount[c]--; st.waitTotal--;
          ev.push({ t: 'transfer', car: car, slot: k, truck: st.truck, seat: st.fill });
          st.seats.push(car); st.fill++;
        }
      }
    }
  }

  function park(K, st, i, ev) {
    var c = st.col[i];
    st.gone[i] = 1; st.exits++;
    if (c === truckColor(K, st)) {
      ev.push({ t: 'board', car: i, truck: st.truck, seat: st.fill });
      st.seats.push(i); st.fill++;
      settle(K, st, ev);
    } else {
      var k = st.wait.indexOf(-1);
      st.wait[k] = i; st.waitCount[c]++; st.waitTotal++;
      ev.push({ t: 'wait', car: i, slot: k });
    }
  }

  function checkEnd(K, st, ev) {
    if (st.truck >= K.trucks.length) { st.over = true; st.won = true; ev.push({ t: 'win' }); return; }
    if (!legalMoves(K, st).length) {
      st.over = true;
      st.failReason = st.waitTotal >= st.slots ? 'arcen_full' : 'stuck';
      ev.push({ t: 'fail', reason: st.failReason });
    }
  }

  /* The player taps car i. Returns { ok, events } where events drive the animations:
   *   bump {car, by: blockerCar | -1 (lock) }, noroom {car}, exit {car}, board, wait, depart, arrive, transfer,
   *   win, fail {reason}. Mutates st. */
  function tap(K, st, i) {
    var ev = [];
    if (st.over || st.gone[i]) return { ok: false, events: ev };
    st.moves++;
    if (isLocked(K, st, i)) { st.bumps++; ev.push({ t: 'bump', car: i, by: -1, lock: K.lock[i] }); return { ok: false, events: ev }; }
    var b = blockedBy(K, st, i);
    if (b >= 0) { st.bumps++; ev.push({ t: 'bump', car: i, by: b }); return { ok: false, events: ev }; }
    if (!hasRoom(K, st, i)) { st.bumps++; ev.push({ t: 'noroom', car: i }); return { ok: false, events: ev }; }
    ev.push({ t: 'exit', car: i });
    park(K, st, i, ev);
    checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  // ---------------------------------------------------------------- boosters (pure; charging is the platform's job)
  /* crane: lift any parked car (blocked or locked) straight to the dock. Needs room like any car. */
  function crane(K, st, i) {
    var ev = [];
    if (st.over || st.gone[i] || !hasRoom(K, st, i)) return { ok: false, events: ev };
    st.boosters++;
    ev.push({ t: 'lift', car: i });
    park(K, st, i, ev);
    checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  /* extra arcen place(s). Also the continue: +n places and the game goes on. */
  function addSlots(K, st, n) {
    st.slots += n;
    for (var k = 0; k < n; k++) st.wait.push(-1);
    if (st.over && !st.won) { st.over = false; st.failReason = null; }
    var ev = [{ t: 'slots', n: n }];
    if (!st.over) checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  /* recolour: deal the colours of the parked cars again (same counts), keeping only a deal the solver can
   * finish. `solvable(K, st)` is injected (solver.js) so this file stays dependency-free. */
  function recolour(K, st, rng, solvable, tries) {
    var parked = [];
    for (var i = 0; i < K.n; i++) if (!st.gone[i]) parked.push(i);
    if (parked.length < 2) return { ok: false, events: [] };
    var cols = parked.map(function (i) { return st.col[i]; });
    var best = null, bestFree = -1;
    for (var t = 0; t < (tries || 24); t++) {
      for (var a = cols.length - 1; a > 0; a--) { var b = Math.floor(rng() * (a + 1)), x = cols[a]; cols[a] = cols[b]; cols[b] = x; }
      var trial = clone(st);
      parked.forEach(function (car, k) { trial.col[car] = cols[k]; });
      trial.over = false; trial.failReason = null;
      if (!legalMoves(K, trial).length) continue;
      if (solvable && !solvable(K, trial)) continue;
      // prefer deals where the docked truck's colour is free right now
      var tc = truckColor(K, trial), free = 0;
      parked.forEach(function (car) { if (trial.col[car] === tc && isFree(K, trial, car)) free++; });
      if (free > bestFree) { bestFree = free; best = cols.slice(); }
      if (free >= 2) break;
    }
    if (!best) return { ok: false, events: [] };
    var ev = [{ t: 'recolour', cars: parked.slice() }];
    parked.forEach(function (car, k) { st.col[car] = best[k]; });
    st.boosters++;
    if (st.over && !st.won) { st.over = false; st.failReason = null; }
    checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  function starsFor(K, st) {
    var extra = st.moves - st.exits;
    var s = extra <= Math.floor(K.n / 12) ? 3 : extra <= Math.floor(K.n / 5) + 1 ? 2 : 1;
    if (st.continues > 0) s = Math.min(s, 2);
    return s;
  }

  var api = {
    COLORS: COLORS, DIRS: DIRS, MAX_CARS: MAX_CARS,
    cellsOf: cellsOf, pathOf: pathOf, validate: validate, compile: compile,
    newState: newState, clone: clone, blockedBy: blockedBy, isLocked: isLocked, isFree: isFree,
    truckColor: truckColor, hasRoom: hasRoom, canLeave: canLeave, legalMoves: legalMoves,
    tap: tap, crane: crane, addSlots: addSlots, recolour: recolour, starsFor: starsFor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtascoRules = api;
})(this);

/* ---- game/solver.js ---- */
/* Atascazo solver and difficulty meter (no DOM; browser: window.AtascoSolver, node: require).
 *
 *   solve(K, st?, { maxNodes, plain })  -> { solved, path: [car], nodes, exhausted }
 *       Depth-first search over "which cars have left" (the whole state, see rules.js) with a memo of
 *       dead states. Move order: cars that board right now, then cars whose colour docks soonest, then cars
 *       that unblock the most. `plain: true` drops the ordering (index order): its node count is a measure of
 *       how much a player without a plan has to try.
 *   solvable(K, st, maxNodes?) -> true | false (unknown after maxNodes counts as true: the generator only
 *       builds levels with a known solution, the cap only matters for booster checks)
 *   playouts(K, rng, n, policy)  -> { winRate, failRate, avgBranch }   policy 'random' | 'greedy'
 *       random: any car that can leave. greedy: a car of the docked truck's colour if one can leave, else any.
 *       The greedy fail rate is the best single predictor of how often a casual player loses.
 *   analyze(K, opts) -> full stats for a level (used by tests and tools/levels.js)
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules || (typeof require === 'function' ? require('./rules.js') : null);
  var WORD = 1073741824; // 2^30

  function Sim(K, st) {
    this.K = K; this.n = K.n;
    this.gone = st ? st.gone.slice() : new Uint8Array(K.n);
    this.col = st ? st.col : Int8Array.from(K.color0);
    this.truck = st ? st.truck : 0;
    this.fill = st ? st.fill : 0;
    this.W = st ? st.waitCount.slice() : new Int16Array(K.palette.length);
    this.wt = st ? st.waitTotal : 0;
    this.slots = st ? st.slots : K.baseSlots;
    this.lo = 0; this.hi = 0;
    for (var i = 0; i < K.n; i++) if (this.gone[i]) { if (i < 30) this.lo += 1 << i; else this.hi += Math.pow(2, i - 30); }
  }
  Sim.prototype.key = function () { return this.lo + this.hi * WORD; };
  Sim.prototype.won = function () { return this.truck >= this.K.trucks.length; };
  Sim.prototype.tc = function () { return this.truck < this.K.trucks.length ? this.K.trucks[this.truck] : -1; };
  Sim.prototype.free = function (i) {
    if (this.gone[i]) return false;
    var l = this.K.lock[i];
    if (l >= 0 && !this.gone[l]) return false;
    var b = this.K.blockers[i];
    for (var j = 0; j < b.length; j++) if (!this.gone[b[j]]) return false;
    return true;
  };
  Sim.prototype.legal = function () {
    var out = [], tc = this.tc(), room = this.wt < this.slots;
    for (var i = 0; i < this.n; i++) if (this.free(i) && (room || this.col[i] === tc)) out.push(i);
    return out;
  };
  Sim.prototype.play = function (i) {
    var rec = { i: i, truck: this.truck, fill: this.fill, wt: this.wt, W: this.W.slice() };
    var K = this.K, c = this.col[i];
    this.gone[i] = 1;
    if (i < 30) this.lo += 1 << i; else this.hi += Math.pow(2, i - 30);
    if (c === this.tc()) {
      this.fill++;
      while (this.fill === K.cap && this.truck < K.trucks.length) {
        this.truck++; this.fill = 0;
        if (this.truck >= K.trucks.length) break;
        var nc = K.trucks[this.truck], take = Math.min(this.W[nc], K.cap);
        this.W[nc] -= take; this.wt -= take; this.fill = take;
      }
    } else { this.W[c]++; this.wt++; }
    return rec;
  };
  Sim.prototype.undo = function (rec) {
    var i = rec.i;
    this.gone[i] = 0;
    if (i < 30) this.lo -= 1 << i; else this.hi -= Math.pow(2, i - 30);
    this.truck = rec.truck; this.fill = rec.fill; this.wt = rec.wt; this.W = rec.W;
  };

  // how many cars each car blocks (static), for move ordering
  function dependents(K) {
    if (K._dep) return K._dep;
    var d = new Int16Array(K.n);
    K.blockers.forEach(function (b) { b.forEach(function (j) { d[j]++; }); });
    K.lock.forEach(function (l) { if (l >= 0) d[l] += 2; });
    return (K._dep = d);
  }

  function order(sim, moves) {
    var K = sim.K, dep = dependents(K), tc = sim.tc(), T = K.trucks;
    var score = function (i) {
      var c = sim.col[i];
      if (c === tc) return 1000 + dep[i];
      var dist = 99;
      for (var t = sim.truck + 1; t < T.length && t < sim.truck + 8; t++) if (T[t] === c) { dist = t - sim.truck; break; }
      return 500 - dist * 20 + dep[i] * 3;
    };
    return moves.sort(function (a, b) { return score(b) - score(a); });
  }

  function solve(K, st, opts) {
    opts = opts || {};
    var max = opts.maxNodes || 200000, plain = !!opts.plain;
    var sim = new Sim(K, st), dead = opts.memo || new Set(), nodes = 0, capped = false, path = [];
    function dfs() {
      if (sim.won()) return true;
      if (nodes >= max) { capped = true; return false; }
      var k = sim.key();
      if (dead.has(k)) return false;
      nodes++;
      var moves = sim.legal();
      if (!plain) order(sim, moves);
      for (var m = 0; m < moves.length; m++) {
        var rec = sim.play(moves[m]);
        path.push(moves[m]);
        if (dfs()) return true;
        path.pop();
        sim.undo(rec);
        if (capped) return false;
      }
      dead.add(k);
      return false;
    }
    var ok = dfs();
    return { solved: ok, path: ok ? path.slice() : null, nodes: nodes, exhausted: !ok && !capped };
  }

  function solvable(K, st, maxNodes) {
    var r = solve(K, st, { maxNodes: maxNodes || 20000 });
    return r.solved || !r.exhausted;
  }

  function playouts(K, rng, count, policy) {
    var wins = 0, branch = 0, steps = 0;
    for (var p = 0; p < count; p++) {
      var sim = new Sim(K, null);
      for (;;) {
        if (sim.won()) { wins++; break; }
        var moves = sim.legal();
        if (!moves.length) break;
        branch += moves.length; steps++;
        if (policy === 'greedy') {
          var tc = sim.tc(), good = moves.filter(function (i) { return sim.col[i] === tc; });
          if (good.length) moves = good;
        }
        sim.play(moves[Math.floor(rng() * moves.length)]);
      }
    }
    return { winRate: wins / count, failRate: 1 - wins / count, avgBranch: steps ? branch / steps : 0 };
  }

  /* Dead-end ratio: along greedy playouts, at every decision taken from a winnable state, the share of
   * legal moves that make the level unwinnable. Exact (memoised search per child, capped). */
  function deadEnds(K, rng, count, maxNodes) {
    var dead = new Set(), alive = new Set(), fatal = 0, total = 0;
    function win(sim) {
      var k = sim.key();
      if (alive.has(k)) return true;
      if (dead.has(k)) return false;
      var st = { gone: sim.gone, col: sim.col, truck: sim.truck, fill: sim.fill, waitCount: sim.W, waitTotal: sim.wt, slots: sim.slots };
      var r = solve(K, st, { maxNodes: maxNodes, memo: dead });
      if (r.solved || !r.exhausted) { alive.add(k); return true; }
      dead.add(k);
      return false;
    }
    for (var p = 0; p < count; p++) {
      var sim = new Sim(K, null);
      while (!sim.won()) {
        var moves = sim.legal();
        if (!moves.length || !win(sim)) break;
        var ok = [];
        for (var m = 0; m < moves.length; m++) {
          var rec = sim.play(moves[m]);
          if (win(sim)) ok.push(moves[m]); else fatal++;
          total++;
          sim.undo(rec);
        }
        var tc = sim.tc(), pool = moves.filter(function (i) { return sim.col[i] === tc; });
        if (!pool.length) pool = moves;
        sim.play(pool[Math.floor(rng() * pool.length)]);
      }
    }
    return total ? fatal / total : 0;
  }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // quick score in [0, 1]: what the generator uses to place a level on the curve (cheap: ~2 ms)
  function quickScore(K, seed, n) {
    var rng = mulberry(seed ^ 0x9e3779b9);
    var g = playouts(K, rng, n || 24, 'greedy'), r = playouts(K, rng, n || 24, 'random');
    return { score: 0.65 * g.failRate + 0.35 * r.failRate, greedyFail: g.failRate, randomFail: r.failRate, branch: g.avgBranch };
  }

  function analyze(K, opts) {
    opts = opts || {};
    var seed = opts.seed || 1, rng = mulberry(seed);
    var s = solve(K, null, { maxNodes: opts.maxNodes || 400000 });
    var plain = solve(K, null, { maxNodes: opts.plainNodes || 50000, plain: true });
    var g = playouts(K, rng, opts.playouts || 200, 'greedy');
    var r = playouts(K, rng, opts.playouts || 200, 'random');
    var out = {
      solved: s.solved, exhausted: s.exhausted, nodes: s.nodes, minMoves: s.solved ? s.path.length : null,
      plainNodes: plain.nodes, plainSolved: plain.solved,
      greedyFail: g.failRate, randomFail: r.failRate, branching: g.avgBranch,
      solution: s.path
    };
    if (opts.deadEnds !== false) out.deadEndRatio = deadEnds(K, rng, opts.deadEndRuns || 6, opts.deadEndNodes || 20000);
    out.difficulty = 0.5 * out.greedyFail + 0.3 * out.randomFail + 0.2 * (out.deadEndRatio || 0);
    return out;
  }

  var api = { Sim: Sim, solve: solve, solvable: solvable, playouts: playouts, deadEnds: deadEnds,
    quickScore: quickScore, analyze: analyze, mulberry: mulberry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtascoSolver = api;
})(this);

/* ---- game/generator.js ---- */
/* Atascazo level generator (no DOM; browser: window.AtascoGen, node: require).
 *
 *   level(n)           -> level spec for map level n (1-based). Deterministic: same n, same level, forever
 *                         (as long as GEN_VERSION is unchanged). Levels beyond COUNT keep coming (endless).
 *   daily('2026-10-26') -> the "Operación Salida" daily level for that date (same for every player)
 *   dailyNumber(date)  -> #1 on the epoch day
 *   params(n)          -> the difficulty-curve knobs for level n
 *   pack(n)            -> the level pack (name, theme, destinations) a level belongs to
 *
 * How a level is built (solvable by construction, then verified):
 *   1. Reverse play. Cars are placed one at a time; each new car must have a clear path to the edge through
 *      the cars placed BEFORE it. Read backwards, the placement order is an exit order in which every car is
 *      free when its turn comes. Placements that block many earlier cars are weighted up as difficulty
 *      rises (deeper dependency chains).
 *   2. Colours. A colour sequence is written along that exit order while simulating the dock: mostly the
 *      docked truck's colour, sometimes a later truck's colour (that car waits on the arcen), never more
 *      waiting cars than the arcen holds. So the exit order is a winning line.
 *   3. Locks/keys: a locked car's key car always comes earlier in the exit order.
 *   4. Several candidates per level; the solver's playout score picks the one closest to the curve target,
 *      and a full solver run must confirm it (belt and braces; it always does).
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules || (typeof require === 'function' ? require('./rules.js') : null);
  var S = root.AtascoSolver || (typeof require === 'function' ? require('./solver.js') : null);

  var GEN_VERSION = 1;
  var PER_PACK = 20;
  var EPOCH = '2026-10-26';
  var CANDIDATES = 8;

  // Packs: Spanish traffic folklore. Destinations are what the motorway panels over the trucks show.
  var PACKS = [
    { id: 'autoescuela', name: 'Primer día de autoescuela', ground: '#cfd5dc', deco: 'cones',
      dest: ['Examen', 'Glorieta', 'Polígono', 'Centro', 'Ronda', 'Plaza Mayor', 'Gasolinera'] },
    { id: 'boda', name: 'Boda en el pueblo', ground: '#d6cfc2', deco: 'flowers',
      dest: ['Iglesia', 'Banquete', 'Ermita', 'Recena', 'Casa novia', 'Pueblo', 'Barra libre'] },
    { id: 'nochebuena', name: 'Parking del centro comercial en Nochebuena', ground: '#c9ccd3', deco: 'lights',
      dest: ['Juguetes', 'Hiper', 'Turrones', 'Planta -3', 'Suegra', 'Cine', 'Salida'] },
    { id: 'm30', name: 'M-30 hora punta', ground: '#c5c9cf', deco: 'city',
      dest: ['Atocha', 'Moncloa', 'Legazpi', 'Pza. Castilla', 'Ventas', 'Puente Vallecas', 'Oficina'] },
    { id: 'centro', name: 'Aparcar en el centro de Madrid', ground: '#cdc8c0', deco: 'city',
      dest: ['Sol', 'Gran Vía', 'Lavapiés', 'Chamberí', 'Malasaña', 'Retiro', 'Zona azul'] },
    { id: 'benidorm', name: 'Salida de Benidorm', ground: '#d8d0bf', deco: 'palms',
      dest: ['Benidorm', 'Altea', 'Calp', 'Alicante', 'Dénia', 'La Vila', 'Guiri Beach'] },
    { id: 'rotonda', name: 'Rotonda infinita', ground: '#c8cfc6', deco: 'roundabout',
      dest: ['1ª salida', '2ª salida', '3ª salida', '4ª salida', 'Otra vuelta', 'Cambio sentido', '5ª salida'] },
    { id: 'puente', name: 'Puente de diciembre', ground: '#d3d8de', deco: 'snow',
      dest: ['Sierra', 'Pirineo', 'Casa rural', 'Asturias', 'Picos', 'Nieve', 'Cañas'] },
    { id: 'paella', name: 'Domingo de paella', ground: '#d9d1bd', deco: 'orange',
      dest: ['Cullera', 'Gandia', 'Albufera', 'El Saler', 'Oliva', 'Valencia', 'Sobremesa'] },
    { id: 'a7', name: 'A-7 en agosto', ground: '#ddd3be', deco: 'palms',
      dest: ['Marbella', 'Málaga', 'Nerja', 'Motril', 'Almería', 'Estepona', 'Chiringuito'] },
    { id: 'vuelta', name: 'Vuelta del puente', ground: '#c6c9cf', deco: 'city',
      dest: ['Madrid', 'Trabajo', 'Lunes', 'Oficina', 'Casa', 'Rutina', 'Atasco'] },
    { id: 'salida', name: 'Operación Salida', ground: '#dcd5c3', deco: 'sun',
      dest: ['Playa', 'Pueblo', 'Costa', 'Montaña', 'Vacaciones', '¡Libertad!', 'Sombrilla'] }
  ];
  var COUNT = PACKS.length * PER_PACK;   // 240 on the map

  var KINDS = { 1: [['mini', 1]], 2: [['sedan', 5], ['furgo', 3], ['autoescuela', 2]], 3: [['caravana', 1], ['bus', 1]] };

  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  var rngOf = S.mulberry;
  function pickW(rng, items) {   // items: [[value, weight]]
    var tot = 0, i;
    for (i = 0; i < items.length; i++) tot += items[i][1];
    var x = rng() * tot;
    for (i = 0; i < items.length; i++) { x -= items[i][1]; if (x < 0) return items[i][0]; }
    return items[items.length - 1][0];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function pack(n) {
    var i = Math.floor((n - 1) / PER_PACK) % PACKS.length;
    return { index: i, pack: PACKS[i], first: Math.floor((n - 1) / PER_PACK) * PER_PACK + 1 };
  }

  /* The curve. t = progress 0..1 over the map; a sawtooth on top: 4-level ramp, relief at the 5th,
   * ramp again, "hard" every 10th. New mechanics never arrive on a hard level. */
  var SAW = [0, 0.04, 0.08, 0.12, -0.08, 0.05, 0.09, 0.13, 0.17, 0.3];
  function params(n, seedOverride) {
    var t = clamp((n - 1) / (COUNT - 20), 0, 1);
    var p = (n - 1) % 10, hard = p === 9 && n > 5, relief = p === 4;
    var d = clamp(0.04 + 0.7 * Math.pow(t, 0.8) + SAW[p] * (0.35 + 0.65 * t) * (n > 5 ? 1 : 0), 0, 1);
    var trucks;
    if (n <= 3) trucks = n + 1;                         // 2, 3, 4 trucks: 6, 9, 12 cars
    else trucks = Math.round(4 + 7.5 * Math.pow(t, 0.75) + (hard ? 1 : 0) - (relief ? 1 : 0));
    trucks = clamp(trucks, 2, 12);
    var colours = n <= 4 ? 2 : n <= 12 ? 3 : n <= 35 ? 4 : n <= 70 ? 5 : n <= 120 ? 6 : 7;
    colours = Math.min(colours, trucks);
    var cars = trucks * 3;
    var density = 0.5 + 0.25 * t + (hard ? 0.04 : 0);
    var cells = Math.ceil(cars * 1.9 / density);
    var cols = clamp(Math.round(Math.sqrt(cells * 0.72)), 4, 8);
    var rows = clamp(Math.ceil(cells / cols), 5, 11);
    if (rows * cols < cells) cols = clamp(Math.ceil(cells / rows), 4, 8);
    var slots = n <= 8 ? 6 : n <= 40 ? 5 : (hard && n > 60 ? 4 : 5);
    return {
      n: n, t: t, d: d, hard: hard, relief: relief, trucks: trucks, colours: colours, cols: cols, rows: rows,
      slots: slots, cap: 3,
      early: 0.12 + 0.5 * d,                       // share of intended exits that wait on the arcen
      slack: d < 0.25 ? 2 : d < 0.6 ? 1 : 0,       // arcen places the intended line leaves free
      bias: 0.3 + 4 * d,                           // weight of placements that block earlier cars
      cones: n < 12 ? 0 : (n === 12 ? 2 : -1),     // -1: random amount (decided per candidate)
      locks: n < 25 ? 0 : (n === 25 ? 1 : -1),
      target: 0.03 + 0.62 * d,                     // quickScore the picker aims for
      seed: seedOverride !== undefined ? seedOverride : hashString('atascazo:v' + GEN_VERSION + ':' + n)
    };
  }

  // ---------------------------------------------------------------- one candidate
  function place(P, rng) {
    var W = P.cols, H = P.rows, n = P.trucks * P.cap;
    var occ = new Int16Array(W * H).fill(-1);   // -1 empty, -2 cone, >=0 car (placement index)
    var cones = [];
    var nCones = P.cones >= 0 ? P.cones : (P.n < 12 ? 0 : Math.floor(rng() * (1 + 3 * P.t)));
    for (var c = 0; c < nCones; c++) {
      var x = Math.floor(rng() * W), y = Math.floor(rng() * H);
      if (occ[y * W + x] === -1) { occ[y * W + x] = -2; cones.push([x, y]); }
    }
    var pathsThrough = [];   // cell -> placed cars whose exit path crosses it
    for (var i = 0; i < W * H; i++) pathsThrough.push([]);
    var placed = [];
    var lenW = P.d < 0.2 ? [[1, 3], [2, 5], [3, 1]] : [[1, 3], [2, 5], [3, 2]];
    for (var k = 0; k < n; k++) {
      var opts = [];
      for (var len = 1; len <= 3; len++) {
        var lw = lenW[len - 1][1];
        ['U', 'D', 'L', 'R'].forEach(function (dir) {
          var horiz = dir === 'L' || dir === 'R';
          for (var y0 = 0; y0 < H; y0++) for (var x0 = 0; x0 < W; x0++) {
            if (horiz ? x0 + len > W : y0 + len > H) continue;
            var car = { x: x0, y: y0, len: len, dir: dir }, ok = true, blocks = 0, seen = {};
            var cl = R.cellsOf(car);
            for (var q = 0; q < cl.length && ok; q++) if (occ[cl[q][1] * W + cl[q][0]] !== -1) ok = false;
            if (!ok) continue;
            var pth = R.pathOf(car, W, H);
            for (q = 0; q < pth.length && ok; q++) if (occ[pth[q][1] * W + pth[q][0]] !== -1) ok = false;
            if (!ok) continue;
            for (q = 0; q < cl.length; q++) {
              var lst = pathsThrough[cl[q][1] * W + cl[q][0]];
              for (var z = 0; z < lst.length; z++) if (!seen[lst[z]]) { seen[lst[z]] = 1; blocks++; }
            }
            var w = lw * (1 + P.bias * blocks) * (pth.length === 0 ? 0.35 : 1);
            opts.push([car, w]);
          }
        });
      }
      if (!opts.length) return null;
      var pick = pickW(rng, opts);
      R.cellsOf(pick).forEach(function (p) { occ[p[1] * W + p[0]] = k; });
      R.pathOf(pick, W, H).forEach(function (p) { pathsThrough[p[1] * W + p[0]].push(k); });
      placed.push(pick);
    }
    return { cars: placed, cones: cones };
  }

  function truckSequence(P, rng) {
    var palette = R.COLORS.slice(0, 8), cols = [];
    // which colours: a seeded pick of P.colours from the palette
    var pool = palette.slice();
    for (var i = 0; i < P.colours; i++) cols.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    var seq = cols.slice();
    while (seq.length < P.trucks) seq.push(cols[Math.floor(rng() * cols.length)]);
    // shuffle, then repair neighbours with the same colour where possible
    for (i = seq.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), x = seq[i]; seq[i] = seq[j]; seq[j] = x; }
    for (var pass = 0; pass < 3; pass++) for (i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) {
      for (j = 0; j < seq.length; j++) if (seq[j] !== seq[i] && (j === 0 || seq[j - 1] !== seq[i]) && (j + 1 >= seq.length || seq[j + 1] !== seq[i])
        && seq[i - 1] !== seq[j] && (i + 1 >= seq.length || seq[i + 1] !== seq[j])) { x = seq[i]; seq[i] = seq[j]; seq[j] = x; break; }
    }
    return seq;
  }

  // colours along the exit order, simulating the dock (see header, step 2)
  function colourLine(P, trucks, rng) {
    var cap = P.cap, n = trucks.length * cap, rem = {}, W = {}, wt = 0, truck = 0, fill = 0, line = [];
    trucks.forEach(function (c) { rem[c] = (rem[c] || 0) + cap; W[c] = 0; });
    var waitCap = Math.max(1, P.slots - P.slack);
    while (line.length < n) {
      var cur = trucks[truck], c = cur;
      if (wt < waitCap && rng() < P.early) {
        var opts = [];
        for (var t = truck + 1; t < trucks.length; t++) {
          var cc = trucks[t];
          if (cc !== cur && rem[cc] > 0 && !opts.some(function (o) { return o[0] === cc; })) opts.push([cc, 1 / (t - truck)]);
        }
        if (opts.length) c = pickW(rng, opts);
      }
      line.push(c); rem[c]--;
      if (c === cur) {
        fill++;
        while (fill === cap && truck < trucks.length) {
          truck++; fill = 0;
          if (truck >= trucks.length) break;
          var nc = trucks[truck], take = Math.min(W[nc], cap);
          W[nc] -= take; wt -= take; fill = take;
        }
      } else { W[c]++; wt++; }
    }
    return line;
  }

  function candidate(P, seed) {
    var rng = rngOf(seed);
    var pl = place(P, rng);
    if (!pl) return null;
    var n = pl.cars.length, trucks = truckSequence(P, rng), line = colourLine(P, trucks, rng);
    // exit order = reverse placement order
    var cars = pl.cars.map(function (c, k) {
      var kind = pickW(rng, KINDS[c.len]);
      return { x: c.x, y: c.y, len: c.len, dir: c.dir, c: line[n - 1 - k], kind: kind, _exit: n - 1 - k };
    });
    var nLocks = P.locks >= 0 ? P.locks : (P.n >= 25 && !P.hard && rng() < 0.45 ? 1 + Math.floor(rng() * (1 + 2 * P.t)) : 0);
    var byExit = cars.slice().sort(function (a, b) { return a._exit - b._exit; });
    for (var l = 0; l < nLocks; l++) {
      var j = Math.floor(n / 3) + Math.floor(rng() * (n - Math.floor(n / 3)));
      var lockCar = byExit[j];
      if (lockCar._key || lockCar._lock) continue;
      var keys = byExit.slice(0, j).filter(function (c) { return !c._lock; });
      if (!keys.length) continue;
      var key = keys[Math.floor(rng() * keys.length)];
      key._key = true; lockCar._lock = key;
    }
    // hide the construction order: cars sorted by position
    cars.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var out = cars.map(function (c) {
      var o = { x: c.x, y: c.y, len: c.len, dir: c.dir, c: c.c, kind: c.kind };
      if (c._key) o.key = true;
      return o;
    });
    cars.forEach(function (c, i) { if (c._lock) out[i].lock = cars.indexOf(c._lock); });
    return {
      v: 1, gen: GEN_VERSION, cols: P.cols, rows: P.rows, slots: P.slots, cap: P.cap,
      trucks: trucks, obstacles: pl.cones, cars: out
    };
  }

  function build(P, id, packIndex) {
    var best = null, bestErr = 1e9, tries = 0, Pc = P;
    while (!best && tries < 6) {
      for (var c = 0; c < CANDIDATES; c++) {
        var seed = (Pc.seed + Math.imul(c + 1 + tries * CANDIDATES, 0x9E3779B1)) >>> 0;
        var L = candidate(Pc, seed);
        if (!L) continue;
        var K = R.compile(L);
        var q = S.quickScore(K, seed);
        var err = Math.abs(q.score - Pc.target);
        if (err < bestErr) {
          var s = S.solve(K, null, { maxNodes: 60000 });
          if (!s.solved) continue;
          bestErr = err; best = L; best.meta = { par: K.n, score: +q.score.toFixed(3), target: +Pc.target.toFixed(3), d: +Pc.d.toFixed(3) };
        }
      }
      if (!best) {   // grid too tight for this seed: one more row, retry
        tries++;
        Pc = Object.assign({}, Pc, { rows: Math.min(Pc.rows + 1, 12), cols: tries > 2 ? Math.min(Pc.cols + 1, 8) : Pc.cols });
      }
    }
    if (!best) throw new Error('level ' + id + ': no buildable candidate');
    best.id = id; best.seed = P.seed; best.pack = packIndex;
    best.hard = !!P.hard;
    return best;
  }

  var cache = {};
  function level(n) {
    if (cache[n]) return cache[n];
    var pk = pack(n);
    return (cache[n] = build(params(n), 'L' + n, pk.index));
  }

  function dayIndex(date) {
    var a = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
    var e = Date.UTC(+EPOCH.slice(0, 4), +EPOCH.slice(5, 7) - 1, +EPOCH.slice(8, 10));
    return Math.round((a - e) / 86400000);
  }
  function dailyNumber(date) { return dayIndex(date) + 1; }
  function todayStr(now) {
    var d = now ? new Date(now) : new Date();
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  /* Daily: Monday is gentle, Sunday is a proper Operación Salida. The epoch is a Monday. */
  function daily(date) {
    var key = 'D' + date;
    if (cache[key]) return cache[key];
    var dow = ((dayIndex(date) % 7) + 7) % 7;
    var P = params(50 + dow * 20, hashString('atascazo:daily:' + date));
    P.hard = dow === 6; P.locks = dow >= 3 ? -1 : 0;
    var L = build(P, 'D' + dailyNumber(date), PACKS.length - 1);
    L.daily = { date: date, number: dailyNumber(date) };
    return (cache[key] = L);
  }

  var api = {
    GEN_VERSION: GEN_VERSION, COUNT: COUNT, PER_PACK: PER_PACK, PACKS: PACKS, EPOCH: EPOCH,
    level: level, daily: daily, dailyNumber: dailyNumber, todayStr: todayStr, params: params, pack: pack,
    hashString: hashString, candidate: candidate, colourLine: colourLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtascoGen = api;
})(this);

/* ---- game/art.js ---- */
/* Atascazo art: every vehicle, truck, sign and the car park are drawn here in code (no image files).
 * Vehicles are pre-rendered once per (kind, length, colour, cell size) into small canvases ("sprites") with
 * their soft shadow baked in, so a frame is just drawImage calls: 60 fps on mid-range phones.
 * All vehicles are drawn facing +x (right). Original designs, no real brands.
 */
(function (root) {
  'use strict';

  // colour + icon per car colour: never colour alone (colour-blind friendly)
  var PALETTE = {
    red: { body: '#e8484b', icon: 'circle', ink: '#ffffff' },
    blue: { body: '#3b7ddd', icon: 'square', ink: '#ffffff' },
    yellow: { body: '#f2bf16', icon: 'triangle', ink: '#5b4300' },
    green: { body: '#2ea862', icon: 'diamond', ink: '#ffffff' },
    purple: { body: '#8d5fd3', icon: 'star', ink: '#ffffff' },
    orange: { body: '#f0852a', icon: 'plus', ink: '#ffffff' },
    pink: { body: '#ec6fae', icon: 'heart', ink: '#ffffff' },
    teal: { body: '#13a1a6', icon: 'hex', ink: '#ffffff' }
  };
  var SIGN_BLUE = '#1d5aa6';

  function setPalette(map) {   // skins: { red: '#hex', ... } body colours only, icons stay
    Object.keys(map || {}).forEach(function (k) { if (PALETTE[k]) PALETTE[k].body = map[k]; });
    spriteCache = {}; iconCache = {};
  }

  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, a) {   // a in -1..1: darken / lighten
    var c = hexToRgb(h).map(function (v) { return Math.round(a < 0 ? v * (1 + a) : v + (255 - v) * a); });
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function mk(w, h) {
    var c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---------------------------------------------------------------- icons
  function iconPath(ctx, id, r) {
    ctx.beginPath();
    var i, a;
    switch (id) {
      case 'circle': ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); break;
      case 'square': rr(ctx, -r * 0.72, -r * 0.72, r * 1.44, r * 1.44, r * 0.22); break;
      case 'triangle': ctx.moveTo(0, -r * 0.92); ctx.lineTo(r * 0.92, r * 0.72); ctx.lineTo(-r * 0.92, r * 0.72); ctx.closePath(); break;
      case 'diamond': ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); break;
      case 'star':
        for (i = 0; i < 10; i++) { a = -Math.PI / 2 + i * Math.PI / 5; var rad = i % 2 ? r * 0.42 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath(); break;
      case 'plus': var t = r * 0.32;
        ctx.moveTo(-t, -r * 0.9); ctx.lineTo(t, -r * 0.9); ctx.lineTo(t, -t); ctx.lineTo(r * 0.9, -t); ctx.lineTo(r * 0.9, t); ctx.lineTo(t, t);
        ctx.lineTo(t, r * 0.9); ctx.lineTo(-t, r * 0.9); ctx.lineTo(-t, t); ctx.lineTo(-r * 0.9, t); ctx.lineTo(-r * 0.9, -t); ctx.lineTo(-t, -t); ctx.closePath(); break;
      case 'heart':
        ctx.moveTo(0, r * 0.85);
        ctx.bezierCurveTo(-r * 1.2, 0, -r * 0.7, -r * 1.0, 0, -r * 0.35);
        ctx.bezierCurveTo(r * 0.7, -r * 1.0, r * 1.2, 0, 0, r * 0.85); ctx.closePath(); break;
      case 'hex':
        for (i = 0; i < 6; i++) { a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); }
        ctx.closePath(); break;
    }
  }
  var iconCache = {};
  // upright icon sprite (drawn over cars after rotation, so a triangle always points up)
  function icon(color, px, dpr) {
    var key = color + '|' + Math.round(px) + '|' + dpr;
    if (iconCache[key]) return iconCache[key];
    var p = PALETTE[color], s = Math.ceil(px * 2.4 * dpr), c = mk(s, s), x = c.getContext('2d');
    x.translate(s / 2, s / 2); x.scale(dpr, dpr);
    var r = px * 0.5;
    x.fillStyle = 'rgba(0,0,0,.18)'; x.save(); x.translate(0, px * 0.06); iconPath(x, p.icon, r); x.fill(); x.restore();
    iconPath(x, p.icon, r); x.fillStyle = p.ink; x.fill();
    return (iconCache[key] = { canvas: c, size: s / dpr });
  }
  function drawIcon(ctx, color, cx, cy, px, dpr) {
    var ic = icon(color, px, dpr || 1);
    ctx.drawImage(ic.canvas, cx - ic.size / 2, cy - ic.size / 2, ic.size, ic.size);
  }

  // ---------------------------------------------------------------- vehicles (facing +x, centred on 0,0)
  function wheels(ctx, L, W, xs) {
    ctx.fillStyle = '#2b2f36';
    xs.forEach(function (x) {
      rr(ctx, x - L * 0.07, -W * 0.56, L * 0.14, W * 0.16, W * 0.05); ctx.fill();
      rr(ctx, x - L * 0.07, W * 0.40, L * 0.14, W * 0.16, W * 0.05); ctx.fill();
    });
  }
  function lights(ctx, xf, xr, W) {
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.ellipse(xf, -W * 0.3, W * 0.07, W * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(xf, W * 0.3, W * 0.07, W * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c4242c';
    rr(ctx, xr, -W * 0.38, W * 0.07, W * 0.16, 2); ctx.fill();
    rr(ctx, xr, W * 0.22, W * 0.07, W * 0.16, 2); ctx.fill();
  }

  // Each body function returns where the roof icon goes: [x, y, size] (or a list of them)
  var BODY = {
    // the small rounded "utilitario": a nod to the classic 1960s Spanish city car, no brand
    mini: function (ctx, L, W, col) {
      wheels(ctx, L, W, [-L * 0.27, L * 0.27]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.46); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = shade(col.hex, -0.18); rr(ctx, -L / 2, -W / 2, L, W, W * 0.46); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
      rr(ctx, -L * 0.45, -W * 0.44, L * 0.9, W * 0.88, W * 0.4); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#34495f';
      rr(ctx, L * 0.1, -W * 0.36, L * 0.17, W * 0.72, W * 0.14); ctx.fill();
      rr(ctx, -L * 0.36, -W * 0.3, L * 0.1, W * 0.6, W * 0.12); ctx.fill();
      rr(ctx, -L * 0.25, -W * 0.36, L * 0.34, W * 0.72, W * 0.3); ctx.fillStyle = col.light; ctx.fill();
      lights(ctx, L * 0.42, -L * 0.5, W);
      return [[-L * 0.08, 0, W * 0.42]];
    },
    sedan: function (ctx, L, W, col) {
      wheels(ctx, L, W, [-L * 0.3, L * 0.3]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.3); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L * 0.3, -W * 0.32); ctx.lineTo(L * 0.44, -W * 0.25);
      ctx.moveTo(L * 0.3, W * 0.32); ctx.lineTo(L * 0.44, W * 0.25); ctx.stroke();
      ctx.fillStyle = '#34495f';
      ctx.beginPath(); ctx.moveTo(L * 0.1, -W * 0.4); ctx.lineTo(L * 0.25, -W * 0.33); ctx.lineTo(L * 0.25, W * 0.33); ctx.lineTo(L * 0.1, W * 0.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-L * 0.22, -W * 0.38); ctx.lineTo(-L * 0.32, -W * 0.32); ctx.lineTo(-L * 0.32, W * 0.32); ctx.lineTo(-L * 0.22, W * 0.38); ctx.closePath(); ctx.fill();
      rr(ctx, -L * 0.22, -W * 0.4, L * 0.32, W * 0.8, W * 0.16); ctx.fillStyle = col.light; ctx.fill();
      ctx.fillStyle = col.dark; rr(ctx, L * 0.06, -W * 0.56, L * 0.04, W * 0.1, 2); ctx.fill(); rr(ctx, L * 0.06, W * 0.46, L * 0.04, W * 0.1, 2); ctx.fill();
      lights(ctx, L * 0.46, -L * 0.5, W);
      return [[-L * 0.06, 0, W * 0.42]];
    },
    autoescuela: function (ctx, L, W, col) {
      var r = BODY.sedan(ctx, L, W, col);
      // driving-school roof plate: white L on blue (generic, no school name)
      ctx.fillStyle = SIGN_BLUE; rr(ctx, L * 0.0, -W * 0.2, L * 0.08, W * 0.4, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(L * 0.02, -W * 0.13, L * 0.012, W * 0.24); ctx.fillRect(L * 0.02, W * 0.08, L * 0.04, W * 0.04);
      return [[-L * 0.13, 0, W * 0.38]];
    },
    furgo: function (ctx, L, W, col) {
      W *= 1.04;
      wheels(ctx, L, W, [-L * 0.3, L * 0.32]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.14); ctx.fillStyle = col; ctx.fill();
      rr(ctx, L * 0.36, -W * 0.44, L * 0.14, W * 0.88, W * 0.2); ctx.fillStyle = col.dark; ctx.fill();
      ctx.fillStyle = '#34495f';
      ctx.beginPath(); ctx.moveTo(L * 0.25, -W * 0.42); ctx.lineTo(L * 0.36, -W * 0.36); ctx.lineTo(L * 0.36, W * 0.36); ctx.lineTo(L * 0.25, W * 0.42); ctx.closePath(); ctx.fill();
      rr(ctx, -L * 0.47, -W * 0.44, L * 0.71, W * 0.88, W * 0.08); ctx.fillStyle = col.light; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = Math.max(1, W * 0.03);
      for (var i = 1; i < 5; i++) { var x = -L * 0.47 + i * L * 0.142; ctx.beginPath(); ctx.moveTo(x, -W * 0.4); ctx.lineTo(x, W * 0.4); ctx.stroke(); }
      lights(ctx, L * 0.47, -L * 0.5, W);
      return [[-L * 0.12, 0, W * 0.44]];
    },
    bus: function (ctx, L, W, col) {
      W *= 1.06;
      wheels(ctx, L, W, [-L * 0.32, -L * 0.2, L * 0.3]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.2); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#34495f';
      rr(ctx, L * 0.42, -W * 0.4, L * 0.06, W * 0.8, W * 0.08); ctx.fill();
      // side windows
      for (var i = 0; i < 7; i++) {
        var x = -L * 0.44 + i * L * 0.12;
        rr(ctx, x, -W * 0.47, L * 0.09, W * 0.1, 2); ctx.fill();
        rr(ctx, x, W * 0.37, L * 0.09, W * 0.1, 2); ctx.fill();
      }
      rr(ctx, -L * 0.46, -W * 0.34, L * 0.86, W * 0.68, W * 0.12); ctx.fillStyle = col.light; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(ctx, -L * 0.3, -W * 0.12, L * 0.1, W * 0.24, 2); ctx.fill(); rr(ctx, L * 0.15, -W * 0.12, L * 0.1, W * 0.24, 2); ctx.fill();
      lights(ctx, L * 0.48, -L * 0.5, W);
      return [[-L * 0.04, 0, W * 0.42]];
    },
    caravana: function (ctx, L, W, col) {
      // car (front 55 %) towing a caravan (rear 40 %), both painted, joined by a hitch
      var cl = L * 0.52, vl = L * 0.4;
      ctx.save(); ctx.translate(-L / 2 + vl / 2, 0);
      ctx.fillStyle = '#2b2f36'; rr(ctx, -vl * 0.08, -W * 0.56, vl * 0.22, W * 0.14, 2); ctx.fill(); rr(ctx, -vl * 0.08, W * 0.42, vl * 0.22, W * 0.14, 2); ctx.fill();
      rr(ctx, -vl / 2, -W * 0.5, vl, W, W * 0.22); ctx.fillStyle = '#f7f4ee'; ctx.fill();
      rr(ctx, -vl * 0.46, -W * 0.44, vl * 0.92, W * 0.88, W * 0.18); ctx.fillStyle = col.light; ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(-vl * 0.5, -W * 0.5, vl, W * 0.12); ctx.fillRect(-vl * 0.5, W * 0.38, vl, W * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; rr(ctx, -vl * 0.16, -W * 0.16, vl * 0.32, W * 0.32, 3); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#5c6470'; ctx.fillRect(-L / 2 + vl - 1, -W * 0.05, L - vl - cl + 2, W * 0.1);
      ctx.save(); ctx.translate(L / 2 - cl / 2, 0);
      var r = BODY.sedan(ctx, cl, W * 0.96, col);
      ctx.restore();
      return [[-L / 2 + vl / 2, 0, W * 0.4], [L / 2 - cl / 2 + r[0][0], 0, W * 0.3]];
    }
  };

  function colObj(hex) {
    // a String with extra props, usable as fillStyle
    var s = new String(hex); // eslint-disable-line no-new-wrappers
    s.hex = hex; s.light = shade(hex, 0.22); s.dark = shade(hex, -0.25);
    return s;
  }

  var spriteCache = {};
  /* Vehicle sprite: { canvas, w, h, icons: [[x, y, size] in sprite-centred px] }. Drawn at css px * dpr. */
  function vehicle(kind, len, color, cell, dpr) {
    var key = kind + len + color + '|' + Math.round(cell * 10) + '|' + dpr;
    if (spriteCache[key]) return spriteCache[key];
    var L = len * cell - cell * 0.16, W = cell * 0.7, m = cell * 0.22;
    var w = L + m * 2, h = W * 1.12 + m * 2;
    var c = mk(w * dpr, h * dpr), x = c.getContext('2d');
    x.scale(dpr, dpr); x.translate(w / 2, h / 2);
    var col = colObj(PALETTE[color].body), fn = BODY[kind] || BODY.sedan;
    // shadow: silhouette, offset down-right, blurred
    x.save();
    x.shadowColor = 'rgba(25,35,55,.28)'; x.shadowBlur = cell * 0.12 * dpr; x.shadowOffsetX = cell * 0.03 * dpr; x.shadowOffsetY = cell * 0.07 * dpr;
    rr(x, -L / 2, -W / 2, L, W, W * 0.3); x.fillStyle = 'rgba(0,0,0,.25)'; x.fill();
    x.restore();
    var icons = fn(x, L, W, col);
    // soft top highlight
    x.globalCompositeOperation = 'source-atop';
    var g = x.createLinearGradient(0, -W / 2, 0, W / 2); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
    x.fillStyle = g; x.fillRect(-w / 2, -h / 2, w, h);
    x.globalCompositeOperation = 'source-over';
    return (spriteCache[key] = { canvas: c, w: w, h: h, icons: icons, L: L, W: W });
  }

  /* Draw a vehicle centred at (cx, cy), heading `ang` (0 = right), scale s. Icons are kept upright. */
  function drawVehicle(ctx, car, color, cx, cy, ang, s, cell, dpr, alpha) {
    var sp = vehicle(car.kind || 'sedan', car.len, color, cell, dpr);
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(s, s);
    ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    ctx.restore();
    var ca = Math.cos(ang), sa = Math.sin(ang);
    for (var i = 0; i < sp.icons.length; i++) {
      var ic = sp.icons[i];
      drawIcon(ctx, color, cx + (ic[0] * ca - ic[1] * sa) * s, cy + (ic[0] * sa + ic[1] * ca) * s, ic[2] * s, dpr);
    }
  }

  /* small chevron on the bonnet: which way the car will drive (parked cars only) */
  function drawChevron(ctx, car, cx, cy, ang, cell) {
    var L = car.len * cell - cell * 0.16, x = L / 2 - cell * (car.len === 1 ? 0.1 : 0.15), r = cell * 0.09;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(x - r, -r * 1.1); ctx.lineTo(x + r * 0.5, 0); ctx.lineTo(x - r, r * 1.1);
    ctx.lineWidth = Math.max(1.6, cell * 0.06); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
    ctx.restore();
  }

  function drawKey(ctx, x, y, r) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#8a6400'; ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath(); ctx.arc(-r * 0.35, 0, r * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillRect(-r * 0.05, -r * 0.12, r * 0.95, r * 0.24); ctx.strokeRect(-r * 0.05, -r * 0.12, r * 0.95, r * 0.24);
    ctx.fillRect(r * 0.55, 0, r * 0.16, r * 0.38);
    ctx.restore();
  }
  function drawLock(ctx, x, y, r, open) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#3c3f46'; ctx.lineWidth = r * 0.24; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.42, Math.PI, open ? Math.PI * 1.75 : 0); ctx.stroke();
    rr(ctx, -r * 0.62, -r * 0.2, r * 1.24, r * 0.95, r * 0.2); ctx.fillStyle = '#ffd34d'; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke();
    ctx.fillStyle = '#3c3f46'; ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCone(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(25,35,55,.22)'; ctx.beginPath(); ctx.ellipse(s * 0.05, s * 0.1, s * 0.34, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    rr(ctx, -s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.1); ctx.fillStyle = '#3a3d44'; ctx.fill();
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* Car transporter ("góndola"), facing -x (it leaves to the left). x,y = top-left, len x h px.
   * Returns seat centres (cars face left). */
  function truckSeats(x, y, len, h, cap) {
    var cab = len * 0.2, bay = (len - cab - len * 0.04) / cap, out = [];
    for (var i = 0; i < cap; i++) out.push([x + cab + len * 0.02 + bay * (i + 0.5), y + h / 2, bay]);
    return out;
  }
  function drawTruck(ctx, x, y, len, h, color, cap, wheelPhase) {
    var p = PALETTE[color], cab = len * 0.2;
    ctx.save();
    ctx.fillStyle = 'rgba(25,35,55,.22)'; rr(ctx, x + 3, y + h * 0.12 + 4, len, h * 0.8, h * 0.18); ctx.fill();
    // wheels
    ctx.fillStyle = '#2b2f36';
    var wx = [x + cab * 0.45, x + cab + len * 0.12, x + len * 0.62, x + len * 0.86];
    wx.forEach(function (w, i) {
      rr(ctx, w - h * 0.12, y + h * 0.04, h * 0.24, h * 0.12, 2); ctx.fill();
      rr(ctx, w - h * 0.12, y + h * 0.84, h * 0.24, h * 0.12, 2); ctx.fill();
    });
    // trailer deck (ramps) in the truck colour
    rr(ctx, x + cab + len * 0.01, y + h * 0.1, len - cab - len * 0.01, h * 0.8, h * 0.12); ctx.fillStyle = shade(p.body, -0.15); ctx.fill();
    rr(ctx, x + cab + len * 0.025, y + h * 0.17, len - cab - len * 0.04, h * 0.66, h * 0.08); ctx.fillStyle = '#e9ecef'; ctx.fill();
    // bay separators
    var seats = truckSeats(x, y, len, h, cap);
    ctx.strokeStyle = 'rgba(60,70,85,.25)'; ctx.lineWidth = 1.5;
    seats.forEach(function (s, i) { if (i) { ctx.beginPath(); ctx.moveTo(s[0] - s[2] / 2, y + h * 0.2); ctx.lineTo(s[0] - s[2] / 2, y + h * 0.8); ctx.stroke(); } });
    // cab
    rr(ctx, x, y + h * 0.08, cab, h * 0.84, h * 0.22); ctx.fillStyle = '#f8f8f6'; ctx.fill();
    ctx.fillStyle = p.body; rr(ctx, x + cab * 0.55, y + h * 0.08, cab * 0.45, h * 0.84, h * 0.1); ctx.fill();
    ctx.fillStyle = '#34495f'; rr(ctx, x + cab * 0.12, y + h * 0.18, cab * 0.18, h * 0.64, h * 0.08); ctx.fill();
    ctx.fillStyle = '#fff6c8'; rr(ctx, x + 1, y + h * 0.14, cab * 0.06, h * 0.12, 2); ctx.fill(); rr(ctx, x + 1, y + h * 0.74, cab * 0.06, h * 0.12, 2); ctx.fill();
    ctx.restore();
    return seats;
  }

  /* Spanish-motorway-style panel: blue, white inner border, white text. No official symbols. */
  function drawSign(ctx, x, y, w, h, text, color, dpr) {
    ctx.save();
    ctx.fillStyle = '#8b96a3'; ctx.fillRect(x + w * 0.2, y + h, w * 0.04, h * 0.5); ctx.fillRect(x + w * 0.76, y + h, w * 0.04, h * 0.5);
    rr(ctx, x, y, w, h, h * 0.16); ctx.fillStyle = SIGN_BLUE; ctx.fill();
    rr(ctx, x + 3, y + 3, w - 6, h - 6, h * 0.12); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
    var chip = h * 0.62;
    if (color) {
      rr(ctx, x + h * 0.2, y + (h - chip) / 2, chip, chip, chip * 0.2); ctx.fillStyle = PALETTE[color].body; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      drawIcon(ctx, color, x + h * 0.2 + chip / 2, y + h / 2, chip * 0.62, dpr);
    }
    ctx.fillStyle = '#fff';
    var fs = h * 0.44;
    ctx.font = '700 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var tx = x + (color ? h * 0.32 + chip : h * 0.3), maxW = x + w - tx - h * 0.62;
    while (ctx.measureText(text).width > maxW && fs > 7) { fs -= 1; ctx.font = '700 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; }
    ctx.fillText(text, tx, y + h / 2 + 1);
    // arrow to the left (the exit direction)
    var ax = x + w - h * 0.36, ay = y + h / 2, a = h * 0.2;
    ctx.beginPath(); ctx.moveTo(ax - a, ay); ctx.lineTo(ax, ay - a); ctx.lineTo(ax, ay - a * 0.4); ctx.lineTo(ax + a * 0.7, ay - a * 0.4);
    ctx.lineTo(ax + a * 0.7, ay + a * 0.4); ctx.lineTo(ax, ay + a * 0.4); ctx.lineTo(ax, ay + a); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // small decorations around the car park, per pack theme
  function drawDeco(ctx, kind, x, y, s, rnd) {
    ctx.save(); ctx.translate(x, y);
    switch (kind) {
      case 'palms':
        ctx.fillStyle = 'rgba(25,35,55,.15)'; ctx.beginPath(); ctx.ellipse(s * 0.1, s * 0.12, s * 0.5, s * 0.36, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#3f9d5a';
        for (var i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * Math.PI / 3 + rnd); ctx.beginPath(); ctx.ellipse(s * 0.26, 0, s * 0.3, s * 0.1, 0, 0, 7); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, 7); ctx.fill(); break;
      case 'lights':
        var cs = ['#ff5a5f', '#ffd34d', '#4cc38a', '#4c9be8'];
        for (i = 0; i < 4; i++) { ctx.fillStyle = cs[(i + Math.floor(rnd * 4)) % 4]; ctx.beginPath(); ctx.arc((i - 1.5) * s * 0.28, Math.sin(i + rnd) * s * 0.08, s * 0.08, 0, 7); ctx.fill(); }
        break;
      case 'flowers':
        for (i = 0; i < 5; i++) { ctx.fillStyle = i ? '#f6a6c1' : '#ffd34d'; ctx.beginPath(); ctx.arc(i ? Math.cos(i * 1.256 + rnd) * s * 0.14 : 0, i ? Math.sin(i * 1.256 + rnd) * s * 0.14 : 0, s * 0.1, 0, 7); ctx.fill(); }
        break;
      case 'orange':
        ctx.fillStyle = '#4f9a4a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 7); ctx.fill();
        ctx.fillStyle = '#f39a1e'; [[-.12, -.08], [.12, .04], [-.02, .15]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, s * 0.07, 0, 7); ctx.fill(); });
        break;
      case 'snow':
        ctx.fillStyle = '#2f7a55'; ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.3, s * 0.3); ctx.lineTo(-s * 0.3, s * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.12, -s * 0.12); ctx.lineTo(-s * 0.12, -s * 0.12); ctx.closePath(); ctx.fill(); break;
      case 'sun':
        ctx.fillStyle = '#f2694b'; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.32, i * Math.PI / 2, i * Math.PI / 2 + Math.PI / 4); ctx.closePath(); ctx.fill(); }
        break;
      case 'roundabout':
        ctx.fillStyle = '#5aa86a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, 7); ctx.stroke(); break;
      case 'city':
        ctx.fillStyle = '#9aa6b2'; rr(ctx, -s * 0.06, -s * 0.36, s * 0.12, s * 0.72, 3); ctx.fill();
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, -s * 0.36, s * 0.1, 0, 7); ctx.fill(); break;
      default:  // cones
        drawCone(ctx, 0, 0, s * 0.7);
    }
    ctx.restore();
  }

  var api = { PALETTE: PALETTE, SIGN_BLUE: SIGN_BLUE, setPalette: setPalette, shade: shade, rr: rr, mk: mk,
    iconPath: iconPath, drawIcon: drawIcon, vehicle: vehicle, drawVehicle: drawVehicle, drawChevron: drawChevron, drawKey: drawKey, drawLock: drawLock,
    drawCone: drawCone, drawTruck: drawTruck, truckSeats: truckSeats, drawSign: drawSign, drawDeco: drawDeco };
  root.AtascoArt = api;
})(this);

/* ---- game/game.js ---- */
/* Atascazo game: canvas renderer, animations, input and the platform-facing API.
 *
 *   var game = AtascoGame.create(canvas, hooks)
 *   game.start(levelSpec)            play a level (any valid spec: AtascoGen.level(n), .daily(date), or JSON)
 *   game.restart()
 *   game.canUseBooster(id)           'undo' | 'slot' | 'shuffle' | 'crane'  -> bool (for button states)
 *   game.requestBooster(id)          asks hooks.onBoosterRequest(id) to charge, then applies -> Promise<bool>
 *                                    (crane first waits for the player to pick a car; cancel = no charge)
 *   game.useBooster(id, carIndex?)   applies without charging (platform grants, tests) -> bool
 *   game.applyContinue()             +CONTINUE_SLOTS arcen places, the level goes on
 *   game.cancelCrane(), game.setSound(bool), game.resize(), game.state(), game.destroy()
 *
 * hooks (all optional):
 *   onLevelComplete({ levelId, stars, movesUsed, coinsEarned, bumps, boostersUsed, continues, cars, trucks, timeMs, daily })
 *   onContinueRequested({ reason, continues }) -> bool | Promise<bool>   called when the level is lost;
 *        true = the platform granted a continue (ad / coins), false = the player gave up. Missing = gave up.
 *   onFail({ levelId, reason, movesUsed, continues })   final: the player gave up. reason 'arcen_full' | 'stuck'
 *   onBoosterRequest(id) -> bool | Promise<bool>        charge the booster (inventory / coins / ad)
 *   onMove({ car, ok, kind })  onTruckDepart({ truck, color })  onChange(summary)  coinsFor(stars, level)
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules, S = root.AtascoSolver, A = root.AtascoArt;
  var CONTINUE_SLOTS = 2, MAX_EXTRA_SLOTS = 3;
  var ANG = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function angLerp(a, b, t) { var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * t; }

  // ---------------------------------------------------------------- sound (tiny synth, no files)
  function Sfx() {
    var ac = null, on = true;
    function ctx() {
      if (!ac) { try { ac = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f, d, type, vol, when, slide) {
      var a = on && ctx(); if (!a) return;
      var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
    }
    return {
      set on(v) { on = v; }, get on() { return on; }, unlock: ctx,
      go: function () { tone(330, 0.12, 'triangle', 0.08, 0, 520); },
      board: function (i) { tone(660 + (i || 0) * 110, 0.12, 'sine', 0.1); },
      wait: function () { tone(300, 0.1, 'triangle', 0.07); },
      bump: function () { tone(140, 0.14, 'square', 0.05, 0, 90); },
      honk: function () { tone(415, 0.16, 'square', 0.05); tone(523, 0.16, 'square', 0.04, 0.02); },
      depart: function () { tone(392, 0.22, 'sawtooth', 0.04); tone(494, 0.3, 'sawtooth', 0.035, 0.18); },
      win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.09, i * 0.09); }); },
      fail: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.08, i * 0.14); }); },
      pop: function () { tone(880, 0.08, 'sine', 0.08, 0, 1320); }
    };
  }

  function create(canvas, hooks) {
    hooks = hooks || {};
    var ctx = canvas.getContext('2d');
    var sfx = Sfx();
    if (hooks.sound === false) sfx.on = false;
    var G = {
      L: null, K: null, st: null, undo: [], cars: [], occ: null, lay: null, bg: null, dpr: 1,
      trucks: { idx: 0, slide: 0, slideT: 1, leaving: [] }, parts: [], flash: 0, crane: null,
      ended: false, offer: null, startTime: 0, settleT: 0, raf: 0, last: 0, rng: null, time: 0
    };

    // ---------------------------------------------------------------- layout
    function layout() {
      var rect = canvas.getBoundingClientRect();
      var W = Math.max(200, rect.width), H = Math.max(300, rect.height);
      G.dpr = Math.min(root.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * G.dpr); canvas.height = Math.round(H * G.dpr);
      if (!G.L) { G.lay = { W: W, H: H }; return; }
      var L = G.L, pad = 8;
      var dockH = clamp(H * 0.2, 104, 156), arcenH = clamp(H * 0.095, 50, 70);
      var top = dockH + arcenH + 4, availH = H - top - pad;
      var cell = Math.min((W - 2 * pad) / (L.cols + 1.3), availH / (L.rows + 1.3), 64);
      var r = cell * 0.65, lotW = L.cols * cell, lotH = L.rows * cell;
      var lotX = (W - lotW) / 2, lotY = top + r + Math.max(0, (availH - lotH - 2 * r) * 0.35);
      var signH = clamp(dockH * 0.24, 24, 34), laneY = signH * 1.55 + 6, laneH = dockH - laneY - 4;
      var truckH = clamp(laneH * 0.86, 34, 58), truckLen = clamp(W * 0.62, 190, 300);
      G.lay = {
        W: W, H: H, pad: pad, dockH: dockH, arcenY: dockH, arcenH: arcenH, cell: cell, r: r,
        lotX: lotX, lotY: lotY, lotW: lotW, lotH: lotH,
        ring: { l: lotX - r / 2, t: lotY - r / 2, r: lotX + lotW + r / 2, b: lotY + lotH + r / 2 },
        signH: signH, laneY: laneY, laneH: laneH, truckH: truckH, truckLen: truckLen,
        truckY: laneY + (laneH - truckH) / 2, dockX: W / 2 - truckLen * 0.62, gap: 18
      };
      layoutSlots();
      drawBg();
    }
    function layoutSlots() {
      var l = G.lay, n = G.st ? G.st.slots : G.L.slots;
      var sw = Math.min((l.W - 2 * l.pad) / n, 66), x0 = (l.W - sw * n) / 2;
      l.slotW = sw; l.slotX = x0;
    }
    function slotCenter(k) { var l = G.lay; return [l.slotX + l.slotW * (k + 0.5), l.arcenY + l.arcenH / 2]; }

    function truckX(t) {
      var tr = G.trucks, l = G.lay;
      for (var i = 0; i < tr.leaving.length; i++) if (tr.leaving[i].t0 === t) return tr.leaving[i].x;
      if (t < tr.idx) return -9999;
      return l.dockX + (t - tr.idx) * (l.truckLen + l.gap) + tr.slide;
    }
    function seatPos(t, s) {
      var l = G.lay, seats = A.truckSeats(truckX(t), l.truckY, l.truckLen, l.truckH, G.K.cap);
      return seats[s];
    }

    function carCenter(i) {
      var c = G.L.cars[i], l = G.lay, horiz = c.dir === 'L' || c.dir === 'R';
      return [l.lotX + (c.x + (horiz ? c.len / 2 : 0.5)) * l.cell, l.lotY + (c.y + (horiz ? 0.5 : c.len / 2)) * l.cell];
    }
    function fitScale(car, room, roomW) {
      var l = G.lay;
      return Math.min(room / (car.len * l.cell), roomW / (l.cell * 0.78), 1);
    }
    /* Where a car rests in its current mode: [x, y, angle, scale] */
    function home(v) {
      var car = G.L.cars[v.i], l = G.lay;
      if (v.mode === 'park' || !v.target) { var c = carCenter(v.i); return [c[0], c[1], ANG[car.dir], 1]; }
      if (v.target.type === 'slot') {
        var sc = slotCenter(v.target.slot);
        return [sc[0], sc[1], -Math.PI / 2, fitScale(car, l.arcenH * 0.86, l.slotW * 0.8)];
      }
      var sp = seatPos(v.target.truck, v.target.seat);
      return [sp[0], sp[1], Math.PI, fitScale(car, sp[2] * 0.94, l.truckH * 0.66)];
    }

    // ---------------------------------------------------------------- background (pre-rendered)
    function drawBg() {
      var l = G.lay, d = G.dpr, pk = (root.AtascoGen && AtascoGen.PACKS[G.L.pack || 0]) || { ground: '#cfd5dc', deco: 'cones' };
      var c = G.bg && G.bg.width === canvas.width && G.bg.height === canvas.height ? G.bg : A.mk(canvas.width, canvas.height);
      var x = c.getContext('2d');
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, l.W, l.H);
      x.fillStyle = '#e7eddc'; x.fillRect(0, 0, l.W, l.H);
      // motorway lane at the top
      x.fillStyle = '#d7dfca'; x.fillRect(0, 0, l.W, l.laneY);
      x.fillStyle = '#6f7684'; x.fillRect(0, l.laneY, l.W, l.laneH);
      x.fillStyle = '#fff'; x.fillRect(0, l.laneY + 2, l.W, 2); x.fillRect(0, l.laneY + l.laneH - 4, l.W, 2);
      x.globalAlpha = 0.6;
      for (var dx = 6; dx < l.W; dx += 28) x.fillRect(dx, l.laneY + l.laneH / 2 - 1, 14, 2);
      x.globalAlpha = 1;
      // arcen (hard shoulder) with parking bays
      x.fillStyle = '#9aa1ad'; x.fillRect(0, l.arcenY, l.W, l.arcenH);
      x.fillStyle = '#fff'; x.fillRect(0, l.arcenY + 1, l.W, 2);
      var n = G.st ? G.st.slots : G.L.slots;
      for (var k = 0; k < n; k++) {
        var sx = l.slotX + l.slotW * k;
        A.rr(x, sx + 3, l.arcenY + 5, l.slotW - 6, l.arcenH - 10, 7);
        x.fillStyle = k >= G.L.slots ? '#c7b98a' : '#b7bdc6'; x.fill();
        x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.5; x.stroke();
      }
      // ring road + lot
      var rg = l.ring, r = l.r;
      A.rr(x, rg.l - r / 2, rg.t - r / 2, rg.r - rg.l + r, rg.b - rg.t + r, r * 0.9); x.fillStyle = '#737a88'; x.fill();
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.5; x.setLineDash([8, 9]);
      A.rr(x, rg.l, rg.t, rg.r - rg.l, rg.b - rg.t, r * 0.5); x.stroke(); x.setLineDash([]);
      // entry from the top road to the arcen
      x.fillStyle = '#737a88'; x.fillRect(l.W / 2 - r * 0.8, l.arcenY + l.arcenH - 2, r * 1.6, rg.t - l.arcenY - l.arcenH + 4);
      A.rr(x, l.lotX - 2, l.lotY - 2, l.lotW + 4, l.lotH + 4, 6); x.fillStyle = A.shade(pk.ground, -0.12); x.fill();
      x.fillStyle = pk.ground; x.fillRect(l.lotX, l.lotY, l.lotW, l.lotH);
      x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1;
      for (var gx = 1; gx < G.L.cols; gx++) { x.beginPath(); x.moveTo(l.lotX + gx * l.cell, l.lotY + 3); x.lineTo(l.lotX + gx * l.cell, l.lotY + l.lotH - 3); x.stroke(); }
      for (var gy = 1; gy < G.L.rows; gy++) {
        x.setLineDash([4, 6]); x.beginPath(); x.moveTo(l.lotX + 3, l.lotY + gy * l.cell); x.lineTo(l.lotX + l.lotW - 3, l.lotY + gy * l.cell); x.stroke();
      }
      x.setLineDash([]);
      (G.L.obstacles || []).forEach(function (o) { A.drawCone(x, l.lotX + (o[0] + 0.5) * l.cell, l.lotY + (o[1] + 0.5) * l.cell, l.cell); });
      // decorations in the margins (seeded, so stable)
      var rnd = S.mulberry(G.L.seed || 7), ds = Math.max(14, l.cell * 0.55);
      for (var q = 0; q < 10; q++) {
        var side = q % 2, yy = rg.t + (rg.b - rg.t) * (0.1 + 0.8 * rnd());
        var xx = side ? (rg.r + r / 2 + (l.W - rg.r - r / 2) / 2) : (rg.l - r / 2) / 2;
        if ((side ? l.W - rg.r - r / 2 : rg.l - r / 2) > ds * 0.9) A.drawDeco(x, pk.deco, xx, yy, ds, rnd() * 6);
      }
      for (q = 0; q < 6; q++) A.drawDeco(x, pk.deco, 14 + rnd() * (l.W - 28), 8 + rnd() * (l.laneY - 16) * 0.3, ds * 0.7, rnd() * 6);
      G.bg = c;
    }

    // ---------------------------------------------------------------- level start / rebuild
    function start(spec) {
      var err = R.validate(spec);
      if (err.length) throw new Error('invalid level: ' + err.join('; '));
      G.L = spec; G.K = R.compile(spec); G.st = R.newState(G.K); G.undo = [];
      G.rng = S.mulberry((spec.seed || 1) ^ 0x51ed);
      G.occ = {};
      spec.cars.forEach(function (c, i) { R.cellsOf(c).forEach(function (p) { G.occ[p[0] + ',' + p[1]] = i; }); });
      G.ended = false; G.offer = null; G.crane = null; G.parts = []; G.flash = 0; G.settleT = 0;
      G.startTime = Date.now();
      layout();
      rebuild();
      changed();
      wake();
      return api;
    }
    function rebuild() {
      var st = G.st;
      G.cars = G.L.cars.map(function (c, i) { return { i: i, mode: 'park', target: null, x: 0, y: 0, a: 0, s: 1, anim: null, fx: null }; });
      st.wait.forEach(function (car, k) { if (car >= 0) { G.cars[car].mode = 'slot'; G.cars[car].target = { type: 'slot', slot: k }; } });
      st.seats.forEach(function (car, s) { G.cars[car].mode = 'seat'; G.cars[car].target = { type: 'seat', truck: st.truck, seat: s }; });
      G.cars.forEach(function (v, i) { if (st.gone[i] && v.mode === 'park') v.mode = 'gone'; });
      G.trucks = { idx: st.truck, slide: 0, slideT: 1, leaving: [] };
      G.cars.forEach(function (v) { if (v.mode !== 'gone') { var h = home(v); v.x = h[0]; v.y = h[1]; v.a = h[2]; v.s = h[3]; } });
    }

    // ---------------------------------------------------------------- animations
    function ringPoint(p) {   // perimeter coordinate of a point on the ring centreline (clockwise from top-left)
      var g = G.lay.ring, w = g.r - g.l, h = g.b - g.t;
      if (Math.abs(p[1] - g.t) < 0.5) return p[0] - g.l;
      if (Math.abs(p[0] - g.r) < 0.5) return w + (p[1] - g.t);
      if (Math.abs(p[1] - g.b) < 0.5) return w + h + (g.r - p[0]);
      return 2 * w + h + (g.b - p[1]);
    }
    function ringPath(from, to) {
      var g = G.lay.ring, w = g.r - g.l, h = g.b - g.t, P = 2 * (w + h);
      var corners = [[w, [g.r, g.t]], [w + h, [g.r, g.b]], [2 * w + h, [g.l, g.b]], [P, [g.l, g.t]]];
      var a = ringPoint(from), b = ringPoint(to), cw = ((b - a) % P + P) % P, out = [from];
      var dir = cw <= P - cw ? 1 : -1, dist = dir > 0 ? cw : P - cw;
      var list = [];
      corners.forEach(function (c) {
        var cp = c[0] % P, rel = dir > 0 ? ((cp - a) % P + P) % P : ((a - cp) % P + P) % P;
        if (rel > 0.5 && rel < dist - 0.5) list.push([rel, c[1]]);
      });
      list.sort(function (x, y) { return x[0] - y[0]; }).forEach(function (c) { out.push(c[1]); });
      out.push(to);
      return out;
    }
    function smooth(pts, rad) {   // round the corners of a polyline with quadratic curves
      var out = [pts[0]];
      for (var i = 1; i < pts.length - 1; i++) {
        var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
        var d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        var r1 = Math.min(rad, d1 / 2), r2 = Math.min(rad, d2 / 2);
        var a = [p1[0] + (p0[0] - p1[0]) * r1 / (d1 || 1), p1[1] + (p0[1] - p1[1]) * r1 / (d1 || 1)];
        var b = [p1[0] + (p2[0] - p1[0]) * r2 / (d2 || 1), p1[1] + (p2[1] - p1[1]) * r2 / (d2 || 1)];
        out.push(a);
        for (var k = 1; k < 6; k++) {
          var t = k / 6, u = 1 - t;
          out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]]);
        }
        out.push(b);
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    function measured(pts) {
      var acc = [0];
      for (var i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts: pts, acc: acc, len: acc[acc.length - 1] };
    }
    function at(path, s) {
      var acc = path.acc, pts = path.pts, i = 1;
      while (i < acc.length - 1 && acc[i] < s) i++;
      var seg = acc[i] - acc[i - 1] || 1, t = clamp((s - acc[i - 1]) / seg, 0, 1);
      var p = pts[i - 1], q = pts[i];
      return [lerp(p[0], q[0], t), lerp(p[1], q[1], t), Math.atan2(q[1] - p[1], q[0] - p[0])];
    }

    function driveAnim(v) {
      var car = G.L.cars[v.i], l = G.lay, g = l.ring, c = carCenter(v.i), e;
      if (car.dir === 'R') e = [g.r, c[1]]; else if (car.dir === 'L') e = [g.l, c[1]];
      else if (car.dir === 'U') e = [c[0], g.t]; else e = [c[0], g.b];
      var gate = [l.W / 2, g.t];
      var pts = ringPath(e, gate);
      pts.unshift(c);
      var path = measured(smooth(pts, l.r * 0.9));
      var tail = Math.hypot(home(v)[0] - gate[0], home(v)[1] - gate[1]);
      var speed = Math.max(950, l.W * 2.6);
      v.mode = 'drive';
      v.anim = { kind: 'drive', path: path, gate: gate, t: 0, dur: 0.3 + (path.len + tail) / speed };
    }
    function liftAnim(v) {
      v.mode = 'drive';
      v.anim = { kind: 'lift', from: [v.x, v.y, v.a], t: 0, dur: 0.95 };
    }
    function transferAnim(v, slot) {
      v.mode = 'transfer';
      v.anim = { kind: 'transfer', slot: slot, t: 0, dur: 0.42, wait: true };
    }

    function stepCar(v, dt) {
      var an = v.anim;
      if (v.fx) { v.fx.t += dt; if (v.fx.t > v.fx.dur) v.fx = null; }
      if (!an) {
        if (v.mode !== 'gone') { var h0 = home(v); v.x = h0[0]; v.y = h0[1]; v.a = h0[2]; v.s = h0[3]; }
        return;
      }
      if (an.wait) {   // transfer waits for its truck to dock
        if (G.trucks.idx === v.target.truck && G.trucks.slideT >= 1) an.wait = false;
        else { var sc = slotCenter(an.slot); v.x = sc[0]; v.y = sc[1]; return; }
      }
      an.t += dt;
      var p = clamp(an.t / an.dur, 0, 1), h = home(v);
      if (an.kind === 'drive') {
        var tailLen = Math.hypot(h[0] - an.gate[0], h[1] - an.gate[1]), total = an.path.len + tailLen;
        var s = easeInOut(p) * total;
        if (s <= an.path.len) { var q = at(an.path, s); v.x = q[0]; v.y = q[1]; v.a = angLerp(v.a, q[2], clamp(dt * 16, 0, 1)); v.s = 1; }
        else {
          var u = tailLen ? (s - an.path.len) / tailLen : 1, segA = Math.atan2(h[1] - an.gate[1], h[0] - an.gate[0]);
          v.x = lerp(an.gate[0], h[0], u); v.y = lerp(an.gate[1], h[1], u);
          v.a = angLerp(angLerp(v.a, segA, clamp(dt * 16, 0, 1)), h[2], easeInOut(u));
          v.s = lerp(1, h[3], easeInOut(u));
        }
      } else if (an.kind === 'lift') {
        var up = clamp(p / 0.3, 0, 1), fly = clamp((p - 0.3) / 0.7, 0, 1), e = easeInOut(fly);
        v.x = lerp(an.from[0], h[0], e); v.y = lerp(an.from[1], h[1], e) - Math.sin(e * Math.PI) * G.lay.cell * 0.8;
        v.a = angLerp(an.from[2], h[2], e);
        v.s = lerp(1 + 0.25 * easeOut(up), h[3], e);
      } else if (an.kind === 'transfer') {
        var sc2 = slotCenter(an.slot), e2 = easeInOut(p);
        v.x = lerp(sc2[0], h[0], e2); v.y = lerp(sc2[1], h[1], e2) - Math.sin(e2 * Math.PI) * 18;
        v.a = angLerp(-Math.PI / 2, h[2], e2); v.s = h[3] * (1 + 0.15 * Math.sin(e2 * Math.PI));
      }
      if (p >= 1) {
        v.anim = null;
        v.mode = v.target.type === 'slot' ? 'slot' : 'seat';
        v.x = h[0]; v.y = h[1]; v.a = h[2]; v.s = h[3];
        if (v.mode === 'seat') { sfx.board(v.target.seat); burst(h[0], h[1], A.PALETTE[G.K.palette[G.st.col[v.i]]].body, 8); }
        else sfx.wait();
      }
    }

    function stepTrucks(dt) {
      var tr = G.trucks, st = G.st, l = G.lay;
      if (tr.slideT < 1) { tr.slideT = Math.min(1, tr.slideT + dt / 0.45); tr.slide = (1 - easeOut(clamp(tr.slideT, 0, 1))) * (l.truckLen + l.gap); }
      tr.leaving = tr.leaving.filter(function (lv) {
        lv.t += dt;
        var p = clamp(lv.t / 0.75, 0, 1);
        lv.x = lv.x0 - p * p * (lv.x0 + l.truckLen + 60);
        if (Math.random() < 0.5) puff(lv.x + l.truckLen, l.truckY + l.truckH * (0.3 + Math.random() * 0.4));
        if (p >= 1) { G.cars.forEach(function (v) { if (v.target && v.target.type === 'seat' && v.target.truck === lv.t0) v.mode = 'gone'; }); return false; }
        return true;
      });
      // the docked truck leaves once the logic has moved past it and all its cars are aboard
      if (tr.idx < st.truck && tr.slideT >= 1) {
        var t = tr.idx, ready = G.cars.every(function (v) { return !(v.target && v.target.type === 'seat' && v.target.truck === t) || v.mode === 'seat'; });
        if (ready) {
          tr.leaving.push({ t0: t, t: 0, x0: truckX(t), x: truckX(t) });   // t0 = truck index, t = clock
          tr.idx++;
          if (tr.idx < G.K.trucks.length) { tr.slideT = -0.6; tr.slide = l.truckLen + l.gap; }   // short pause, then slide in
          sfx.depart();
          if (hooks.onTruckDepart) hooks.onTruckDepart({ truck: t, color: G.K.palette[G.K.trucks[t]] });
        }
      }
    }

    function busy() {
      if (G.trucks.leaving.length || G.trucks.slideT < 1 || G.trucks.idx < G.st.truck) return true;
      for (var i = 0; i < G.cars.length; i++) if (G.cars[i].anim || G.cars[i].fx) return true;
      return false;
    }

    // ---------------------------------------------------------------- particles
    function burst(x, y, color, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
        G.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, c: color, r: 2 + Math.random() * 2, k: 'spark' });
      }
    }
    function puff(x, y) {
      G.parts.push({ x: x, y: y, vx: 30 + Math.random() * 30, vy: (Math.random() - 0.5) * 16, life: 0.6, max: 0.6, c: 'rgba(120,128,140,', r: 4 + Math.random() * 4, k: 'puff' });
    }
    function confetti() {
      var cs = ['#e8484b', '#3b7ddd', '#f2bf16', '#2ea862', '#8d5fd3', '#f0852a', '#ec6fae', '#13a1a6'];
      for (var i = 0; i < 140; i++) {
        G.parts.push({ x: Math.random() * G.lay.W, y: -10 - Math.random() * G.lay.H * 0.3, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160,
          life: 2.6, max: 2.6, c: cs[i % cs.length], r: 3 + Math.random() * 3, k: 'confetti', a: Math.random() * 6, va: (Math.random() - 0.5) * 12 });
      }
    }
    function stepParts(dt) {
      G.parts = G.parts.filter(function (p) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'spark') { p.vx *= 0.9; p.vy *= 0.9; }
        if (p.k === 'confetti') { p.a += p.va * dt; p.vx += Math.sin(p.life * 4) * 20 * dt; }
        if (p.k === 'puff') p.r += 10 * dt;
        return p.life > 0;
      });
    }

    // ---------------------------------------------------------------- frame
    function frame(now) {
      G.raf = 0;
      var dt = G.last ? Math.min(0.05, (now - G.last) / 1000) : 0.016;
      G.last = now; G.time += dt;
      if (!G.L) return;
      G.cars.forEach(function (v) { stepCar(v, dt); });
      stepTrucks(dt);
      stepParts(dt);
      if (G.flash > 0) G.flash = Math.max(0, G.flash - dt);
      draw();
      checkSettled(dt);
      if (busy() || G.parts.length || G.flash > 0 || G.crane || G.settleT > 0) wake();
      else G.last = 0;
    }
    function wake() { if (!G.raf && typeof requestAnimationFrame !== 'undefined') G.raf = requestAnimationFrame(frame); }

    function draw() {
      var l = G.lay, d = G.dpr, st = G.st, K = G.K;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(G.bg, 0, 0);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      // parked cars
      var moving = [], docked = [];
      G.cars.forEach(function (v) {
        if (v.mode === 'park') drawCar(v); else if (v.mode === 'drive' || v.mode === 'transfer') moving.push(v); else if (v.mode !== 'gone') docked.push(v);
      });
      // trucks + signs
      var vis = [];
      G.trucks.leaving.forEach(function (lv) { vis.push(lv.t0); });
      for (var t = G.trucks.idx; t < K.trucks.length && t < G.trucks.idx + 3; t++) vis.push(t);
      vis.forEach(function (t) {
        var x = truckX(t);
        if (x > l.W + 10 || x < -l.truckLen - 80) return;
        var color = K.palette[K.trucks[t]];
        var seats = A.drawTruck(ctx, x, l.truckY, l.truckLen, l.truckH, color, K.cap);
        // ghost icons on empty bays
        seats.forEach(function (s, k) {
          var full = G.cars.some(function (v) { return v.target && v.target.type === 'seat' && v.target.truck === t && v.target.seat === k && v.mode === 'seat'; });
          if (!full) { ctx.globalAlpha = 0.35; A.drawIcon(ctx, color, s[0], s[1], l.truckH * 0.34, d); ctx.globalAlpha = 1; }
        });
      });
      docked.forEach(function (v) { if (v.target && v.target.type === 'seat') drawCar(v); });
      // sign for the docked truck + upcoming chips
      var dt = G.trucks.idx < K.trucks.length ? G.trucks.idx : -1;
      if (dt >= 0) {
        var pk = (root.AtascoGen && AtascoGen.PACKS[G.L.pack || 0]) || { dest: ['Salida'] };
        var sw = Math.min(l.truckLen * 0.95, l.W * 0.6), sx = truckX(dt) + (l.truckLen - sw) / 2;
        A.drawSign(ctx, sx, 6, sw, l.signH, pk.dest[(dt + (G.L.seed || 0)) % pk.dest.length], K.palette[K.trucks[dt]], d);
        var cx = l.W - 10, chip = l.signH * 0.62;
        for (var q = Math.min(K.trucks.length - 1, dt + 4); q > dt; q--) {
          var col = K.palette[K.trucks[q]];
          cx -= chip + 4;
          if (cx < sx + sw + 4) break;
          A.rr(ctx, cx, 6 + (l.signH - chip) / 2, chip, chip, chip * 0.25); ctx.fillStyle = A.PALETTE[col].body; ctx.fill();
          A.drawIcon(ctx, col, cx + chip / 2, 6 + l.signH / 2, chip * 0.6, d);
        }
        // trucks left counter
        ctx.fillStyle = '#41505f'; ctx.font = '700 ' + Math.round(l.signH * 0.42) + 'px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        var gy = 6 + l.signH / 2, gs = l.signH * 0.34;
        A.rr(ctx, 8, gy - gs * 0.55, gs * 0.7, gs * 1.1, 3); ctx.fill(); A.rr(ctx, 8 + gs * 0.8, gy - gs * 0.55, gs * 1.5, gs * 1.1, 3); ctx.fill();
        ctx.fillText((K.trucks.length - dt) + '', 12 + gs * 2.4, gy);
      }
      docked.forEach(function (v) { if (v.target && v.target.type === 'slot') drawCar(v); });
      if (G.flash > 0) {   // arcen full flash
        ctx.fillStyle = 'rgba(232,72,75,' + (G.flash * 0.5) + ')'; ctx.fillRect(0, l.arcenY, l.W, l.arcenH);
      }
      moving.forEach(drawCar);
      // crane mode: hook over the lot
      if (G.crane) {
        ctx.fillStyle = 'rgba(29,90,166,' + (0.08 + 0.05 * Math.sin(G.time * 6)) + ')';
        A.rr(ctx, l.lotX - 4, l.lotY - 4, l.lotW + 8, l.lotH + 8, 8); ctx.fill();
      }
      G.cars.forEach(function (v) { if (v.anim && v.anim.kind === 'lift') {
        ctx.strokeStyle = '#3c3f46'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(v.x, 0); ctx.lineTo(v.x, v.y); ctx.stroke();
      } });
      // particles
      G.parts.forEach(function (p) {
        var a = clamp(p.life / p.max, 0, 1);
        if (p.k === 'puff') { ctx.fillStyle = p.c + (0.35 * a) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
        else if (p.k === 'confetti') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, a * 2); ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); ctx.restore(); }
        else { ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      });
    }

    function drawCar(v) {
      var car = G.L.cars[v.i], l = G.lay, ox = 0, oy = 0, da = 0, s = v.s;
      if (v.fx) {
        var f = v.fx, t = f.t;
        if (f.kind === 'bump') {
          var off = t < 0.09 ? f.dist * easeOut(t / 0.09) : f.dist * Math.exp(-(t - 0.09) * 14) * Math.cos((t - 0.09) * 30);
          ox = Math.cos(v.a) * off; oy = Math.sin(v.a) * off;
        } else if (f.kind === 'wiggle') { da = 0.07 * Math.exp(-t * 9) * Math.sin(t * 48); }
        else if (f.kind === 'pop') { s *= 1 + 0.22 * Math.sin(Math.PI * clamp(t / f.dur, 0, 1)); }
        else if (f.kind === 'hop') { oy = -Math.sin(Math.PI * clamp(t / f.dur, 0, 1)) * l.cell * 0.18; }
      }
      var color = G.K.palette[G.st.col[v.i]];
      A.drawVehicle(ctx, car, color, v.x + ox, v.y + oy, v.a + da, s, l.cell, G.dpr);
      if (v.mode === 'park') A.drawChevron(ctx, car, v.x + ox, v.y + oy, v.a + da, l.cell);
      if (car.key && v.mode === 'park') A.drawKey(ctx, v.x + ox + l.cell * 0.22, v.y + oy - l.cell * 0.22, l.cell * 0.22);
      if (v.mode === 'park' && G.K.lock[v.i] >= 0) {
        var open = G.st.gone[G.K.lock[v.i]];
        if (!open || (v.fx && v.fx.kind === 'unlock')) {
          var sh = v.fx && v.fx.kind === 'lockshake' ? Math.sin(v.fx.t * 60) * 3 * Math.exp(-v.fx.t * 6) : 0;
          ctx.globalAlpha = open ? clamp(1 - v.fx.t / v.fx.dur, 0, 1) : 1;
          A.drawLock(ctx, v.x + ox + sh, v.y + oy, l.cell * 0.26, open);
          ctx.globalAlpha = 1;
        }
      }
    }

    function checkSettled(dt) {
      var st = G.st;
      if (!st.over || G.ended || G.offer) { G.settleT = 0; return; }
      if (busy()) return;
      G.settleT += dt;
      if (G.settleT < (st.won ? 0.15 : 0.35)) return;
      G.settleT = 0;
      if (st.won) finishWin(); else offerContinue();
    }

    function finishWin() {
      G.ended = true;
      confetti(); sfx.win(); wake();
      var st = G.st, stars = R.starsFor(G.K, st);
      var res = {
        levelId: G.L.id, stars: stars, movesUsed: st.moves, bumps: st.bumps, boostersUsed: st.boosters, continues: st.continues,
        cars: G.K.n, trucks: G.K.trucks.length, timeMs: Date.now() - G.startTime, daily: G.L.daily || null
      };
      res.coinsEarned = hooks.coinsFor ? hooks.coinsFor(stars, G.L) : 10 + stars * 5;
      setTimeout(function () { if (hooks.onLevelComplete) hooks.onLevelComplete(res); }, 900);
    }

    function offerContinue() {
      var st = G.st, token = {};
      G.offer = token;
      sfx.fail();
      var info = { reason: st.failReason, continues: st.continues };
      var ask = hooks.onContinueRequested ? hooks.onContinueRequested(info) : false;
      Promise.resolve(ask).then(function (yes) {
        if (G.offer !== token) return;         // a new level started meanwhile
        G.offer = null;
        if (!G.st.over) { changed(); return; } // a booster (undo, shuffle) already saved it
        if (yes) applyContinue();
        else {
          G.ended = true;
          if (hooks.onFail) hooks.onFail({ levelId: G.L.id, reason: st.failReason, movesUsed: st.moves, continues: st.continues });
        }
      });
    }

    // ---------------------------------------------------------------- events from the rules -> visuals
    function apply(res) {
      var ev = res.events;
      ev.forEach(function (e, k) {
        var v = e.car !== undefined ? G.cars[e.car] : null;
        switch (e.t) {
          case 'exit': case 'lift':
            for (var j = k + 1; j < ev.length; j++) {
              if (ev[j].car === e.car && (ev[j].t === 'board' || ev[j].t === 'wait')) {
                v.target = ev[j].t === 'board' ? { type: 'seat', truck: ev[j].truck, seat: ev[j].seat } : { type: 'slot', slot: ev[j].slot };
                break;
              }
            }
            if (e.t === 'exit') { driveAnim(v); sfx.go(); } else { liftAnim(v); sfx.pop(); }
            // unlock fx on cars this one held the key for
            G.K.lock.forEach(function (l, i) { if (l === e.car && !G.st.gone[i]) G.cars[i].fx = { kind: 'unlock', t: 0, dur: 0.5 }; });
            break;
          case 'transfer':
            v.target = { type: 'seat', truck: e.truck, seat: e.seat };
            transferAnim(v, e.slot);
            break;
          case 'bump':
            var dist;
            if (e.by >= 0) {
              var path = R.pathOf(G.L.cars[e.car], G.L.cols, G.L.rows), free = 0;
              for (var q = 0; q < path.length; q++) { var o = G.occ[path[q][0] + ',' + path[q][1]]; if (o !== undefined && !G.st.gone[o]) break; free++; }
              dist = clamp(free * G.lay.cell + G.lay.cell * 0.06, G.lay.cell * 0.08, G.lay.cell * 0.32);
              G.cars[e.by].fx = { kind: 'wiggle', t: 0, dur: 0.45 };
              v.fx = { kind: 'bump', t: 0, dur: 0.45, dist: dist };
            } else {
              v.fx = { kind: 'lockshake', t: 0, dur: 0.5 };
              if (e.lock >= 0) G.cars[e.lock].fx = { kind: 'pop', t: 0, dur: 0.4 };
            }
            sfx.bump();
            break;
          case 'noroom':
            v.fx = { kind: 'hop', t: 0, dur: 0.3 }; G.flash = 0.6; sfx.honk();
            break;
          case 'slots':
            layoutSlots(); drawBg();
            var sc = slotCenter(G.st.slots - 1); burst(sc[0], sc[1], '#f2bf16', 14);
            break;
          case 'recolour':
            e.cars.forEach(function (i) { G.cars[i].fx = { kind: 'pop', t: 0, dur: 0.35 }; });
            sfx.pop();
            break;
        }
      });
      changed();
      wake();
    }

    function changed() {
      if (!hooks.onChange || !G.st) return;
      var st = G.st;
      hooks.onChange({
        levelId: G.L.id, moves: st.moves, exits: st.exits, cars: G.K.n, trucksLeft: G.K.trucks.length - st.truck,
        slots: st.slots, waiting: st.waitTotal, over: st.over, won: st.won, crane: !!G.crane,
        boosters: { undo: canUse('undo'), slot: canUse('slot'), shuffle: canUse('shuffle'), crane: canUse('crane') }
      });
    }

    // ---------------------------------------------------------------- input
    function carAt(px, py) {
      var l = G.lay, gx = (px - l.lotX) / l.cell, gy = (py - l.lotY) / l.cell;
      var tryCell = function (x, y) {
        var o = G.occ[Math.floor(x) + ',' + Math.floor(y)];
        return o !== undefined && G.cars[o].mode === 'park' ? o : -1;
      };
      var hit = tryCell(gx, gy);
      if (hit >= 0) return hit;
      var m = 0.3;   // forgiving taps near a car's edge
      var cands = [[gx - m, gy], [gx + m, gy], [gx, gy - m], [gx, gy + m]];
      for (var i = 0; i < cands.length; i++) { hit = tryCell(cands[i][0], cands[i][1]); if (hit >= 0) return hit; }
      return -1;
    }
    function onDown(e) {
      if (!G.L) return;
      sfx.unlock();
      var r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      var i = carAt(px, py);
      if (G.crane) {
        if (i < 0) { if (py < G.lay.arcenY + G.lay.arcenH) cancelCrane(); return; }
        if (!R.hasRoom(G.K, G.st, i)) { G.cars[i].fx = { kind: 'hop', t: 0, dur: 0.3 }; G.flash = 0.6; wake(); return; }
        var cr = G.crane; G.crane = null;
        Promise.resolve(hooks.onBoosterRequest ? hooks.onBoosterRequest('crane') : true).then(function (ok) {
          var done = ok && useBooster('crane', i);
          cr.resolve(!!done); changed();
        });
        return;
      }
      if (i < 0 || G.st.over || G.offer) return;
      e.preventDefault();
      tapCar(i);
    }
    function tapCar(i) {
      var snap = R.clone(G.st);
      var res = R.tap(G.K, G.st, i);
      if (res.ok) { G.undo.push(snap); if (G.undo.length > 50) G.undo.shift(); }
      if (hooks.onMove) hooks.onMove({ car: i, ok: res.ok, kind: res.events.length ? res.events[0].t : 'none' });
      apply(res);
      return res;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.style.touchAction = 'none';
    var onResize = function () { if (G.L) { layout(); G.cars.forEach(function (v) { if (!v.anim && v.mode !== 'gone') { var h = home(v); v.x = h[0]; v.y = h[1]; v.a = h[2]; v.s = h[3]; } }); draw(); } else layout(); };
    if (typeof ResizeObserver !== 'undefined') { var ro = new ResizeObserver(onResize); ro.observe(canvas); }
    else root.addEventListener('resize', onResize);

    // ---------------------------------------------------------------- boosters / continue
    function canUse(id) {
      var st = G.st;
      if (!st || st.won || G.ended) return false;
      switch (id) {
        case 'undo': return G.undo.length > 0;
        case 'slot': return !st.over && st.slots < G.L.slots + MAX_EXTRA_SLOTS + st.continues * CONTINUE_SLOTS;
        case 'shuffle': var parked = 0; for (var i = 0; i < G.K.n; i++) if (!st.gone[i]) parked++; return parked >= 2;
        case 'crane': if (st.over) return false; for (i = 0; i < G.K.n; i++) if (!st.gone[i] && R.hasRoom(G.K, st, i)) return true; return false;
      }
      return false;
    }
    function useBooster(id, arg) {
      if (!canUse(id)) return false;
      var st = G.st, res;
      if (id === 'undo') {
        var prev = G.undo.pop();
        ['moves', 'bumps', 'continues'].forEach(function (k) { prev[k] = st[k]; });
        prev.boosters = st.boosters + 1;
        if (prev.slots < st.slots) { while (prev.wait.length < st.slots) prev.wait.push(-1); prev.slots = st.slots; }
        G.st = prev;
        G.parts = []; rebuild(); layoutSlots(); drawBg(); changed(); wake();
        return true;
      }
      if (id === 'slot') { res = R.addSlots(G.K, st, 1); st.boosters++; }
      else if (id === 'shuffle') {
        res = R.recolour(G.K, st, G.rng, function (K, s) { return S.solvable(K, s, 15000); }, 30);
        if (res.ok) G.undo = [];   // old snapshots carry old colours
      } else if (id === 'crane') {
        var snap = R.clone(st);
        res = R.crane(G.K, st, arg);
        if (res.ok) G.undo.push(snap);
      }
      if (!res || !res.ok) return false;
      apply(res);
      return true;
    }
    function requestBooster(id) {
      if (!canUse(id)) return Promise.resolve(false);
      if (id === 'crane') {
        if (G.crane) { cancelCrane(); return Promise.resolve(false); }
        return new Promise(function (resolve) { G.crane = { resolve: resolve }; changed(); wake(); });
      }
      return Promise.resolve(hooks.onBoosterRequest ? hooks.onBoosterRequest(id) : true).then(function (ok) { return ok ? useBooster(id) : false; });
    }
    function cancelCrane() { if (G.crane) { var c = G.crane; G.crane = null; c.resolve(false); changed(); wake(); } }
    function applyContinue() {
      var st = G.st;
      if (!st || st.won) return false;
      st.continues++;
      apply(R.addSlots(G.K, st, CONTINUE_SLOTS));
      G.ended = false;
      return true;
    }

    var api = {
      start: start,
      restart: function () { return start(G.L); },
      canUseBooster: canUse, useBooster: useBooster, requestBooster: requestBooster, cancelCrane: cancelCrane,
      applyContinue: applyContinue,
      setSound: function (on) { sfx.on = !!on; },
      resize: onResize,
      state: function () { return G.st; },
      get level() { return G.L; },
      destroy: function () { canvas.removeEventListener('pointerdown', onDown); if (G.raf) cancelAnimationFrame(G.raf); },
      // test / tooling helpers
      debug: {
        G: G,
        idle: function () { return !busy(); },
        solution: function () { var r = S.solve(G.K, G.st, { maxNodes: 200000 }); return r.solved ? r.path : null; },
        carCenter: function (i) { var c = carCenter(i), b = canvas.getBoundingClientRect(); return [b.left + c[0], b.top + c[1]]; },
        tap: tapCar
      }
    };
    layout();
    return api;
  }

  root.AtascoGame = { create: create, CONTINUE_SLOTS: CONTINUE_SLOTS };
})(this);

/* ---- game/config.js ---- */
/* Atascazo's game config for the gamekit platform: the part of the economy that is specific to this game.
 * Same shape as game-blocks/src/game/config.js (Teselo); gamekit merges it over its platform defaults
 * (GamekitUtil.merge(GamekitConfig, AtascazoGameConfig, ['products', 'skins'])).
 * The standalone shell (src/shell/shell.js) only uses `boosters.start` and `continue`.
 */
(function (root) {
  'use strict';
  var GAME = {
    game: { id: 'atascazo', title: 'Atascazo' },
    platform: { epoch: '2026-10-26' },

    coins: { modes: { daily: { base: 20, per100: 0 } } },   // levels use the platform's levelWin / perNewStar

    // undo: last car back to its spot | slot: +1 arcen place | shuffle: repaint the parked cars (always to a
    // winnable deal) | crane: lift any one car out, blocked or locked
    boosters: {
      start: { undo: 3, slot: 2, shuffle: 1, crane: 1 },
      price: { undo: 40, slot: 80, shuffle: 100, crane: 120 }   // multiples of 20; coin packs are multiples of 40
    },
    continue: { extraSlots: 2, maxPerLevel: 2 },   // game-side meaning of a platform "continue" (R1)

    // car paint skins: body colours per colour id (icons never change, colour-blind safe)
    skins: [
      { id: 'clasico', kind: 'cars', price: 0, paint: null },
      { id: 'pastel', kind: 'cars', price: 500, paint: { red: '#f08a8c', blue: '#7fa8ec', yellow: '#f5d561', green: '#7cc99a', purple: '#b39ae4', orange: '#f5ad6f', pink: '#f3a3c9', teal: '#6cc6c9' } },
      { id: 'ochentas', kind: 'cars', price: 800, paint: { red: '#d7263d', blue: '#1b998b', yellow: '#f4d35e', green: '#3bb273', purple: '#6c4ab6', orange: '#ee964b', pink: '#f45b69', teal: '#2e86ab' } },
      { id: 'verano', kind: 'cars', starterOnly: true, paint: { red: '#ff6b6b', blue: '#4dabf7', yellow: '#ffd43b', green: '#51cf66', purple: '#9775fa', orange: '#ff922b', pink: '#f783ac', teal: '#3bc9db' } }
    ],

    chests: { boosterOrder: ['undo', 'slot', 'shuffle', 'crane'] },

    // quest metrics this game reports: cars trucks perfect boosters (+ platform: games levels stars daily)
    quests: {
      daily: [
        { id: 'cars40', metric: 'cars', target: 40, reward: { coins: 30, xp: 25 } },
        { id: 'trucks12', metric: 'trucks', target: 12, reward: { coins: 30, xp: 25 } },
        { id: 'levels3', metric: 'levels', target: 3, reward: { coins: 40, xp: 30 } },
        { id: 'perfect1', metric: 'perfect', target: 1, reward: { coins: 40, xp: 30 } },
        { id: 'stars6', metric: 'stars', target: 6, reward: { coins: 40, xp: 30 } },
        { id: 'daily1', metric: 'daily', target: 1, reward: { coins: 30, xp: 25 } },
        { id: 'booster1', metric: 'boosters', target: 1, reward: { coins: 20, xp: 20 } }
      ],
      weekly: [
        { id: 'w-cars400', metric: 'cars', target: 400, reward: { coins: 200, xp: 120 } },
        { id: 'w-levels15', metric: 'levels', target: 15, reward: { coins: 200, xp: 120 } },
        { id: 'w-daily5', metric: 'daily', target: 5, reward: { coins: 250, xp: 150 } },
        { id: 'w-perfect10', metric: 'perfect', target: 10, reward: { coins: 200, xp: 120 } }
      ]
    },

    pass: {
      free: function (t) { return t % 5 === 0 ? { chest: 'silver' } : t % 2 ? { coins: 40 } : { boosters: { undo: 1 } }; },
      premium: function (t) {
        return t === 30 ? { skin: 'ochentas' } : t % 5 === 0 ? { chest: 'gold' } : t % 3 === 0 ? { boosters: { crane: 1, slot: 1 } } : { coins: 80 };
      }
    },

    products: [
      { id: 'starter_pack', type: 'non_consumable', price: '1,99 €', offer: 'starter',
        grant: { coins: 1500, boosters: { undo: 3, slot: 3, shuffle: 3, crane: 3 }, skin: 'verano', noAdsDays: 7 } },
      { id: 'boosters_bundle', type: 'consumable', price: '1,99 €', grant: { boosters: { undo: 5, slot: 3, crane: 3 } } }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GAME;
  else root.AtascazoGameConfig = GAME;
})(this);

/* ---- shell/shell.js ---- */
/* Atascazo standalone shell: menu, level map, HUD, boosters bar, win / lose screens, local save.
 * It plays the platform's role with a stub (free boosters, a "simulated ad" when a booster runs out,
 * free continues) so the game is playable alone. gamekit replaces this file; the game API it talks to is
 * documented at the top of src/game/game.js.
 *
 * URL params (handy for testing): ?level=12  ?daily=2026-10-26  ?reset=1  ?mute=1
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CFG = window.AtascazoGameConfig, GEN = window.AtascoGen;
  var KEY = 'atascazo.v1';
  var qs = {};
  location.search.replace(/[?&]([^=&]+)=?([^&]*)/g, function (_, k, v) { qs[k] = decodeURIComponent(v); });

  var WIN = ['¡Has llegado antes que la DGT!', 'Aparcas mejor que tu cuñado.', 'Ni un rasguño. Ni un pitido.',
    '¡Sin multas este puente!', 'Benidorm te espera.', 'Tu profe de autoescuela llora de emoción.',
    'Ni la M-30 a las 4 de la mañana.', 'La sombrilla ya está puesta.', 'Has salido antes de las 7. Leyenda.',
    'Ni un intermitente mal puesto.'];
  var FAIL = ['Atasco monumental.', 'El arcén no es un parking.', 'Retenciones de 30 km.', 'Te ha pillado el puente.',
    'Pitar no ayuda.', 'Había que salir antes de las 7.', 'Ni con el GPS.', 'Tu cuñado lo habría hecho peor. Seguramente.'];
  var REASON = { arcen_full: 'Arcén lleno', stuck: 'Atasco total' };

  // ---------------------------------------------------------------- save
  function fresh() { return { reached: 1, stars: {}, boosters: Object.assign({}, CFG.boosters.start), coins: 0, sound: true, daily: {} }; }
  var save = fresh();
  try {
    if (qs.reset) localStorage.removeItem(KEY);
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') save = Object.assign(fresh(), s);
  } catch (e) { /* private mode: play without saving */ }
  if (qs.mute) save.sound = false;
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- game
  var current = null, pending = null;
  var game = AtascoGame.create($('cv'), {
    sound: save.sound,
    onChange: hud,
    onBoosterRequest: function (id) {
      if (save.boosters[id] > 0) { save.boosters[id]--; persist(); return true; }
      toast('▶ +1');   // standalone: a booster that ran out comes back through a (simulated) rewarded ad
      return true;
    },
    onContinueRequested: function (info) {
      return new Promise(function (resolve) { pending = resolve; showLose(info); });
    },
    onFail: function () { /* lose panel is already up; retry / home come from it */ },
    onLevelComplete: showWin,
    coinsFor: function (stars) { return 10 + stars * 6; }
  });

  function packOf(n) { return GEN.pack(n).pack; }

  function play(spec, meta) {
    current = meta;
    hidePanels();
    game.start(spec);
    $('hud-n').textContent = meta.type === 'daily' ? '#' + spec.daily.number : meta.n;
    $('hud-pack').textContent = meta.type === 'daily' ? 'Operación Salida' : packOf(meta.n).name;
    var first = meta.type === 'level' && (meta.n - 1) % GEN.PER_PACK === 0;
    banner(meta.type === 'daily' ? 'Operación Salida #' + spec.daily.number : first ? packOf(meta.n).name : (spec.hard ? '⚠ ' : '') + meta.n);
  }
  function startLevel(n) { n = Math.max(1, n | 0); play(GEN.level(n), { type: 'level', n: n }); }
  function startDaily(date) { date = date || GEN.todayStr(); play(GEN.daily(date), { type: 'daily', date: date }); }

  // ---------------------------------------------------------------- HUD + boosters
  var lastSummary = null;
  function hud(sm) {
    lastSummary = sm;
    $('moves').textContent = sm.moves;
    document.querySelectorAll('.bst').forEach(function (b) {
      var id = b.dataset.b, n = save.boosters[id] || 0, badge = b.querySelector('b');
      b.disabled = !sm.boosters[id] && !(id === 'crane' && sm.crane);
      badge.textContent = n > 0 ? n : '▶';
      badge.className = n > 0 ? '' : 'ad';
      b.classList.toggle('armed', id === 'crane' && sm.crane);
    });
  }
  document.querySelectorAll('.bst').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.b;
      game.requestBooster(id).then(function () { if (lastSummary) hud(lastSummary); });
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') game.cancelCrane(); });

  // ---------------------------------------------------------------- panels
  function hidePanels() { document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('show'); }); }
  function show(id) { hidePanels(); $(id).classList.add('show'); }
  var bannerT = 0, toastT = 0;
  function banner(text) {
    var b = $('banner'); b.textContent = text; b.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(function () { b.classList.remove('show'); }, 1300);
  }
  function toast(text) {
    var t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 1400);
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function shareLine(res) {
    var sq = '';
    for (var i = 0; i < 3; i++) sq += i < res.stars ? '🟩' : '🟨';
    if (res.daily) return '🚗 Operación Salida #' + res.daily.number + ' · ' + res.movesUsed + ' movimientos · ' + sq;
    return '🚗 Atascazo · Nivel ' + current.n + ' · ' + res.movesUsed + ' movimientos · ' + sq;
  }

  var lastWin = null;
  function showWin(res) {
    lastWin = res;
    save.coins += res.coinsEarned;
    if (current.type === 'level') {
      var n = current.n;
      save.stars[n] = Math.max(save.stars[n] || 0, res.stars);
      save.reached = Math.max(save.reached, n + 1);
    } else {
      var prev = save.daily[current.date];
      if (!prev || prev.moves > res.movesUsed) save.daily[current.date] = { moves: res.movesUsed, stars: res.stars };
    }
    persist();
    $('w-cap').textContent = pick(WIN);
    $('w-moves').textContent = res.movesUsed;
    $('w-coins').textContent = '+' + res.coinsEarned;
    $('w-share-line').textContent = res.daily ? shareLine(res) : '';
    $('w-next').hidden = current.type !== 'level';
    var st = $('w-stars'); st.classList.remove('show');
    st.querySelectorAll('svg').forEach(function (s, i) { s.classList.toggle('on', i < res.stars); });
    show('win');
    requestAnimationFrame(function () { requestAnimationFrame(function () { st.classList.add('show'); }); });
  }

  function showLose(info) {
    $('l-cap').textContent = pick(FAIL);
    $('l-reason').textContent = REASON[info.reason] || REASON.stuck;
    $('l-cont').hidden = info.continues >= CFG.continue.maxPerLevel;
    $('l-undo').hidden = !game.canUseBooster('undo');
    show('lose');
  }
  function resolvePending(v) { var p = pending; pending = null; if (p) p(v); }

  $('l-cont').addEventListener('click', function () { toast('▶'); hidePanels(); resolvePending(true); });
  $('l-undo').addEventListener('click', function () {
    hidePanels();
    game.requestBooster('undo').then(function () { resolvePending(false); });
  });
  $('l-again').addEventListener('click', function () { resolvePending(false); game.restart(); hidePanels(); });
  $('l-home').addEventListener('click', function () { resolvePending(false); home(); });
  $('w-next').addEventListener('click', function () { startLevel(current.n + 1); });
  $('w-again').addEventListener('click', function () { current.type === 'daily' ? startDaily(current.date) : startLevel(current.n); });
  $('w-home').addEventListener('click', home);
  $('w-share').addEventListener('click', function () {
    if (!lastWin) return;
    var text = shareLine(lastWin);
    var done = function () { toast('✓ ' + text.slice(0, 26) + '…'); };
    try {
      if (navigator.share) navigator.share({ text: text }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
      else done();
    } catch (e) { done(); }
  });

  function home() {
    var n = save.reached;
    $('m-play-n').textContent = n;
    $('m-play-pack').textContent = packOf(n).name;
    var today = GEN.todayStr(), d = save.daily[today];
    $('m-daily-n').textContent = '#' + GEN.dailyNumber(today);
    $('m-daily-s').textContent = d ? '✓ ' + d.moves : 'Operación Salida';
    $('coins').textContent = save.coins;
    var tot = 0; Object.keys(save.stars).forEach(function (k) { tot += save.stars[k]; });
    $('stars-total').textContent = tot;
    show('menu');
  }
  $('m-play').addEventListener('click', function () { startLevel(save.reached); });
  $('m-daily').addEventListener('click', function () { startDaily(); });
  $('b-home').addEventListener('click', function () { game.cancelCrane(); home(); });
  $('lv-back').addEventListener('click', home);
  $('m-levels').addEventListener('click', function () { buildLevels(); show('levels'); });
  $('b-sound').addEventListener('click', function () {
    save.sound = !save.sound; persist(); game.setSound(save.sound); $('b-sound').classList.toggle('off', !save.sound);
  });
  $('b-sound').classList.toggle('off', !save.sound);

  function buildLevels() {
    var list = $('lv-list'), html = '';
    for (var p = 0; p < GEN.PACKS.length; p++) {
      var first = p * GEN.PER_PACK + 1, got = 0, cells = '';
      for (var n = first; n < first + GEN.PER_PACK; n++) {
        var s = save.stars[n] || 0, open = n <= save.reached;
        got += s;
        var cls = 'lv' + (open ? ' open' : ' locked') + (n === save.reached ? ' cur' : '') + (n % 10 === 0 ? ' hard' : '');
        var stars = '';
        for (var k = 0; k < 3; k++) stars += '<svg class="' + (k < s ? 'on' : '') + '"><use href="#i-star"/></svg>';
        cells += '<button class="' + cls + '" data-n="' + n + '"' + (open ? '' : ' disabled') + '>' + n +
          (open ? '<span class="st">' + stars + '</span>' : '<svg><use href="#i-lock"/></svg>') + '</button>';
      }
      html += '<div class="pack"><div class="sign small">' + GEN.PACKS[p].name + '<i>' + got + '/' + GEN.PER_PACK * 3 + ' ★</i></div><div class="lv-grid">' + cells + '</div></div>';
    }
    list.innerHTML = html;
    var cur = list.querySelector('.lv.cur');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  $('lv-list').addEventListener('click', function (e) {
    var b = e.target.closest('.lv');
    if (b && !b.disabled) startLevel(+b.dataset.n);
  });

  // test / tooling handle
  window.Atascazo = { game: game, startLevel: startLevel, startDaily: startDaily, play: play, save: function () { return save; }, home: home, shareLine: shareLine };

  if (qs.level) startLevel(+qs.level);
  else if (qs.daily) startDaily(qs.daily === '1' ? undefined : qs.daily);
  else home();
})();
