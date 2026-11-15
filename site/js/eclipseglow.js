/*
 * Living eclipses. Draws into every canvas.ec-glow, with data-type="total|annular|hybrid|partial".
 * Same rules as the moons (js/moonglow.js): light starts at the edge, always fades to nothing,
 * no hard outer edge, no pulsing; motion is light drifting along the limb on slow waves.
 *   total    a black disc with a living corona: fine rays plus a few long streamers that drift
 *   annular  a ring of fire that breathes, with short flickering rays off its outer edge
 *   hybrid   the ring thins to nothing on one side, where the corona takes over
 *   partial  the sun with a bite out of it; light only from the sun's uncovered edge
 * Canvases off screen are skipped, phones run at 30 fps, and reduced motion gets one still frame.
 */
(function () {
  var LIGHT = '233,228,216', SUN = '244,239,227', DARK = '#0B0B0D';
  function wave(t, s) { return Math.sin(t * 0.31 + s) * 0.55 + Math.sin(t * 0.173 + s * 2.1) * 0.3 + Math.sin(t * 0.071 + s * 3.7) * 0.15; }

  // Blur that also works in Safari, which accepts ctx.filter but may ignore it (same as moonglow.js).
  var BLUR_OK = (function () {
    try {
      var cv = document.createElement('canvas'); cv.width = cv.height = 20;
      var c = cv.getContext('2d', { willReadFrequently: true });
      c.filter = 'blur(3px)'; c.fillStyle = '#fff'; c.fillRect(8, 8, 4, 4);
      return c.getImageData(3, 10, 1, 1).data[3] > 0;
    } catch (e) { return false; }
  })();
  var pool = {};
  function blurDraw(ctx, W, px, alpha, op, paint) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op || 'source-over';
    if (BLUR_OK) { ctx.filter = 'blur(' + px + 'px)'; paint(ctx); ctx.restore(); return; }
    var b = pool[W] || (pool[W] = document.createElement('canvas'));
    if (b.width !== W) { b.width = W; b.height = W; }
    var c = b.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, W); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    paint(c);
    var shift = W * 2 + 100;
    ctx.shadowColor = 'rgb(' + LIGHT + ')'; ctx.shadowBlur = px * 2; ctx.shadowOffsetX = shift; ctx.shadowOffsetY = 0;
    ctx.drawImage(b, -shift, 0);
    if (op === 'lighter') ctx.drawImage(b, -shift, 0);
    ctx.restore();
  }
  function disc(c, x, y, r, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

  // Geometry on a 100-unit icon (the same proportions as the static SVG icons).
  function geo(type, W) {
    var s = W / 100, cx = W / 2, cy = W / 2, R = 26 * s;
    if (type === 'annular') return { s: s, cx: cx, cy: cy, R: R, mx: cx, my: cy, mr: (26 - 5.5) * s };
    if (type === 'hybrid') return { s: s, cx: cx, cy: cy, R: R, mx: cx - 1.9 * s, my: cy, mr: (26 - 1.1) * s };
    if (type === 'partial') return { s: s, cx: cx, cy: cy, R: R, mx: cx + 13 * s, my: cy - 11 * s, mr: (26 + 0.5) * s };
    return { s: s, cx: cx, cy: cy, R: R, mx: cx, my: cy, mr: R };
  }

  // The parts that never move, drawn once per size and type.
  function base(type, W, g) {
    var st = document.createElement('canvas'); st.width = W; st.height = W;
    var c = st.getContext('2d');
    var sunPaint = function (k) { return function (x) { disc(x, g.cx, g.cy, g.R * k, 'rgb(' + LIGHT + ')'); }; };
    if (type === 'total') {
      blurDraw(c, W, Math.max(1, Math.round(W / 9)), 0.45, 'lighter', sunPaint(1.06));
      blurDraw(c, W, Math.max(1, Math.round(W / 26)), 0.4, 'lighter', function (x) { x.strokeStyle = 'rgb(' + LIGHT + ')'; x.lineWidth = g.R * 0.16; x.beginPath(); x.arc(g.cx, g.cy, g.R * 1.03, 0, Math.PI * 2); x.stroke(); });
      blurDraw(c, W, Math.max(1, Math.round(W / 140)), 1, 'lighter', function (x) { x.strokeStyle = 'rgb(' + LIGHT + ')'; x.lineWidth = Math.max(1, g.R * 0.075); x.beginPath(); x.arc(g.cx, g.cy, g.R * 1.035, 0, Math.PI * 2); x.stroke(); });
    } else {
      var glow = type === 'partial' ? 0.3 : 0.42;
      blurDraw(c, W, Math.max(1, Math.round(W / 9)), glow, 'lighter', sunPaint(1.02));
      blurDraw(c, W, Math.max(1, Math.round(W / 30)), glow * 0.8, 'lighter', sunPaint(1.01));
      blurDraw(c, W, Math.max(1, Math.round(W / 220)), 1, 'source-over', function (x) {
        var gr = x.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.R);
        gr.addColorStop(0, 'rgb(' + SUN + ')'); gr.addColorStop(0.85, 'rgb(' + LIGHT + ')'); gr.addColorStop(1, '#D8D1C1');
        x.fillStyle = gr; x.beginPath(); x.arc(g.cx, g.cy, g.R, 0, Math.PI * 2); x.fill();
      });
    }
    return st;
  }

  function ray(ctx, x0, y0, x1, y1, a, w) {
    var gr = ctx.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(' + LIGHT + ',' + a * 0.35 + ')');
    gr.addColorStop(0.12, 'rgba(' + LIGHT + ',' + a + ')');
    gr.addColorStop(0.4, 'rgba(' + LIGHT + ',' + a * 0.45 + ')');
    gr.addColorStop(0.75, 'rgba(' + LIGHT + ',' + a * 0.1 + ')');
    gr.addColorStop(1, 'rgba(' + LIGHT + ',0)');
    ctx.strokeStyle = gr; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }

  function draw(cv, t) {
    var type = cv.getAttribute('data-type') || 'total';
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr);
    if (!W) return;
    if (cv.width !== W) { cv.width = W; cv.height = W; }
    var g = geo(type, W), ctx = cv.getContext('2d'), key = type + '|' + W;
    if (cv.__ecKey !== key) { cv.__ecKey = key; cv.__ecBase = base(type, W, g); }
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(cv.__ecBase, 0, 0);
    var small = W < 160, corona = type === 'total' || type === 'hybrid';
    var n = small ? 56 : (corona ? 150 : 120), lw = Math.max(1.2, W / (corona ? 95 : 130));

    blurDraw(ctx, W, Math.max(1, Math.round(W / (small ? 140 : 320))), BLUR_OK ? 1 : 0.6, 'lighter', function (c) {
      c.lineCap = 'round';
      for (var j = 0; j < n; j++) {
        var v = j / n, ang = v * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
        var env = 1, reach, a, start = g.R;
        if (type === 'total' || type === 'hybrid') {
          // A corona: fine rays, plus a few long streamers that drift slowly around the limb.
          var streamer = Math.pow(0.5 + 0.5 * Math.sin(ang * 2 + wave(t * 0.12, 1.3) * 1.2), 3) * 0.9
                       + Math.pow(0.5 + 0.5 * Math.sin(ang * 3 - t * 0.05 + 2), 6) * 0.6;
          if (type === 'hybrid') env = Math.max(0, Math.min(1, (0.25 - dx) / 1.05));   // corona only where the ring has thinned away
          reach = g.R * (0.3 + 0.75 * streamer + 0.2 * (0.5 + 0.5 * Math.sin(v * 37 + t * 0.4))) * (1 + 0.14 * wave(t * 0.35, v * 6));
          a = (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(v * 23 - t * 0.6 + wave(t * 0.25, v * 3) * 1.5))) * (0.55 + 0.6 * streamer) * env;
          start = g.R * 1.02;
        } else if (type === 'annular') {
          reach = g.R * (0.16 + 0.18 * (0.5 + 0.5 * Math.sin(v * 29 + t * 0.5)) + 0.07 * wave(t * 0.3, v * 5));
          a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(v * 17 - t * 0.7 + wave(t * 0.2, v * 4)));
        } else {
          // Partial: only from the part of the sun's edge the moon does not cover.
          var px = g.cx + dx * g.R, py = g.cy + dy * g.R, d = Math.hypot(px - g.mx, py - g.my);
          env = Math.max(0, Math.min(1, (d - g.mr) / (g.R * 0.25)));
          reach = g.R * (0.16 + 0.18 * (0.5 + 0.5 * Math.sin(v * 31 + t * 0.45)) + 0.06 * wave(t * 0.3, v * 5));
          a = (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(v * 19 - t * 0.6))) * env;
        }
        if (a < 0.02) continue;
        reach = Math.min(reach, W * 0.47 - start);   // fade out before the canvas edge: never a hard edge
        var sway = Math.sin(t * 0.21 + v * 11) * 0.012;   // the light drifts sideways a little along the limb
        var ex = Math.cos(ang + sway), ey = Math.sin(ang + sway);
        ray(c, g.cx + dx * start * 0.98, g.cy + dy * start * 0.98, g.cx + ex * (start + reach), g.cy + ey * (start + reach), Math.min(1, a), lw * (small ? 1.4 : 1.2));
      }
    });

    // The moon goes on top of everything.
    disc(ctx, g.mx, g.my, g.mr, DARK);
    if (type === 'total') {
      // The diamond ring's last bead of light, breathing very slowly.
      var b = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.35));
      blurDraw(ctx, W, Math.max(1, Math.round(W / 70)), b, 'lighter', function (c) { disc(c, g.cx + g.R * 0.72, g.cy - g.R * 0.69, g.R * 0.1, 'rgb(' + SUN + ')'); });
    }
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PHONE = (window.innerWidth || 1200) < 720, t0 = performance.now(), lastFrame = 0;
  function frame(now) {
    if (PHONE && now - lastFrame < 33) { requestAnimationFrame(frame); return; }
    lastFrame = now;
    var all = document.querySelectorAll('canvas.ec-glow');
    for (var i = 0; i < all.length; i++) {
      var cv = all[i], r = cv.getBoundingClientRect();
      if (r.bottom < 0 || r.top > (window.innerHeight || 800)) continue;
      if (reduce && cv.__ecKey === (cv.getAttribute('data-type') || 'total') + '|' + Math.round(cv.clientWidth * Math.min(2, window.devicePixelRatio || 1))) continue;
      draw(cv, reduce ? 20 : (now - t0) / 1000 + 30 + i * 13);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
