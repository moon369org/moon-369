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

  // Long beams: many at a time, each at a random place on the limb. Each one eases in,
  // holds and eases out on its own clock, so they never flash or pulse together.
  var beams = [];
  function spawn(now) {
    var v = 0.03 + Math.random() * 0.94;                         // anywhere on the visible surface
    beams.push({ v: v, born: now, life: 8800 + Math.random() * 10400, drift: (Math.random() - 0.5) * 0.06,
      len: 0.12 + Math.pow(Math.random(), 0.8) * 0.85, soft: Math.random(), width: 0.5 + Math.random() * 1.1, peak: 0.2 + Math.pow(Math.random(), 1.5) * 0.8 });
  }


  // A beam that is widest where it leaves the moon and narrows to nothing at its tip.
  function taper(o, x0, y0, x1, y1, w0) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L * w0 / 2, ny = dx / L * w0 / 2;
    o.beginPath(); o.moveTo(x0 + nx, y0 + ny); o.lineTo(x1, y1); o.lineTo(x0 - nx, y0 - ny); o.closePath(); o.fill();
  }
  function cap(o, cx, cy, R) { o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); }

  function draw(cv, t, now) {
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var w = Math.max(1, Math.round(W / 2)), h = Math.max(1, Math.round(H / 2));
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
    var o = off.getContext('2d');
    o.clearRect(0, 0, w, h);

    // The moon: the top of a circle shows above the footer line, with enough curve
    // that its sides fall away into the dark and it reads as a round moon.
    var chord = w * 0.7, ch = Math.max(4, Math.min(70 * dpr / 2, chord / 14));   // same shape on every screen
    var R = (chord * chord / 4 + ch * ch) / (2 * ch), cx = w / 2;
    ch = ch * 0.3; chord = 2 * Math.sqrt(2 * R * ch - ch * ch);   // same moon, sunk 70%
    var cy = h + R - ch;
    var span = Math.asin(Math.min(1, (chord / 2) / R)) * 2.4;    // the moon continues under the line: light still rises off its hidden sides

    // Halo: rings centred on the moon itself, so the light is perfectly round (Rule 1 + 2).
    o.globalCompositeOperation = 'lighter';
    var halo = o.createRadialGradient(cx, cy, R * 0.995, cx, cy, R + h * 0.2);
    halo.addColorStop(0, 'rgba(' + INK + ',1)');            // bright right on the surface
    halo.addColorStop(0.05, 'rgba(' + INK + ',0.7)');
    halo.addColorStop(0.15, 'rgba(' + INK + ',0.3)');
    halo.addColorStop(0.4, 'rgba(' + INK + ',0.06)');
    halo.addColorStop(1, 'rgba(' + INK + ',0)');
    o.fillStyle = halo; o.fillRect(0, 0, w, h);

    // Rays, radial from the centre. Each one brightens and dims on its own clock, so
    // nothing travels sideways along the edge (that read as flowing water).
    var n = Math.round(Math.max(80, chord / 3.2) * 2.2);
    for (var j = 0; j < n; j++) {
      var v = j / (n - 1);
      var ang = -span + v * span * 2;
      var base = Math.max(0, Math.cos((v - 0.5) * Math.PI));
      var env = Math.pow(base, 0.6);
      if (env < 0.02) continue;
      var seed = Math.sin(j * 12.9898) * 43758.5453; seed -= Math.floor(seed);
      var seed2 = Math.sin(j * 78.233) * 12543.31; seed2 -= Math.floor(seed2);
      var tw = 0.5 + 0.5 * Math.sin(t * (0.6 + seed * 1.4) + seed2 * 6.28);
      // Flow: soft swells of light glide around the curve, so the corona moves as one.
      var flow = 0.5 + 0.5 * Math.sin(v * 9 - t * 0.9 + wave(t * 0.25, v * 3) * 1.2);
      tw = tw * 0.45 + flow * 0.55;
      var len = h * (0.1 + 0.28 * seed2) * (0.75 + 0.25 * tw) * env;
      var a = Math.min(1, (0.25 + 0.75 * tw) * env * 0.9);
      var dx = Math.sin(ang), dy = -Math.cos(ang);
      var x0 = cx + dx * R * 0.997, y0 = cy + dy * R * 0.997;   // Rule 1: start inside the white
      var x1 = cx + dx * (R + len), y1 = cy + dy * (R + len);
      var g = o.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(' + INK + ',' + a * 0.25 + ')');      // the surface glow carries the base, so the edge stays smooth
      g.addColorStop(0.08, 'rgba(' + INK + ',' + a * 0.7 + ')');
      g.addColorStop(0.18, 'rgba(' + INK + ',' + a * 0.5 + ')');
      g.addColorStop(0.45, 'rgba(' + INK + ',' + a * 0.15 + ')');
      g.addColorStop(1, 'rgba(' + INK + ',0)');               // Rule 2: always fade to nothing
      o.fillStyle = g; taper(o, x0, y0, x1, y1, Math.max(1.5, w / 360));
    }

    // Long beams.
    for (var b = beams.length - 1; b >= 0; b--) {
      var B = beams[b], k = (now - B.born) / B.life;
      if (k >= 1) { beams.splice(b, 1); continue; }
      var fade = Math.sin(Math.PI * k); fade = fade * fade;      // eases in and out, no hard start or stop
      var bv = B.v + B.drift * k;                                // beams glide slowly along the curve
      var bang = -span + bv * span * 2, benv = Math.pow(Math.max(0, Math.cos((bv - 0.5) * Math.PI)), 0.35); // fades only right at the ends (Rule 3)
      var bx = Math.sin(bang), by = -Math.cos(bang);
      var bl = h * B.len * (0.85 + 0.15 * k), ba = B.peak * fade * benv;
      var bx0 = cx + bx * R * 0.995, by0 = cy + by * R * 0.995, bx1 = cx + bx * (R + bl), by1 = cy + by * (R + bl);
      var bg = o.createLinearGradient(bx0, by0, bx1, by1);
      bg.addColorStop(0, 'rgba(' + INK + ',' + ba + ')');           // brightest on the moon's surface
      bg.addColorStop(0.06, 'rgba(' + INK + ',' + ba * 0.7 + ')');  // then falls off fast, like real light
      bg.addColorStop(0.2, 'rgba(' + INK + ',' + ba * 0.35 + ')');
      bg.addColorStop(0.45, 'rgba(' + INK + ',' + ba * 0.12 + ')');
      bg.addColorStop(0.75, 'rgba(' + INK + ',' + ba * 0.03 + ')');
      bg.addColorStop(1, 'rgba(' + INK + ',0)');                // Rule 2
      // Some beams are crisp, some soft: a soft beam trades its core for a wider halo.
      // Every layer tapers, so the light spreads at the start and narrows as it travels.
      var bw = Math.max(1, (w / 600) * B.width);
      o.fillStyle = bg;
      o.globalAlpha = 1 - B.soft * 0.7; taper(o, bx0, by0, bx1, by1, bw * 2.2);
      if (B.soft > 0.15) {
        o.globalAlpha = 0.35 * B.soft; taper(o, bx0, by0, bx1, by1, bw * (4 + 6 * B.soft));
        o.globalAlpha = 0.18 * B.soft; taper(o, bx0, by0, bx1, by1, bw * (8 + 12 * B.soft));
      }
      // A soft bloom where the beam leaves the surface.
      var bl0 = o.createRadialGradient(bx0, by0, 0, bx0, by0, bw * 6);
      bl0.addColorStop(0, 'rgba(' + INK + ',' + ba * 0.15 + ')'); bl0.addColorStop(1, 'rgba(' + INK + ',0)');
      o.globalAlpha = 1; o.fillStyle = bl0; o.fillRect(bx0 - bw * 6, by0 - bw * 6, bw * 12, bw * 12);
      o.globalAlpha = 1;
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
    // The moon itself, with its edge melting into the glow: a stack of tight blurs right on
    // the surface, then the disc with the faintest softening, so the white falls off smoothly.
    var u = Math.max(1, cv.clientWidth / 1440) * dpr;
    ctx.globalCompositeOperation = 'lighter';
    var edge = [[30, 0.3], [16, 0.45], [8, 0.55], [4, 0.6]];
    for (var e = 0; e < edge.length; e++) {
      ctx.filter = 'blur(' + Math.max(1, Math.round(edge[e][0] * u)) + 'px)';
      ctx.globalAlpha = edge[e][1];
      cap(ctx, cx * 2, cy * 2, R * 2); ctx.fillStyle = 'rgb(' + INK + ')'; ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.filter = 'blur(' + Math.max(1, Math.round(1.5 * u)) + 'px)';
    cap(ctx, cx * 2, cy * 2, R * 2); ctx.fillStyle = 'rgb(' + INK + ')'; ctx.fill();
    ctx.filter = 'none';
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now(), last = 0;
  var nextBeam = 0;
  function frame(now) {
    if (!reduce && now > nextBeam && beams.length < 11) { spawn(now); nextBeam = now + 640 + Math.random() * 2240; }
    if (now - last > 33) {
      var all = document.querySelectorAll('canvas.ft-glow');
      for (var c = 0; c < all.length; c++) {
        var r = all[c].getBoundingClientRect();
        if (r.bottom > 0 && r.top < (window.innerHeight || 800) && (!reduce || !all[c].width)) {
          draw(all[c], reduce ? 12 : (now - t0) / 1000 * 0.75 + 40, now); last = now;
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
