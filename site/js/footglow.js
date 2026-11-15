/*
 * Edge Corona rising out of the footer's top line. Drawn into every canvas.ft-glow.
 * Only the very top of a big moon shows above the line, with the corona coming off it, cream and transparent.
 * Same rules as js/moonglow.js: no gap, no sharp outer edge, zero at the ends of the
 * limb, no pulsing. Rays are drawn sharp at half size, then blurred once, for speed.
 */
(function () {
  var INK = '233,228,216';
  var ALPHA = 0.9; // overall transparency of the whole effect
  function wave(t, s) { return Math.sin(t * 0.31 + s) * 0.55 + Math.sin(t * 0.173 + s * 2.1) * 0.3 + Math.sin(t * 0.071 + s * 3.7) * 0.15; }
  var off = document.createElement('canvas');

  function cap(o, cx, cy, R) { o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); }

  function draw(cv, t) {
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var w = Math.max(1, Math.round(W / 2)), h = Math.max(1, Math.round(H / 2));
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
    var o = off.getContext('2d');
    o.clearRect(0, 0, w, h);

    // The moon: only the very top of a big circle shows above the footer line.
    var ch = Math.max(10, h * 0.07), chord = w * 0.62;
    var R = (chord * chord / 4 + ch * ch) / (2 * ch), cx = w / 2;
    ch = ch / 2; chord = 2 * Math.sqrt(2 * R * ch - ch * ch);   // same moon, half as much above the line
    var cy = h + R - ch;
    var span = Math.asin(Math.min(1, (chord / 2) / R));

    // Rule 1 + 2: glow made from the lit cap, blurred at three radii (as js/moonglow.js).
    o.globalCompositeOperation = 'lighter';
    var layers = [[18, 0.45], [40, 0.4], [90, 0.4], [200, 0.5]]; // tight layers keep the edge bright
    for (var i = 0; i < layers.length; i++) {
      o.filter = 'blur(' + Math.max(1, Math.round(w / layers[i][0] / 2)) + 'px)';
      o.globalAlpha = layers[i][1];
      cap(o, cx, cy, R); o.fillStyle = 'rgb(' + INK + ')'; o.fill();
    }
    o.filter = 'none'; o.globalAlpha = 1;

    // Rays on the limb, radial, white only. Rule 3: zero where the limb meets the line.
    o.lineCap = 'round';
    var n = 170;
    for (var j = 0; j < n; j++) {
      var v = j / (n - 1);
      var ang = -span + v * span * 2;
      var base = Math.max(0, Math.cos((v - 0.5) * Math.PI));
      var env = Math.pow(base, 0.8), lenv = Math.pow(base, 0.5);
      if (env < 0.02) continue;
      var roll = 0.5 + 0.5 * Math.sin(v * 11 - t * 0.55 + wave(t * 0.3, v * 4) * 1.6);
      var lift = wave(t * 0.4, v * 5) * h * 0.04 * env;
      var len = (h * 0.16 + h * 0.2 * (0.5 + 0.5 * Math.sin(v * 17 + t * 0.12))) * lenv + lift;
      var a = Math.min(1, (0.35 + 0.65 * roll) * env * 1.1);
      var dx = Math.sin(ang), dy = -Math.cos(ang);
      var x0 = cx + dx * R * 0.995, y0 = cy + dy * R * 0.995;   // Rule 1: start inside the white
      var x1 = cx + dx * (R + len), y1 = cy + dy * (R + len);
      var g = o.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(' + INK + ',' + a * 0.8 + ')');
      g.addColorStop(0.08, 'rgba(' + INK + ',' + a + ')');
      g.addColorStop(0.35, 'rgba(' + INK + ',' + a * 0.55 + ')');
      g.addColorStop(0.7, 'rgba(' + INK + ',' + a * 0.15 + ')');
      g.addColorStop(1, 'rgba(' + INK + ',0)');               // Rule 2: always fade to nothing
      o.strokeStyle = g; o.lineWidth = Math.max(1, w / 600);
      o.beginPath(); o.moveTo(x0, y0); o.lineTo(x1, y1); o.stroke();
    }

    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = ALPHA * Math.max(0.6, Math.min(1, cv.clientWidth / 1200)); // gentler on phones
    ctx.filter = 'blur(' + Math.max(2, Math.round(W / 800)) + 'px)';
    ctx.drawImage(off, 0, 0, W, H);
    ctx.filter = 'none';
    // Rule 2 at the top: fade the whole thing out before it reaches anything above.
    ctx.globalCompositeOperation = 'destination-in';
    var top = ctx.createLinearGradient(0, 0, 0, H);
    top.addColorStop(0, 'rgba(0,0,0,0)');
    top.addColorStop(0.55, 'rgba(0,0,0,1)');
    ctx.globalAlpha = 1; ctx.fillStyle = top; ctx.fillRect(0, 0, W, H);
    // The moon itself, crisp, on top.
    ctx.globalCompositeOperation = 'source-over';
    cap(ctx, cx * 2, cy * 2, R * 2); ctx.fillStyle = 'rgb(' + INK + ')'; ctx.fill();
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now(), last = 0;
  function frame(now) {
    if (now - last > 33) {
      var all = document.querySelectorAll('canvas.ft-glow');
      for (var c = 0; c < all.length; c++) {
        var r = all[c].getBoundingClientRect();
        if (r.bottom > 0 && r.top < (window.innerHeight || 800) && (!reduce || !all[c].width)) {
          draw(all[c], reduce ? 12 : (now - t0) / 1000 * 3 + 40); last = now;
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
