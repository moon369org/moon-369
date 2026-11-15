/*
 * Edge Corona rising out of the footer's top line. Drawn into every canvas.ft-glow.
 * The line is treated as the lit edge of a moon; only its corona shows, cream and transparent.
 * Same rules as js/moonglow.js: no gap, no sharp outer edge, zero at the ends of the
 * limb, no pulsing. Rays are drawn sharp at half size, then blurred once, for speed.
 */
(function () {
  var INK = '233,228,216';
  var ALPHA = 0.85; // overall transparency of the whole effect
  function wave(t, s) { return Math.sin(t * 0.31 + s) * 0.55 + Math.sin(t * 0.173 + s * 2.1) * 0.3 + Math.sin(t * 0.071 + s * 3.7) * 0.15; }
  var off = document.createElement('canvas');

  function draw(cv, t) {
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var w = Math.max(1, Math.round(W / 2)), h = Math.max(1, Math.round(H / 2));
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
    var o = off.getContext('2d');
    o.clearRect(0, 0, w, h);

    // The footer line is the lit edge: everything rises out of the bottom of this canvas,
    // which sits exactly on that line.
    o.globalCompositeOperation = 'lighter';
    // Soft glow hugging the line (Rule 1: light runs straight out of the edge).
    o.save(); o.translate(w / 2, h); o.scale((w * 0.5) / (h * 0.55), 1);
    var gl = o.createRadialGradient(0, 0, 0, 0, 0, h * 0.55);
    gl.addColorStop(0, 'rgba(' + INK + ',0.34)');
    gl.addColorStop(0.3, 'rgba(' + INK + ',0.16)');
    gl.addColorStop(1, 'rgba(' + INK + ',0)');
    o.fillStyle = gl; o.fillRect(-h, -h, h * 2, h * 2);
    o.restore();

    o.lineCap = 'round';
    var n = 220;
    for (var j = 0; j < n; j++) {
      var v = j / (n - 1);
      var env = Math.pow(Math.max(0, Math.cos((v - 0.5) * Math.PI)), 0.9); // Rule 3: zero at the ends
      if (env < 0.02) continue;
      var roll = 0.5 + 0.5 * Math.sin(v * 13 - t * 0.55 + wave(t * 0.3, v * 4) * 1.6);
      var sway = Math.sin(t * 0.21 + v * 11) * w * 0.004;
      var len = (h * 0.5 + h * 0.4 * (0.5 + 0.5 * Math.sin(v * 23 + t * 0.12))) * env * (1 + wave(t * 0.4, v * 5) * 0.15);
      var a = Math.min(1, roll * env * 0.9);
      var fan = (v - 0.5) * 0.6;                               // rays lean gently outward
      var x0 = v * w + sway, y0 = h + 2;
      var x1 = x0 + Math.sin(fan) * len, y1 = y0 - Math.cos(fan) * len;
      var g = o.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(' + INK + ',' + a * 0.5 + ')');
      g.addColorStop(0.1, 'rgba(' + INK + ',' + a + ')');
      g.addColorStop(0.35, 'rgba(' + INK + ',' + a * 0.5 + ')');
      g.addColorStop(0.7, 'rgba(' + INK + ',' + a * 0.12 + ')');
      g.addColorStop(1, 'rgba(' + INK + ',0)');               // Rule 2: always fade to nothing
      o.strokeStyle = g; o.lineWidth = Math.max(1.2, w / 380);
      o.beginPath(); o.moveTo(x0, y0); o.lineTo(x1, y1); o.stroke();
    }

    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = ALPHA * Math.max(0.45, Math.min(1, cv.clientWidth / 1200)); // gentler on phones
    ctx.filter = 'blur(' + Math.max(2, Math.round(W / 520)) + 'px)';
    ctx.drawImage(off, 0, 0, W, H);
    ctx.filter = 'none';
    // Rule 2 at the top: fade the whole thing out before it reaches anything above.
    ctx.globalCompositeOperation = 'destination-in';
    var top = ctx.createLinearGradient(0, 0, 0, H);
    top.addColorStop(0, 'rgba(0,0,0,0)');
    top.addColorStop(0.45, 'rgba(0,0,0,1)');
    ctx.globalAlpha = 1; ctx.fillStyle = top; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now(), last = 0;
  function frame(now) {
    if (now - last > 33) {
      var all = document.querySelectorAll('canvas.ft-glow');
      for (var c = 0; c < all.length; c++) {
        var r = all[c].getBoundingClientRect();
        if (r.bottom > 0 && r.top < (window.innerHeight || 800) && (!reduce || !all[c].width)) {
          draw(all[c], reduce ? 12 : (now - t0) / 1000 + 40); last = now;
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
