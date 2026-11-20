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

  // The real surface, for canvases marked data-real: NASA's LROC map of the near side (see
  // /assets/moon/CREDIT.txt), read once into brightness values. Until it loads, the plain moon shows.
  var TEX = null, texLoading = false;
  function texture() {
    if (TEX || texLoading) return TEX; texLoading = true;
    var im = new Image();
    im.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
        var px = g.getImageData(0, 0, im.width, im.height).data, n = im.width * im.height, v = new Float32Array(n);
        for (var i = 0; i < n; i++) v[i] = px[i * 4] / 255;
        TEX = { w: im.width, h: im.height, v: v };
        document.querySelectorAll('canvas.hm-moonglow').forEach(function (cv) { cv.__moonKey = null; });
        if (window.MoonFace) window.MoonFace.cache = {};
      } catch (e) { /* a blocked image: keep the plain moon */ }
    };
    // On moon369.org the map comes from the same site; elsewhere (the moon369 npm package) from moon369.org, which allows it.
    var here = /(^|\.)moon369\.org$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
    if (!here) im.crossOrigin = 'anonymous';
    im.src = (here ? '' : 'https://moon369.org') + '/assets/moon/near-side.jpg';
    return null;
  }
  // Surface brightness at a point on the visible face: maria dark, highlands bright, as the map shows.
  function albedo(nx, ny, nz) {
    var lon = Math.atan2(nx, nz), lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
    var u = (lon / Math.PI + 0.5) * (TEX.w - 1), v = (0.5 - lat / Math.PI) * (TEX.h - 1);
    var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, w = TEX.w, a = TEX.v;
    var x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(TEX.h - 1, y0 + 1);
    var k = (a[y0 * w + x0] * (1 - fx) + a[y0 * w + x1] * fx) * (1 - fy) + (a[y1 * w + x0] * (1 - fx) + a[y1 * w + x1] * fx) * fy;
    return Math.min(1, Math.max(0, (k - 0.22) / 0.58));   // stretch the map's gray range to full
  }

  // Sun direction seen from the Moon (x right, y down, z toward us): new moon behind it, full in
  // front, lit on the right while waxing. Brightness is a smoothstep of the sunlight's angle, so the
  // terminator is soft in proportion to the sphere, and the edge of the disc is antialiased.
  function shade(W, cx, cy, R, f, real, tilt) {
    // The canvas is turned by the tilt so the lit side points the right way; turn the map back by
    // the same angle, so the craters and seas stay where they are in the sky (north up).
    var tc = Math.cos((tilt || 0) * Math.PI / 180), ts = Math.sin((tilt || 0) * Math.PI / 180);
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
        var A = real ? -0.1 - 0.15 * nz : -0.03 - 0.22 * nz, B = real ? 0.08 + 0.37 * nz : 0.03 + 0.42 * nz;   // the real face keeps the wide fade across the middle and stays soft at the rim, so the cusps curve instead of pinching
        var tt = Math.min(1, Math.max(0, (dot - A) / (B - A))), a = tt * tt * (3 - 2 * tt) * edge;
        var o = (y * W + x) * 4;
        if (real) {
          // The real face: sunlight on the map's brightness, and a faint earthshine on the dark side.
          var rim = Math.sqrt(rr), fx = Math.max(0, (rim - 0.72) / 0.28), keep = 1 - fx * fx * fx;   // the surface fades to plain light at the edge: most of it in the outer 10%, eased in from further inside so there is no line
          var sun = tt * tt * (3 - 2 * tt); keep = 1 - (1 - keep) * sun;   // the fade and the brightening belong to the lit side only
          var k = 1 - keep * (1 - albedo(nx * tc - ny * ts, nx * ts + ny * tc, nz)), lum = sun * (0.71 + 0.29 * k) + (1 - sun) * (0.015 + 0.03 * k);
          d[o] = ink[0] * lum + 24 * (1 - lum); d[o + 1] = ink[1] * lum + 25 * (1 - lum); d[o + 2] = ink[2] * lum + 28 * (1 - lum);
          // Brighter toward the lit edge: the fade zone warms up to near white, so the face runs smoothly into the glow.
          var hot = (1 - keep) * 0.75 * sun;
          d[o] += (255 - d[o]) * hot; d[o + 1] += (253 - d[o + 1]) * hot; d[o + 2] += (246 - d[o + 2]) * hot;
          d[o + 3] = Math.round(edge * 255);
          continue;
        }
        if (a <= 0) continue;
        d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2]; d[o + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    return cvs;
  }

  // The real face on its own, for drawings that place the moon themselves (the Sky tab's arc).
  // MoonFace(f, turn, px): a canvas px wide, lit for phase f with the Sun on the right while waxing,
  // its map turned by `turn` degrees (see shade). Null until the map has loaded.
  window.MoonFace = function (f, turn, px) {
    if (!texture()) return null;
    var c = window.MoonFace.cache || (window.MoonFace.cache = {}), k = Math.round(px) + '|' + f.toFixed(3) + '|' + Math.round(turn);
    if (!c[k]) { var n = Math.max(8, Math.round(px)); c[k] = shade(n, n / 2, n / 2, n / 2, f, true, turn); }
    return c[k];
  };

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
    var real = !cv.hasAttribute('data-flat') && R >= 10 && !!texture();   // the real surface everywhere, unless a canvas asks for the flat moon (data-flat) or is too small to show it
    var sk = W + '|' + f.toFixed(4) + '|' + strength.toFixed(3) + (real ? '|real|' + Math.round(tilt * 2) : '');
    var st = cv.__moonStatic || (cv.__moonStatic = document.createElement('canvas'));
    if (cv.__moonKey !== sk) {
      cv.__moonKey = sk; st.width = W; st.height = W;
      (function (ctx) {

        // The lit face, shaded like a real sphere: each pixel's brightness follows how squarely the
        // Sun hits it there, fading to dark across the terminator. Near the poles the sunlight only
        // grazes, so the lit edge fades out before it gets there: the shadow side meets the edge in
        // one smooth curve, with no thin horns running along the rim.
        var lit = shade(W, cx, cy, R, f, real, tilt);
        // The glow comes from the sunlit part only, never the earthshine: a mask of the plain lit face.
        var glowSrc = real ? shade(W, cx, cy, R, f, false) : lit;

        // Rule 1 + 2: glow made from the lit face itself, blurred at three radii.
        var layers = [[160, 0.4], [70, 0.2], [34, 0.12]];
        var paintLit = function (c) { c.drawImage(glowSrc, 0, 0); };
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
