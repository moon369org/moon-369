/*
 * The living moon on the homepage ("Edge Corona"). Drawn into every canvas.hm-moonglow.
 *
 * Rules (keep them when changing anything here):
 *  1. No gap. The glow is the lit crescent itself, blurred, and every ray starts just inside
 *     the white edge, so light always runs continuously out of the white. Never offset the
 *     glow or the rays away from the edge.
 *  2. No sharp outer edge. Nothing is clipped. Every ray fades to nothing along its length with
 *     an eased falloff, and everything is blurred. When unsure, fade more.
 *  3. No vertical lines at the top or bottom. Rays live only on the lit limb, and their length
 *     and brightness follow an envelope that is zero at the poles and grows smoothly toward
 *     the middle of the curve, so the corona starts small and eases out to its fullest.
 *  4. No pulsing. Motion is light drifting up and down the edge with a slight sway, built from
 *     slow waves that never line up.
 */
(function () {
  if (window.__moonglow) return; window.__moonglow = true;
  var INK = '233,228,216';
  var SCALE = 1.9; // canvas size relative to the moon, so the glow has room to fade out
  function wave(t, s) { return Math.sin(t * 0.31 + s) * 0.55 + Math.sin(t * 0.173 + s * 2.1) * 0.3 + Math.sin(t * 0.071 + s * 3.7) * 0.15; }

  // Blur that also works where canvas filters don't (Safari, including every iPhone browser):
  // there we blur with the canvas shadow instead, which Safari does draw.
  // Test that blur really draws: some Safari versions accept ctx.filter but ignore it.
  var BLUR_OK = (function () {
    try {
      var cv = document.createElement('canvas'); cv.width = cv.height = 20;
      var c = cv.getContext('2d', { willReadFrequently: true });
      c.filter = 'blur(3px)'; c.fillStyle = '#fff'; c.fillRect(8, 8, 4, 4);
      return c.getImageData(3, 10, 1, 1).data[3] > 0;   // a blurred square leaks light 5px away
    } catch (e) { return false; }
  })();
  var blurPool = {};
  function blurDraw(ctx, W, H, px, alpha, op, paint) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op || 'source-over';
    if (BLUR_OK) { ctx.filter = 'blur(' + px + 'px)'; paint(ctx); ctx.restore(); return; }
    // Safari: paint sharp off to the side, then let the canvas shadow (which Safari blurs
    // properly) fall back onto the real spot. Full resolution, true Gaussian, one pass.
    var key = W + 'x' + H, b = blurPool[key] || (blurPool[key] = document.createElement('canvas'));
    if (b.width !== W || b.height !== H) { b.width = W; b.height = H; }
    var c = b.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    paint(c);
    var shift = W + H + 100;
    ctx.shadowColor = 'rgb(' + INK + ')'; ctx.shadowBlur = px * 2; ctx.shadowOffsetX = shift; ctx.shadowOffsetY = 0;
    ctx.drawImage(b, -shift, 0);
    if (op === 'lighter') ctx.drawImage(b, -shift, 0);   // shadows come out about half as bright as filter blur
    ctx.restore();
  }

  // Sun direction seen from the Moon (x right, y down, z toward us): new moon behind it, full in
  // front, lit on the right while waxing. Brightness is a smoothstep of the sunlight's angle, so the
  // terminator is soft in proportion to the sphere, and the edge of the disc is antialiased.
  function shade(W, cx, cy, R, f) {
    var cvs = document.createElement('canvas'); cvs.width = cvs.height = W;
    var c = cvs.getContext('2d'), img = c.createImageData(W, W), d = img.data;
    var e = 2 * Math.PI * f, sx = Math.sin(e), sz = -Math.cos(e);
    var ink = INK.split(',').map(Number);
    var y0 = Math.max(0, Math.floor(cy - R - 1)), y1 = Math.min(W, Math.ceil(cy + R + 1));
    var x0 = Math.max(0, Math.floor(cx - R - 1)), x1 = Math.min(W, Math.ceil(cx + R + 1));
    for (var y = y0; y < y1; y++) {
      var ny = (y + 0.5 - cy) / R;
      for (var x = x0; x < x1; x++) {
        var nx = (x + 0.5 - cx) / R, rr = nx * nx + ny * ny;
        var edge = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * R + 0.5));   // antialiased rim
        if (edge <= 0) continue;
        var nz = Math.sqrt(Math.max(0, 1 - rr)), dot = nx * sx + nz * sz;
        // The fade is widest across the middle of the face and tightens toward the rim, so the
        // terminator stays soft but meets the edge cleanly (no lit horns, no dark notches).
        var A = -0.03 - 0.22 * nz, B = 0.03 + 0.42 * nz;
        var tt = Math.min(1, Math.max(0, (dot - A) / (B - A))), a = tt * tt * (3 - 2 * tt) * edge;
        if (a <= 0) continue;
        var o = (y * W + x) * 4;
        d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2]; d[o + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    return cvs;
  }

  function draw(cv, t) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = Math.round(cv.clientWidth * dpr);
    if (!W) return;
    if (cv.width !== W) { cv.width = W; cv.height = W; }
    var ctx = cv.getContext('2d'), u = W / 404;
    var cx = W / 2, cy = W / 2, R = W / SCALE / 2;
    var at = +cv.getAttribute('data-at') || Date.now();   // data-at="<unix ms>" shows the moon at another moment
    var f = window.MoonPhase ? window.MoonPhase.fraction(at) : 0.17;
    // Turn the whole canvas so the lit side points the way the real Moon's does (north up).
    // The CSS rotate property leaves any transform already on the canvas alone.
    var dt = cv.getAttribute('data-tilt');   // data-tilt="<deg>" overrides it, e.g. the tilt seen from one place
    var tilt = dt !== null && dt !== '' && isFinite(+dt) ? +dt : window.MoonPhase && window.MoonPhase.tilt ? window.MoonPhase.tilt(at) : 0;
    if (cv.__tilt !== tilt) { cv.__tilt = tilt; cv.style.rotate = tilt + 'deg'; }
    var wax = f < 0.5, side = wax ? 1 : -1;
    var lit = window.MoonPhase ? window.MoonPhase.illumination(at) : 0.27;
    var strength = Math.min(1, 0.6 + lit * 1.2); // a thin crescent glows a little more gently
    ctx.clearRect(0, 0, W, W);

    // The glow and the moon only change with the phase, so draw them once and reuse them.
    var sk = W + '|' + f.toFixed(4) + '|' + strength.toFixed(3);
    var st = cv.__moonStatic || (cv.__moonStatic = document.createElement('canvas'));
    if (cv.__moonKey !== sk) {
      cv.__moonKey = sk; st.width = W; st.height = W;
      (function (ctx) {

        // The lit face, shaded like a real sphere: each pixel's brightness follows how squarely the
        // Sun hits it there, fading to dark across the terminator. Near the poles the sunlight only
        // grazes, so the lit edge fades out before it gets there: the shadow side meets the edge in
        // one smooth curve, with no thin horns running along the rim.
        var lit = shade(W, cx, cy, R, f);

        // Rule 1 + 2: glow made from the lit face itself, blurred at three radii.
        var layers = [[160, 0.4], [70, 0.2], [34, 0.12]];
        var paintLit = function (c) { c.drawImage(lit, 0, 0); };
        for (var i = 0; i < layers.length; i++) blurDraw(ctx, W, W, Math.max(1, Math.round(W / layers[i][0])), layers[i][1] * strength, 'lighter', paintLit);

        // The moon: the shadow disc, then the lit face on top.
        ctx.fillStyle = '#24262A'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(lit, 0, 0);
      })(st.getContext('2d'));
    }
    ctx.drawImage(st, 0, 0);

    // Rays on the lit limb only.
    blurDraw(ctx, W, W, Math.max(1, Math.round(W / 340)), BLUR_OK ? 1 : 0.2, 'lighter', function (ctx) {   // iPhone: rays 80% softer
    ctx.lineCap = 'round'; ctx.lineWidth = 2.2 * u;
    var n = 150;
    var sides = Math.abs(f - 0.5) < 0.02 ? [side, -side] : [side];   // near full, the whole limb is lit
    for (var q = 0; q < sides.length; q++) { side = sides[q];
    for (var j = 0; j < n; j++) {
      var v = j / (n - 1);
      var ang = -Math.PI / 2 + v * Math.PI;                 // top pole to bottom pole along the lit limb
      var env = Math.pow(Math.max(0, Math.cos(ang)), 1.6);   // Rule 3: zero at the poles, fullest mid-curve
      if (env < 0.02) continue;
      var roll = 0.5 + 0.5 * Math.sin(v * 9 - t * 0.55 + wave(t * 0.3, v * 4) * 1.6);
      var lift = wave(t * 0.4, v * 5) * R * 0.08 * env;
      var sway = Math.sin(t * 0.21 + v * 11) * R * 0.012;
      var len = (R * 0.3 + R * 0.32 * (0.5 + 0.5 * Math.sin(v * 17 + t * 0.12))) * env;
      var a = Math.min(1, roll * env * strength * 1.2);
      var dx = Math.cos(ang) * side, dy = Math.sin(ang);
      var x0 = cx + dx * R * 0.96 + sway * side, y0 = cy + dy * R * 0.96 + lift;   // Rule 1: start inside the white
      var x1 = cx + dx * (R + len) + sway * side, y1 = cy + dy * (R + len) + lift;
      var g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(' + INK + ',' + a * 0.3 + ')');      // soft where it meets the white: no bright rim
      g.addColorStop(0.12, 'rgba(' + INK + ',' + a + ')');
      g.addColorStop(0.35, 'rgba(' + INK + ',' + a * 0.55 + ')');
      g.addColorStop(0.7, 'rgba(' + INK + ',' + a * 0.15 + ')');
      g.addColorStop(1, 'rgba(' + INK + ',0)');              // Rule 2: always fade to nothing
      ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    }
    });
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now(), last = 0;
  var PHONE = (window.innerWidth || 1200) < 720, lastFrame = 0;
  function frame(now) {
    if (PHONE && now - lastFrame < 33) { requestAnimationFrame(frame); return; }   // 30 fps on phones
    lastFrame = now;
    var all = document.querySelectorAll('canvas.hm-moonglow'), drew = false;
    for (var c = 0; c < all.length; c++) {
      var r = all[c].getBoundingClientRect();
      var onScreen = r.bottom > 0 && r.top < (window.innerHeight || 800);
      if (onScreen && (!reduce || now - last > 60000)) { draw(all[c], reduce ? 12 : (now - t0) / 1000 + 40 + c * 17); drew = true; }
    }
    if (drew) last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
