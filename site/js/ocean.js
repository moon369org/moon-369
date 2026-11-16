/*
 * Moonlit sea. One layer of transparent dark water that never stops moving, and that you can disturb
 * with the pointer: move across the water to push it, click to splash.
 * Works on every canvas.tl-sea on the page:
 *   data-sea-top="0.45"   where the water line sits, as a share of the canvas height
 *   data-sea-px="220"     or: the water fills this many CSS pixels at the bottom, whatever the canvas height
 *   data-stars="1"        also draw a quiet field of stars above (and faintly under) the water
 *   data-sea-flow="right"  swells roll in one way (right: left to right; left: right to left), in sets, slightly different on every visit,
 *                          plus a steady train of rolling waves that travel the whole way across
 *   data-sea-line="#hex"   trace the water's surface with a line in this color
 *   data-sea-line-w="3"     its width in CSS pixels (default 1)   data-sea-line-a="0.5"  its opacity (default 1)
 * Base swell: Gerstner-style waves (sharp crests, wide troughs). Ripples: a 1D spring per column.
 */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seas = [];

  function Sea(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.top = parseFloat(cv.getAttribute('data-sea-top') || '0.45');
    this.withStars = cv.getAttribute('data-stars') === '1';
    this.line = cv.getAttribute('data-sea-line');
    var fl = cv.getAttribute('data-sea-flow'); this.flow = fl === 'left' || fl === 'right'; this.dir = fl === 'left' ? -1 : 1;
    // A sea of its own each visit: every swell gets a slightly different length, height, speed and start.
    var R = Math.random;
    this.waves = [[620, 7, 0.55, 1], [360, 4.5, 0.8, -1], [210, 2.6, 1.05, 1], [120, 1.4, 1.4, 1], [70, 0.7, 1.9, -1]].map(function (w, i) {
      if (!this.flow) return w.concat(i * 1.3);
      return [w[0] * (0.85 + R() * 0.3), w[1] * (0.85 + R() * 0.3), w[2] * (0.85 + R() * 0.3), this.dir, R() * 6.2832];
    }, this);
    // Sets: a long, slow envelope that rolls the same way, so some swells arrive bigger than others.
    this.sets = [{ L: 1700 + R() * 900, v: 0.22 + R() * 0.12, p: R() * 6.2832 }, { L: 2900 + R() * 1400, v: 0.13 + R() * 0.08, p: R() * 6.2832 }];
    this.lineW = parseFloat(cv.getAttribute('data-sea-line-w') || '1'); this.lineA = parseFloat(cv.getAttribute('data-sea-line-a') || '1');
    this.W = 0; this.H = 0; this.dpr = 1; this.N = 0; this.h = []; this.v = []; this.ptr = null;
    this.t0 = performance.now(); this.stars = [];
    var self = this, host = cv.closest('section') || cv.parentElement;
    host.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      self.ptr = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, vx: e.movementX || 0, vy: e.movementY || 0, at: performance.now() };
    }, { passive: true });
    host.addEventListener('pointerleave', function () { self.ptr = null; });
    host.addEventListener('pointerdown', function (e) {
      var r = cv.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
      if (y > self.top - 0.1) self.splash((e.clientX - r.left) / r.width, 1.6);
    });
  }
  Sea.prototype.resize = function () {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(this.cv.clientWidth * this.dpr), hh = Math.round(this.cv.clientHeight * this.dpr);
    var px = parseFloat(this.cv.getAttribute('data-sea-px') || '0');
    if (px && this.cv.clientHeight) this.top = Math.max(0.1, 1 - px / this.cv.clientHeight);
    if (w === this.W && hh === this.H) return;
    this.W = w; this.H = hh; this.cv.width = w; this.cv.height = hh;
    this.N = Math.max(80, Math.round(this.cv.clientWidth / 4));
    this.h = new Array(this.N).fill(0); this.v = new Array(this.N).fill(0);
    if (this.withStars) {
      var n = Math.round(this.cv.clientWidth * this.cv.clientHeight / 2600);
      this.stars = [];
      for (var i = 0; i < n; i++) this.stars.push({ x: Math.random(), y: Math.random(), r: Math.random() < 0.08 ? 1.3 + Math.random() * 0.6 : 0.5 + Math.random() * 0.6, a: 0.2 + Math.random() * 0.55, tw: Math.random() * 6.28, sp: 0.4 + Math.random() * 1.2, blue: Math.random() < 0.12 });
    }
  };
  Sea.prototype.splash = function (x, s) {
    var i = Math.round(x * (this.N - 1));
    for (var k = -10; k <= 10; k++) { var j = i + k; if (j >= 0 && j < this.N) this.v[j] += s * Math.cos(k / 10 * Math.PI / 2) * 2.5; }
  };
  Sea.prototype.step = function () {
    var p = this.ptr, N = this.N, h = this.h, v = this.v;
    // Pointer over (or just above) the water pushes it, in the direction of travel.
    if (p && performance.now() - p.at < 120 && p.y > this.top - 0.15) {
      var push = Math.max(-3, Math.min(3, p.vy * 0.25 + Math.abs(p.vx) * 0.05));
      var i = Math.round(p.x * (N - 1));
      for (var k = -3; k <= 3; k++) { var j = i + k; if (j >= 0 && j < N) v[j] += push * (1 - Math.abs(k) / 4) * 0.35; }
    }
    for (var q = 0; q < 2; q++) {
      for (var a = 0; a < N; a++) {
        var l = h[a - 1] !== undefined ? h[a - 1] : h[a], r = h[a + 1] !== undefined ? h[a + 1] : h[a];
        v[a] += (l + r - 2 * h[a]) * 0.18 - h[a] * 0.004;
        v[a] *= 0.985;
      }
      for (var b = 0; b < N; b++) h[b] += v[b] * 0.5;
    }
  };
  Sea.prototype.roller = function (born, W) {
    var w = 110 + Math.random() * 120, v = 55 + Math.random() * 40, start = this.dir > 0 ? -0.1 * W - w * 3 * this.dpr : 1.1 * W + w * 3 * this.dpr;
    return { born: born, x0: start, x: start, v: v, w: w, a: 10 + Math.random() * 7 };
  };
  Sea.prototype.draw = function (now) {
    var cv = this.cv, ctx = this.ctx;
    var rect = cv.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > (window.innerHeight || 800)) return;   // off screen: skip
    this.resize();
    var W = this.W, H = this.H, dpr = this.dpr, N = this.N, h = this.h;
    if (!W || !H) return;
    var t = reduce ? 10 : (now - this.t0) / 1000;
    if (!reduce) this.step();
    ctx.clearRect(0, 0, W, H);
    var u = Math.min(H * (1 - this.top), 121 * dpr) / 121;   // wave scale: same as the original 220px sea

    if (this.withStars) {
      for (var s = 0; s < this.stars.length; s++) {
        var st = this.stars[s], al = st.a * (0.7 + 0.3 * Math.sin(t * st.sp + st.tw));
        ctx.fillStyle = 'rgba(' + (st.blue ? '129,151,173' : '233,228,216') + ',' + al.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r * dpr, 0, 6.2832); ctx.fill();
      }
    }

    // More energy for the first few seconds, settling to a calm swell.
    // (Not on rolling seas: they start already calm.)
    var boost = reduce || this.flow ? 1 : 1 + 1.4 * Math.exp(-t / 2.6);
    if (!reduce && !this.flow && t < 3 && Math.random() < 0.05) this.splash(Math.random(), (0.5 + Math.random()) * (1 - t / 3));
    var waves = this.waves, sets = this.sets, flow = this.flow, dir = this.dir;
    // Rolling waves: one comes in every few seconds, each its own height, width and speed, with a steeper front.
    var rolls = this.rolls || (this.rolls = []);
    if (flow && !reduce) {
      if (this.nextRoll === undefined) { this.nextRoll = t; for (var pre = 0; pre < 3; pre++) rolls.push(this.roller(t - pre * 4.2 - Math.random() * 2, W)); }
      if (t >= this.nextRoll) { rolls.push(this.roller(t, W)); this.nextRoll = t + 3 + Math.random() * 3.5; }
      for (var rq = rolls.length - 1; rq >= 0; rq--) { var ro = rolls[rq]; ro.x = ro.x0 + dir * ro.v * dpr * (t - ro.born); if (dir * (ro.x - (dir > 0 ? 1.15 * W : -0.15 * W)) > ro.w * dpr * 3) rolls.splice(rq, 1); }
    }
    var base = H * this.top;
    var pts = [];
    ctx.beginPath(); ctx.moveTo(-0.1 * W, H);
    for (var i = 0; i <= N - 1; i++) {
      var x0 = (-0.06 + i / (N - 1) * 1.12) * W, dx = 0, dy = 0;   // drawn a little past both edges, so no seam shows
      var env = 1;
      if (flow) for (var e = 0; e < sets.length; e++) env *= 0.72 + 0.28 * Math.sin(2 * Math.PI / (sets[e].L * dpr) * x0 - this.dir * sets[e].v * t + sets[e].p);
      for (var rr = 0; rr < rolls.length; rr++) {
        var R0 = rolls[rr], d = dir * (x0 - R0.x) / (R0.w * dpr), sh = d > 0 ? Math.exp(-d * d / 0.3) : Math.exp(-d * d);
        var RA = R0.a * u * Math.min(1, (t - R0.born) / 1.2) * sh;   // ease in so a new wave never pops
        dy += RA; dx += dir * 0.35 * RA;
      }
      for (var w = 0; w < waves.length; w++) {
        var L = waves[w][0] * dpr, A = waves[w][1] * u * boost * (w < 3 ? env : 1), k = 2 * Math.PI / L, ph = k * x0 - waves[w][2] * t * waves[w][3] + waves[w][4];
        dx -= 0.55 * A * Math.sin(ph);
        dy += A * Math.cos(ph);
      }
      var hs = ((h[i - 1] !== undefined ? h[i - 1] : h[i]) + 2 * h[i] + (h[i + 1] !== undefined ? h[i + 1] : h[i])) / 4;
      var px = x0 + dx, py = base - dy + hs * 1.6 * u;
      ctx.lineTo(px, py); if (this.line) pts.push(px, py);
    }
    ctx.lineTo(1.1 * W, H); ctx.closePath();
    var g = ctx.createLinearGradient(0, base - 20 * u, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.62)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fill();
    if (this.line && pts.length) {
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (var q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]);
      ctx.strokeStyle = this.line; ctx.lineWidth = this.lineW * dpr; ctx.lineJoin = 'round'; ctx.globalAlpha = this.lineA; ctx.stroke(); ctx.globalAlpha = 1;
    }
  };

  function scan() {
    var all = document.querySelectorAll('canvas.tl-sea');
    seas = seas.filter(function (s) { return document.body.contains(s.cv); });
    for (var i = 0; i < all.length; i++) {
      var known = false;
      for (var j = 0; j < seas.length; j++) if (seas[j].cv === all[i]) known = true;
      if (!known) seas.push(new Sea(all[i]));
    }
  }
  var lastScan = 0;
  function frame(now) {
    if (now - lastScan > 1000) { scan(); lastScan = now; }   // pages that re-render can replace the canvas
    for (var i = 0; i < seas.length; i++) seas[i].draw(now);
    if (!reduce) requestAnimationFrame(frame);
  }
  function start() { scan(); lastScan = performance.now(); requestAnimationFrame(frame); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
