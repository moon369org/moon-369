/*
 * Tideline hero ocean. A moonlit sea along the bottom of the hero that never stops moving,
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
    // Three layers, back to front: further water is higher, fainter and calmer.
    var layers = [
      { y: 0.30, amp: 4, alpha: 0.10, col: BLUE, ripple: 0.3 },
      { y: 0.46, amp: 7, alpha: 0.13, col: BLUE, ripple: 0.6 },
      { y: 0.62, amp: 10, alpha: 0.16, col: '150,172,194', ripple: 1 },
    ];
    for (var L = 0; L < layers.length; L++) {
      var ly = layers[L], pts = [];
      for (var i = 0; i <= N - 1; i++) {
        var x = i / (N - 1);
        var y = H * ly.y + swell(x, t, L) * ly.amp * u + h[i] * ly.ripple * u * 1.6;
        pts.push([x * W, y]);
      }
      // Body of the water: fades downward into the dark.
      var g = ctx.createLinearGradient(0, H * ly.y - 20 * u, 0, H);
      g.addColorStop(0, 'rgba(' + ly.col + ',' + ly.alpha + ')');
      g.addColorStop(0.35, 'rgba(' + ly.col + ',' + ly.alpha * 0.35 + ')');
      g.addColorStop(1, 'rgba(' + ly.col + ',0)');
      ctx.beginPath(); ctx.moveTo(0, H);
      for (var q = 0; q < pts.length; q++) ctx.lineTo(pts[q][0], pts[q][1]);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      // Moonlight on the crest: brighter where the surface is rising (four strokes, one per brightness step).
      ctx.lineWidth = (L === 2 ? 1.4 : 1) * dpr;
      var buckets = [[], [], [], []];
      for (var s = 1; s < pts.length; s++) {
        var lvl = Math.max(0, Math.min(0.999, 0.25 + (pts[s - 1][1] - pts[s][1]) / (6 * u)));
        buckets[Math.floor(lvl * 4)].push(s);
      }
      for (var bk = 0; bk < 4; bk++) {
        if (!buckets[bk].length) continue;
        ctx.strokeStyle = 'rgba(' + INK + ',' + (((bk + 0.5) / 4) * (L === 2 ? 0.7 : 0.35)).toFixed(3) + ')';
        ctx.beginPath();
        for (var z = 0; z < buckets[bk].length; z++) { var si = buckets[bk][z]; ctx.moveTo(pts[si - 1][0], pts[si - 1][1]); ctx.lineTo(pts[si][0], pts[si][1]); }
        ctx.stroke();
      }
    }
    // A path of moonlight glinting on the front water.
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var mx = W * 0.72;
    for (var k = 0; k < 70; k++) {
      var gy = H * 0.66 + (k / 70) * H * 0.34;
      var spread = (12 + (k / 70) * 70) * u;
      var gx = mx + Math.sin(k * 12.9898 + t * (0.6 + (k % 7) * 0.13)) * spread;
      var tw = 0.5 + 0.5 * Math.sin(t * (1.1 + (k % 5) * 0.37) + k);
      ctx.fillStyle = 'rgba(' + INK + ',' + (0.35 * tw * (1 - k / 90)).toFixed(3) + ')';
      ctx.fillRect(gx, gy, (6 + (k % 4) * 4) * u * (1 - k / 140), 1.2 * u);
    }
    ctx.restore();
    if (!reduce) requestAnimationFrame(draw);
  }
  function start() { if (setup()) requestAnimationFrame(draw); else setTimeout(start, 150); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
