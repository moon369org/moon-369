/*
 * Tideline hero ocean. One layer of black sea along the bottom of the hero that never stops moving,
 * and that you can disturb with the pointer: move across the water to push it and send ripples out.
 * Base swell: slow waves that never line up. Ripples: a 1D wave equation (spring per column).
 */
(function () {
  var INK = '233,228,216', BLUE = '129,151,173';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cv, ctx, W = 0, H = 0, dpr = 1, N = 0, h = [], v = [], ptr = null, t0 = performance.now();

  function setup() {
    cv = document.querySelector('canvas.tl-sea');
    if (!cv) return false;
    ctx = cv.getContext('2d');
    var host = cv.closest('section') || cv.parentElement;
    host.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      ptr = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, vx: e.movementX || 0, vy: e.movementY || 0, at: performance.now() };
    }, { passive: true });
    host.addEventListener('pointerleave', function () { ptr = null; });
    host.addEventListener('pointerdown', function (e) {
      var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      splash(x, 1.6);
    });
    return true;
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(cv.clientWidth * dpr), hh = Math.round(cv.clientHeight * dpr);
    if (w === W && hh === H) return;
    W = w; H = hh; cv.width = W; cv.height = H;
    N = Math.max(80, Math.round(cv.clientWidth / 4));
    h = new Array(N).fill(0); v = new Array(N).fill(0);
  }
  function splash(x, s) {
    var i = Math.round(x * (N - 1));
    for (var k = -4; k <= 4; k++) { var j = i + k; if (j >= 0 && j < N) v[j] += s * Math.cos(k / 4 * Math.PI / 2) * 6; }
  }
  function step() {
    // Pointer over (or just above) the water pushes it, in the direction of travel.
    if (ptr && performance.now() - ptr.at < 120 && ptr.y > -0.25) {
      var push = Math.max(-3, Math.min(3, ptr.vy * 0.25 + Math.abs(ptr.vx) * 0.05));
      var i = Math.round(ptr.x * (N - 1));
      for (var k = -3; k <= 3; k++) { var j = i + k; if (j >= 0 && j < N) v[j] += push * (1 - Math.abs(k) / 4) * 0.35; }
    }
    // Springs: each column pulls back to rest and toward its neighbours, then loses a little energy.
    for (var p = 0; p < 2; p++) {
      for (var a = 0; a < N; a++) {
        var l = h[a - 1] !== undefined ? h[a - 1] : h[a], r = h[a + 1] !== undefined ? h[a + 1] : h[a];
        v[a] += (l + r - 2 * h[a]) * 0.18 - h[a] * 0.004;
        v[a] *= 0.985;
      }
      for (var b = 0; b < N; b++) h[b] += v[b] * 0.5;
    }
  }
  function swell(x, t, layer) {
    var s = layer * 1.7;
    return Math.sin(x * 9 + t * 0.55 + s) * 0.45 + Math.sin(x * 23 - t * 0.9 + s * 2) * 0.18 + Math.sin(x * 4.3 + t * 0.21 + s * 3) * 0.6 + Math.sin(x * 61 + t * 1.7 + s) * 0.06 + Math.sin(x * 97 - t * 2.3 + s * 5) * 0.04;
  }
  function draw(now) {
    if (!cv || !document.body.contains(cv)) { if (!setup()) { requestAnimationFrame(draw); return; } }
    var rect = cv.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > (window.innerHeight || 800)) { if (!reduce) requestAnimationFrame(draw); return; }   // off screen: skip
    resize();
    var t = reduce ? 10 : (now - t0) / 1000;
    if (!reduce) step();
    ctx.clearRect(0, 0, W, H);
    var u = H / 220;
    // One layer of black water. No lines, no highlights: the surface shows only against the sky.
    ctx.beginPath(); ctx.moveTo(0, H);
    for (var i = 0; i <= N - 1; i++) {
      var x = i / (N - 1);
      ctx.lineTo(x * W, H * 0.45 + swell(x, t, 0) * 10 * u + h[i] * 1.6 * u);
    }
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = '#000000'; ctx.fill();
    if (!reduce) requestAnimationFrame(draw);
  }
  function start() { if (setup()) requestAnimationFrame(draw); else setTimeout(start, 150); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
