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

  // The real faces. Shared with the API's eclipse icons (api/src/eclipse-icon.ts), so both look the same.
  //   sun   brighter in the middle, dimmer and warmer toward its edge (limb darkening), with fine, still granulation
  //   moon  not a flat black hole: the real near side, barely there in earthshine (same map as js/moonglow.js)
  function hash(i, j) { var h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
  function vnoise(x, y) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return (hash(i, j) * (1 - fx) + hash(i + 1, j) * fx) * (1 - fy) + (hash(i, j + 1) * (1 - fx) + hash(i + 1, j + 1) * fx) * fy;
  }
  function sunPx(nx, ny) {   // -> [r,g,b] for a point on the sun's disc, nx,ny in -1..1
    var rr = nx * nx + ny * ny, mu = Math.sqrt(Math.max(0, 1 - rr)), m1 = 1 - mu;
    var I = 1 - 0.38 * m1 - 0.2 * m1 * m1;
    var gran = (vnoise(nx * 7 + 9, ny * 7 + 9) - 0.5) * 0.6 + (vnoise(nx * 16 + 3, ny * 16 + 3) - 0.5) * 0.4;
    var L = (0.7 + 0.3 * I) * (1 + gran * 0.09 * mu), w = Math.pow(m1, 1.2);
    return [(248 * (1 - w) + 228 * w) * L, (244 * (1 - w) + 205 * w) * L, (234 * (1 - w) + 168 * w) * L];
  }
  var MAP = null, mapLoading = false, faces = {};
  function moonMap() {
    if (MAP || mapLoading) return MAP; mapLoading = true;
    var im = new Image();
    im.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        var d = x.getImageData(0, 0, im.width, im.height).data, v = new Uint8Array(im.width * im.height);
        for (var i = 0; i < v.length; i++) v[i] = d[i * 4];
        MAP = { w: im.width, h: im.height, v: v }; faces = {};
      } catch (e) { /* a blocked image: keep the plain disc */ }
    };
    var here = /(^|\.)moon369\.org$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
    if (!here) im.crossOrigin = 'anonymous';
    im.src = (here ? '' : 'https://moon369.org') + '/assets/moon/near-side.jpg';
    return null;
  }
  function albedo(nx, ny, nz) {
    var lon = Math.atan2(nx, nz), lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
    var u = (lon / Math.PI + 0.5) * (MAP.w - 1), v = (0.5 - lat / Math.PI) * (MAP.h - 1);
    var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, w = MAP.w, a = MAP.v;
    var x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(MAP.h - 1, y0 + 1);
    var k = ((a[y0 * w + x0] * (1 - fx) + a[y0 * w + x1] * fx) * (1 - fy) + (a[y1 * w + x0] * (1 - fx) + a[y1 * w + x1] * fx) * fy) / 255;
    return Math.min(1, Math.max(0, (k - 0.22) / 0.58));
  }
  function moonPx(nx, ny) {   // earthshine on the near side: very dark, the maria just readable
    var nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), k = MAP ? albedo(nx, ny, nz) : 0.5;
    var lum = (0.025 + 0.17 * k) * (0.45 + 0.55 * nz);
    return [11 + (233 - 11) * lum, 11 + (228 - 11) * lum, 13 + (216 - 13) * lum];
  }
  function faceCanvas(kind, r) {   // a disc of radius r px, antialiased, cached
    var n = Math.max(4, Math.ceil(r * 2)), key = kind + n + (kind === 'moon' && MAP ? 'm' : '');
    if (faces[key]) return faces[key];
    var cv = document.createElement('canvas'); cv.width = cv.height = n;
    var c = cv.getContext('2d'), im = c.createImageData(n, n), d = im.data, R = n / 2;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var nx = (x + 0.5 - R) / R, ny = (y + 0.5 - R) / R, rr = nx * nx + ny * ny;
      var edge = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * R + 0.5));
      if (edge <= 0) continue;
      var p = kind === 'sun' ? sunPx(nx, ny) : moonPx(nx, ny), o = (y * n + x) * 4;
      d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = edge * 255;
    }
    c.putImageData(im, 0, 0);
    return (faces[key] = cv);
  }

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
      c.drawImage(faceCanvas('sun', g.R), g.cx - g.R, g.cy - g.R, g.R * 2, g.R * 2);
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

  // Fixed, irregular layouts (seeded, so every visit looks the same).
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function streamers() {
    var r = rng(11), out = [], n = 6;
    for (var k = 0; k < n; k++) {
      var a = (k + 0.15 + r() * 0.7) / n * Math.PI * 2;
      out.push({ a: a, len: 0.5 + r() * 0.32, w: 0.09 + r() * 0.13, op: 0.7 + r() * 0.5, bend: (r() - 0.5) * 0.1 });
    }
    return out;
  }
  function filaments(n) {
    var r = rng(29), out = [];
    for (var j = 0; j < n; j++) {
      var br = Math.pow(r(), 1.7);
      out.push({ a: r() * Math.PI * 2, len: 0.3 + Math.pow(r(), 1.1) * 0.75, op: 0.07 + br * 0.32, w: 2 + Math.pow(r(), 2) * 8, p: r() * 100, bend: (r() - 0.5) * 0.08, layer: br > 0.55 ? 0 : br > 0.2 ? 1 : 2 });
    }
    return out;
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
    if (corona) {
      // Hybrid: the corona only shows where the ring has thinned away.
      var side = function (ang) { return type === 'hybrid' ? Math.max(0, Math.min(1, (0.25 - Math.cos(ang)) / 1.05)) : 1; };
      // A few long, soft streamers: tapered petals of light, each drifting very slowly.
      var S = cv.__ecS || (cv.__ecS = streamers());
      blurDraw(ctx, W, Math.max(2, Math.round(W / (small ? 40 : 60))), 1, 'lighter', function (c) {
        for (var k = 0; k < S.length; k++) {
          var st = S[k], ang = st.a + 0.06 * wave(t * 0.05, k * 1.7), env = side(ang);
          if (env < 0.03) continue;
          var len = Math.min(g.R * st.len * (1 + 0.08 * wave(t * 0.09, k * 2.3)), W * 0.44 - g.R), half = st.w;
          var bx = g.cx + Math.cos(ang) * g.R, by = g.cy + Math.sin(ang) * g.R;
          var tx = g.cx + Math.cos(ang + st.bend) * (g.R + len), ty = g.cy + Math.sin(ang + st.bend) * (g.R + len);
          var gr = c.createRadialGradient(g.cx, g.cy, g.R * 0.95, g.cx, g.cy, g.R + len);
          var a = st.op * env * (0.85 + 0.15 * wave(t * 0.11, k));
          gr.addColorStop(0, 'rgba(' + LIGHT + ',' + a + ')');
          gr.addColorStop(0.3, 'rgba(' + LIGHT + ',' + a * 0.45 + ')');
          gr.addColorStop(0.7, 'rgba(' + LIGHT + ',' + a * 0.1 + ')');
          gr.addColorStop(1, 'rgba(' + LIGHT + ',0)');
          c.fillStyle = gr; c.beginPath();
          c.moveTo(g.cx + Math.cos(ang - half) * g.R * 0.98, g.cy + Math.sin(ang - half) * g.R * 0.98);
          c.quadraticCurveTo(g.cx + Math.cos(ang - half * 0.35) * (g.R + len * 0.45), g.cy + Math.sin(ang - half * 0.35) * (g.R + len * 0.45), tx, ty);
          c.quadraticCurveTo(g.cx + Math.cos(ang + half * 0.35) * (g.R + len * 0.45), g.cy + Math.sin(ang + half * 0.35) * (g.R + len * 0.45), g.cx + Math.cos(ang + half) * g.R * 0.98, g.cy + Math.sin(ang + half) * g.R * 0.98);
          c.closePath(); c.fill();
        }
      });
      // Rays: tapered wedges, wide at the limb and fading to a point, in three layers from soft to sharp
      // so neighbouring rays blur into one another. Angles, lengths, widths and brightness are all irregular.
      var F = cv.__ecF || (cv.__ecF = filaments(small ? 80 : 220));
      var layers = small ? [[W / 45, 1.6, 0], [W / 140, 0.8, 1]] : [[W / 38, 1.5, 0], [W / 110, 0.85, 1], [W / 320, 0.45, 2]];
      for (var L = 0; L < layers.length; L++) {
        var blurPx = Math.max(1, Math.round(layers[L][0])), widen = layers[L][1], layer = layers[L][2];
        blurDraw(ctx, W, blurPx, BLUR_OK ? 1 : 0.7, 'lighter', function (c) {
          for (var j = 0; j < F.length; j++) {
            var f = F[j];
            if (f.layer > layer + 1) continue;   // the sharpest layer only draws the brightest rays
            var ang = f.a + 0.012 * wave(t * 0.06, f.p), env = side(ang), near = 0;
            for (var k = 0; k < S.length; k++) { var d = Math.atan2(Math.sin(ang - S[k].a), Math.cos(ang - S[k].a)); near += S[k].op * Math.exp(-d * d / 0.08); }
            near = Math.min(1, near);
            var reach = Math.min(g.R * f.len * (0.6 + 0.6 * near) * (1 + 0.1 * wave(t * 0.08, f.p)), W * 0.45 - g.R);
            var a = f.op * env * (0.45 + 0.7 * near) * (0.85 + 0.15 * wave(t * 0.1, f.p * 1.3)) / (layer === 2 ? 1.4 : 1);
            if (a < 0.01) continue;
            var half = f.w * widen * (g.R / 100) / g.R, bend = f.bend + 0.01 * wave(t * 0.07, f.p * 0.7);
            var tip = g.R + reach, mid = g.R + reach * 0.4;
            var gr = c.createRadialGradient(g.cx, g.cy, g.R * 0.97, g.cx, g.cy, tip);
            gr.addColorStop(0, 'rgba(' + LIGHT + ',' + Math.min(1, a) + ')');
            gr.addColorStop(0.2, 'rgba(' + LIGHT + ',' + Math.min(1, a) * 0.6 + ')');
            gr.addColorStop(0.55, 'rgba(' + LIGHT + ',' + Math.min(1, a) * 0.22 + ')');
            gr.addColorStop(0.85, 'rgba(' + LIGHT + ',' + Math.min(1, a) * 0.05 + ')');
            gr.addColorStop(1, 'rgba(' + LIGHT + ',0)');
            c.fillStyle = gr; c.beginPath();
            c.moveTo(g.cx + Math.cos(ang - half) * g.R * 0.97, g.cy + Math.sin(ang - half) * g.R * 0.97);
            c.quadraticCurveTo(g.cx + Math.cos(ang + bend * 0.5 - half * 0.45) * mid, g.cy + Math.sin(ang + bend * 0.5 - half * 0.45) * mid, g.cx + Math.cos(ang + bend) * tip, g.cy + Math.sin(ang + bend) * tip);
            c.quadraticCurveTo(g.cx + Math.cos(ang + bend * 0.5 + half * 0.45) * mid, g.cy + Math.sin(ang + bend * 0.5 + half * 0.45) * mid, g.cx + Math.cos(ang + half) * g.R * 0.97, g.cy + Math.sin(ang + half) * g.R * 0.97);
            c.closePath(); c.fill();
          }
        });
      }
    } else {
      // Annular and partial: no spikes. The bare sun just glows, with light that drifts slowly along the edge.
      blurDraw(ctx, W, Math.max(2, Math.round(W / 22)), 1, 'lighter', function (c) {
        for (var k = 0; k < 7; k++) {
          var ang = k / 7 * Math.PI * 2 + 0.35 * wave(t * 0.04, k * 2.9), px = g.cx + Math.cos(ang) * g.R, py = g.cy + Math.sin(ang) * g.R;
          var env = type === 'partial' ? Math.max(0, Math.min(1, (Math.hypot(px - g.mx, py - g.my) - g.mr) / (g.R * 0.25))) : 1;
          var a = 0.16 * env * (0.6 + 0.4 * (0.5 + 0.5 * wave(t * 0.15, k * 1.3)));
          if (a < 0.01) continue;
          var gr = c.createRadialGradient(px, py, 0, px, py, g.R * 0.55);
          gr.addColorStop(0, 'rgba(' + SUN + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + SUN + ',0)');
          c.fillStyle = gr; c.beginPath(); c.arc(px, py, g.R * 0.55, 0, Math.PI * 2); c.fill();
        }
      });
    }

    // The moon goes on top of everything.
    disc(ctx, g.mx, g.my, g.mr * 0.995, DARK); moonMap(); ctx.drawImage(faceCanvas('moon', g.mr), g.mx - g.mr, g.my - g.mr, g.mr * 2, g.mr * 2);
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
      var cv = all[i], r;
      if (cv.hasAttribute('data-wait')) continue;   // its real type is still loading
      r = cv.getBoundingClientRect();
      if (r.bottom < 0 || r.top > (window.innerHeight || 800)) continue;
      if (reduce && cv.__ecKey === (cv.getAttribute('data-type') || 'total') + '|' + Math.round(cv.clientWidth * Math.min(2, window.devicePixelRatio || 1))) continue;
      draw(cv, reduce ? 20 : (now - t0) / 1000 + 30 + i * 13);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
