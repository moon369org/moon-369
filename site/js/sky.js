/* The moon's path across one local day, for Your Moon.
   window.MoonSky.day(startMs, endMs, lat, lng) samples the moon and sun every 5 minutes and finds
   moonrise, the highest point and moonset. window.MoonSky.mount(el, cfg) draws the sky view.
   Positions use the principal terms of the lunar theory (Meeus, Astronomical Algorithms, ch. 47)
   and a low-precision sun, with topocentric parallax and refraction: rise and set are good to a
   few minutes, which is all a picture of the sky needs. */
(function () {
  var PI = Math.PI, rad = PI / 180, E = rad * 23.4397;
  // Safari accepts ctx.filter but may ignore it, so test it by drawing (same check as the moons).
  var BLUR_OK = (function () {
    try { var c = document.createElement('canvas'); c.width = c.height = 20; var x = c.getContext('2d', { willReadFrequently: true });
      x.filter = 'blur(3px)'; x.fillStyle = '#fff'; x.fillRect(8, 8, 4, 4); return x.getImageData(3, 10, 1, 1).data[3] > 0; } catch (e) { return false; }
  })();
  var sin = Math.sin, cos = Math.cos, tan = Math.tan, asin = Math.asin, atan2 = Math.atan2;
  function days(ms) { return ms / 86400000 - 0.5 + 2440588 - 2451545; }
  function ra(l, b) { return atan2(sin(l) * cos(E) - tan(b) * sin(E), cos(l)); }
  function dec(l, b) { return asin(sin(b) * cos(E) + cos(b) * sin(E) * sin(l)); }
  function sidereal(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }
  function altitude(H, phi, de) { return asin(sin(phi) * sin(de) + cos(phi) * cos(de) * cos(H)); }
  function azimuth(H, phi, de) { return atan2(sin(H), cos(H) * sin(phi) - tan(de) * cos(phi)); }   // from south, westward
  function refraction(h) { if (h < -0.0105) h = -0.0105; return 0.0002967 / tan(h + 0.00312536 / (h + 0.08901179)); }

  function moonCoords(d) {
    var Lp = rad * (218.3165 + 13.17639648 * d), D = rad * (297.8502 + 12.19074912 * d);
    var M = rad * (357.5291 + 0.98560028 * d), Mp = rad * (134.9634 + 13.06499295 * d), F = rad * (93.2721 + 13.22935024 * d);
    var l = Lp + rad * (6.289 * sin(Mp) + 1.274 * sin(2 * D - Mp) + 0.658 * sin(2 * D) + 0.214 * sin(2 * Mp) - 0.186 * sin(M) - 0.114 * sin(2 * F)
      + 0.059 * sin(2 * D - 2 * Mp) + 0.057 * sin(2 * D - M - Mp) + 0.053 * sin(2 * D + Mp) + 0.046 * sin(2 * D - M) - 0.041 * sin(M - Mp));
    var b = rad * (5.128 * sin(F) + 0.281 * sin(Mp + F) + 0.278 * sin(Mp - F) + 0.173 * sin(2 * D - F) + 0.055 * sin(2 * D - Mp + F) + 0.046 * sin(2 * D - Mp - F));
    var dist = 385001 - 20905 * cos(Mp) - 3699 * cos(2 * D - Mp) - 2956 * cos(2 * D);   // km
    return { ra: ra(l, b), dec: dec(l, b), dist: dist };
  }
  function sunCoords(d) {
    var M = rad * (357.5291 + 0.98560028 * d), C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
    var L = M + C + rad * 102.9372 + PI;
    return { ra: ra(L, 0), dec: dec(L, 0) };
  }
  /** Apparent altitude (degrees) of the moon's centre and its compass bearing (degrees from north). */
  function moonAt(ms, lat, lng) {
    var d = days(ms), c = moonCoords(d), phi = rad * lat, H = sidereal(d, rad * -lng) - c.ra;
    var h = altitude(H, phi, c.dec);
    h -= asin(6378.14 / c.dist) * cos(h);   // seen from the ground, not Earth's centre
    h += refraction(h);
    return { alt: h / rad, az: (azimuth(H, phi, c.dec) / rad + 180 + 360) % 360 };
  }
  function sunAlt(ms, lat, lng) {
    var d = days(ms), c = sunCoords(d), H = sidereal(d, rad * -lng) - c.ra;
    var h = altitude(H, rad * lat, c.dec);
    return (h + refraction(h)) / rad;
  }

  var RISE = -0.27;   // the moon's upper limb on the horizon: centre about one semidiameter below it
  function day(t0, t1, lat, lng) {
    var step = 5 * 60000, pts = [], rise = null, set = null, top = null;
    for (var t = t0; t <= t1 + 1; t += step) {
      var m = moonAt(t, lat, lng);
      pts.push({ t: t, alt: m.alt, az: m.az, sun: sunAlt(t, lat, lng) });
    }
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], fa = a.alt - RISE, fb = b.alt - RISE;
      if ((fa < 0) !== (fb < 0)) {
        var k = fa / (fa - fb), ev = { t: a.t + k * (b.t - a.t), az: a.az + k * (((b.az - a.az + 540) % 360) - 180) };
        if (fb > fa && !rise) rise = ev; else if (fb < fa && !set) set = ev;
      }
    }
    pts.forEach(function (p) { if (p.alt > RISE && (!top || p.alt > top.alt)) top = p; });
    return { pts: pts, rise: rise, set: set, top: top, always: !rise && !set ? (pts[0].alt > RISE ? 'up' : 'down') : null };
  }

  /** One whole pass of the moon, rise to set, around a moment: the pass it is in, else the next one.
      With no moment, the pass that overlaps the local day [t0, t1] the most. Crosses midnight when it must. */
  function pass(t0, t1, at, lat, lng) {
    var wide = day(t0 - 16 * 3600000, t1 + 16 * 3600000, lat, lng), p = wide.pts, segs = [], open = null;
    for (var i = 0; i < p.length; i++) {
      var up = p[i].alt > RISE;
      if (up && open === null) open = i;
      if ((!up || i === p.length - 1) && open !== null) { segs.push({ a: open, b: up ? i : i - 1 }); open = null; }
    }
    segs = segs.filter(function (sg) { return sg.a > 0 && sg.b < p.length - 1; });   // rose and set inside the samples
    var pick = null;
    if (at != null) {
      pick = segs.filter(function (sg) { return p[sg.a].t <= at && at <= p[sg.b].t; })[0] ||
        segs.filter(function (sg) { return p[sg.a].t > at; })[0] || segs[segs.length - 1] || null;
    } else {
      var best = 0;
      segs.forEach(function (sg) { var o = Math.min(t1, p[sg.b].t) - Math.max(t0, p[sg.a].t); if (o > best) { best = o; pick = sg; } });
    }
    if (!pick) { var d0 = day(t0, t1, lat, lng); d0.w0 = t0; d0.w1 = t1; return d0; }   // never rises, or never sets (far north and south)
    var r0 = p[pick.a].t, r1 = p[pick.b].t, pad = 45 * 60000;
    var w0 = Math.min(at != null ? at : r0, r0) - pad, w1 = Math.max(at != null ? at : r1, r1) + pad;
    var d = day(w0, w1, lat, lng);
    d.w0 = w0; d.w1 = w1;
    return d;
  }

  var DIRS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
    'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
  var SHORT = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass(az, short) { var i = Math.round(((az % 360) + 360) % 360 / 22.5) % 16; return (short ? SHORT : DIRS)[i]; }

  /* The sky view: you stand facing the moon's side of the sky (south in the northern hemisphere,
     north in the southern), east and west to either side, and watch the moon cross along its real
     path. mount(el, cfg) draws it with a slider and a play button; cfg.onTime(t, m) reports the moment. */
  function mount(el, cfg) {
    var lat = cfg.lat, lng = cfg.lng, clock = cfg.clock, south = lat >= 0;
    var sky = pass(cfg.t0, cfg.t1, cfg.at, lat, lng), t0 = sky.w0, t1 = sky.w1, tag = cfg.dayTag || function () { return ''; };
    var at = cfg.at != null ? cfg.at : (sky.top ? sky.top.t : (t0 + t1) / 2), playing = null;
    el.innerHTML =
      '<div class="sk-sky"><canvas aria-hidden="true"></canvas></div>' +
      '<div class="sk-stats">' + ['RISE', 'HIGHEST', 'SET'].map(function (k, i) { return '<div><span class="sk-k">' + k + '</span><b data-sk="v' + i + '"></b><span class="sk-s" data-sk="s' + i + '"></span></div>'; }).join('') + '</div>' +
      '<div class="sk-scrub"><div class="sk-row"><span class="sk-now" data-sk="now"></span><button type="button" class="sk-play" data-sk="play" aria-pressed="false"></button></div>' +
      '<div class="sk-track"><div class="sk-bar"></div><div data-sk="ups"></div>' +
      '<input type="range" min="0" max="1440" step="1" aria-label="Time of day"></div>' +
      '<div class="sk-ticks" data-sk="ticks"></div></div>';
    var q = function (k) { return el.querySelector('[data-sk="' + k + '"]'); };
    var cv = el.querySelector('canvas'), range = el.querySelector('input[type=range]');
    var span = t1 - t0, toV = function (t) { return Math.round((t - t0) / span * 1440); }, toT = function (v) { return t0 + v / 1440 * span; };
    // the parts of the day the moon is up, under the slider
    var ups = '', open = null;
    sky.pts.forEach(function (p, i) {
      var up = p.alt > RISE;
      if (up && open === null) open = p.t;
      if ((!up || i === sky.pts.length - 1) && open !== null) { ups += '<div class="sk-up" style="left:' + ((open - t0) / span * 100).toFixed(2) + '%;width:' + ((p.t - open) / span * 100).toFixed(2) + '%"></div>'; open = null; }
    });
    q('ups').innerHTML = ups;
    // whole-hour ticks across the window
    var narrowUI = el.clientWidth < 600, every = (t1 - t0) > 14 * 3600000 ? (narrowUI ? 6 : 3) : (narrowUI ? 3 : 2), ticks = '';
    for (var h = Math.ceil(t0 / 3600000) * 3600000; h <= t1; h += 3600000) {
      var lab = clock(h); if (+lab.slice(0, 2) % every || lab.slice(3) !== '00') continue;
      var pc = (h - t0) / span * 100; if (pc < 3 || pc > 97) continue;
      ticks += '<span style="left:' + pc.toFixed(2) + '%">' + lab + '</span>';
    }
    q('ticks').innerHTML = ticks;
    var PLAY = '<svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M0 0L10 6L0 12Z" fill="currentColor"/></svg><span class="sk-pl">PLAY</span>',
      PAUSE = '<svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M0 0h3.5v12H0zM6.5 0H10v12H6.5z" fill="currentColor"/></svg><span class="sk-pl">PAUSE</span>';
    q('play').innerHTML = PLAY;
    var setStat = function (i, ev, sub) { q('v' + i).textContent = ev ? clock(ev.t) : '—'; q('s' + i).textContent = ev ? sub : (i === 1 ? 'not up' : 'not that day'); };
    setStat(0, sky.rise, sky.rise && 'in the ' + compass(sky.rise.az) + tag(sky.rise.t));
    setStat(1, sky.top && sky.top.alt > 0 ? sky.top : null, sky.top && Math.round(sky.top.alt) + '° up, ' + compass(sky.top.az) + tag(sky.top.t));
    setStat(2, sky.set, sky.set && 'in the ' + compass(sky.set.az) + tag(sky.set.t));
    var cx = cv.getContext('2d');
    function X(az, W, pad) { var a = south ? az : (az + 180) % 360; a = Math.max(15, Math.min(345, a)); return pad + (a - 15) / 330 * (W - pad * 2); }
    function draw() {
      var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
      if (!W || !H) return;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      var narrow = cv.clientWidth < 600, hz = H - 88 * dpr, pad = W * 0.04, top = H * 0.07;   // a fixed strip of ground for labels and the moon below the horizon
      var Y = function (alt) { return hz - (alt / 90) * (hz - top); };
      var m = moonAt(at, lat, lng), sun = sunAlt(at, lat, lng), dk = Math.max(0, Math.min(1, (sun + 12) / 12));
      var g = cx.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0, 'rgb(' + [11 + 14 * dk, 11 + 16 * dk, 13 + 22 * dk].map(Math.round) + ')');
      g.addColorStop(1, 'rgb(' + [20 + 40 * dk, 20 + 38 * dk, 24 + 40 * dk].map(Math.round) + ')');
      cx.fillStyle = g; cx.fillRect(0, 0, W, hz);
      var s = 7;
      for (var i = 0; i < (narrow ? 90 : 160); i++) {
        s = (s * 16807) % 2147483647; var sx = (s % 10000) / 10000 * W; s = (s * 16807) % 2147483647; var sy = (s % 10000) / 10000 * hz * 0.95; s = (s * 16807) % 2147483647;
        var sa = (0.1 + (s % 100) / 220) * (1 - dk); if (sa < 0.01) continue;
        cx.fillStyle = 'rgba(233,228,216,' + sa.toFixed(3) + ')'; cx.beginPath(); cx.arc(sx, sy, dpr * (0.5 + (s % 7) / 7), 0, 7); cx.fill();
      }
      cx.strokeStyle = 'rgba(233,228,216,.07)'; cx.lineWidth = dpr; cx.setLineDash([2 * dpr, 6 * dpr]);
      cx.font = (10 * dpr) + 'px "JetBrains Mono", monospace'; cx.textAlign = 'left';
      [30, 60].forEach(function (a) { cx.beginPath(); cx.moveTo(0, Y(a)); cx.lineTo(W, Y(a)); cx.stroke(); cx.fillStyle = 'rgba(138,139,143,.6)'; cx.fillText(a + '°', 8 * dpr, Y(a) - 6 * dpr); });
      cx.setLineDash([]);
      function path() {
        cx.beginPath(); var first = true, last = null;
        sky.pts.forEach(function (p) {
          if (p.alt < -1) { first = true; return; }
          var x = X(p.az, W, pad), y = Y(Math.max(0, p.alt));
          if (first || (last !== null && Math.abs(x - last) > W * 0.3)) { cx.moveTo(x, y); first = false; } else cx.lineTo(x, y);
          last = x;
        });
      }
      cx.save();
      if (BLUR_OK) { cx.filter = 'blur(' + 8 * dpr + 'px)'; cx.strokeStyle = 'rgba(233,228,216,.35)'; cx.lineWidth = 10 * dpr; }
      else { cx.shadowColor = 'rgba(233,228,216,.55)'; cx.shadowBlur = 16 * dpr; cx.strokeStyle = 'rgba(233,228,216,.14)'; cx.lineWidth = 3 * dpr; }
      path(); cx.stroke(); cx.restore();
      cx.strokeStyle = 'rgba(233,228,216,.85)'; cx.lineWidth = 2 * dpr; cx.lineCap = 'round'; cx.setLineDash([0.1, 7 * dpr]); path(); cx.stroke(); cx.setLineDash([]);
      var gg = cx.createLinearGradient(0, hz, 0, H); gg.addColorStop(0, '#121316'); gg.addColorStop(1, '#0B0B0D');
      cx.fillStyle = gg; cx.fillRect(0, hz, W, H - hz);
      cx.strokeStyle = 'rgba(233,228,216,.5)'; cx.lineWidth = 1.2 * dpr; cx.beginPath(); cx.moveTo(0, hz); cx.lineTo(W, hz); cx.stroke();
      cx.fillStyle = '#8A8B8F'; cx.font = (11 * dpr) + 'px "JetBrains Mono", monospace'; cx.textAlign = 'center';
      var pts16 = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
      pts16.forEach(function (c) {
        var rel = south ? c[0] : (c[0] + 180) % 360; if (rel < 15 || rel > 345) return;
        if (narrow && c[1].length > 1 && !/^(SE|SW|NE|NW)$/.test(c[1])) return;
        if (narrow && (rel < 60 || rel > 300)) return;
        var x = X(c[0], W, pad); cx.fillRect(x - 0.5 * dpr, hz, dpr, 6 * dpr); cx.fillText(c[1], x, hz + 22 * dpr);
      });
      function mark(ev, label, above) {
        if (!ev) return; var x = X(ev.az, W, pad), y = Y(Math.max(0, ev.alt || 0));
        cx.fillStyle = '#E9E4D8'; cx.beginPath(); cx.arc(x, y, 3.5 * dpr, 0, 7); cx.fill();
        cx.font = (11.5 * dpr) + 'px "JetBrains Mono", monospace'; cx.fillStyle = 'rgba(233,228,216,.9)';
        cx.textAlign = x < W * 0.15 ? 'left' : x > W * 0.85 ? 'right' : 'center';
        cx.fillText(label, x, above ? y - 16 * dpr : hz + 44 * dpr);
      }
      mark(sky.rise, 'RISE ' + (sky.rise ? clock(sky.rise.t) : ''));
      if (sky.top && sky.top.alt > 0) mark(sky.top, clock(sky.top.t) + ' · ' + Math.round(sky.top.alt) + '°', true);
      mark(sky.set, 'SET ' + (sky.set ? clock(sky.set.t) : ''));
      var f = window.MoonPhase ? window.MoonPhase.fraction(at) : cfg.f;
      if (m.alt > RISE) {
        var mx = X(m.az, W, pad), my = Y(Math.max(0, m.alt)), r = (narrow ? 15 : 22) * dpr;
        var gl = cx.createRadialGradient(mx, my, r * 0.6, mx, my, r * 4);
        gl.addColorStop(0, 'rgba(233,228,216,' + (0.38 * (1 - dk * 0.6)).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(233,228,216,0)');
        cx.fillStyle = gl; cx.beginPath(); cx.arc(mx, my, r * 4, 0, 7); cx.fill();
        cx.fillStyle = '#2A2B30'; cx.beginPath(); cx.arc(mx, my, r, 0, 7); cx.fill();
        // lit side: right while waxing in the northern hemisphere, mirrored in the southern (turned below)
        var k = Math.cos(f * 2 * PI), wax = f < 0.5;
        var lit = new Path2D('M0,' + -r + 'A' + r + ',' + r + ' 0 0 ' + (wax ? 1 : 0) + ' 0,' + r + 'A' + Math.abs(k * r) + ',' + r + ' 0 0 ' + ((k > 0) === wax ? 0 : 1) + ' 0,' + -r + 'Z');
        // Turn it the way it really sits in your sky: the lit side's angle from north, minus the
        // parallactic angle (how far north is tipped from straight up where you stand).
        var rot = 0;
        if (window.MoonPhase && window.MoonPhase.limbAngle) {
          var dd = days(at), mc = moonCoords(dd), H = sidereal(dd, rad * -lng) - mc.ra, phi = rad * lat;
          var qa = atan2(sin(H), tan(phi) * cos(mc.dec) - sin(mc.dec) * cos(H));
          var Z = window.MoonPhase.limbAngle(at) * rad - qa;
          var dir = atan2(-cos(Z), south ? -sin(Z) : sin(Z));   // east is on the left facing south, on the right facing north
          rot = wax ? dir : dir + PI;
        }
        cx.save(); cx.translate(mx, my); if (window.MoonPhase && window.MoonPhase.limbAngle) cx.rotate(rot); else if (!south) cx.scale(-1, 1);
        if (BLUR_OK) cx.filter = 'blur(' + (0.8 * dpr) + 'px)';
        cx.fillStyle = '#E9E4D8'; cx.fill(lit); cx.restore();
      } else {
        var gx = X(m.az, W, pad);
        cx.strokeStyle = 'rgba(233,228,216,.35)'; cx.setLineDash([3 * dpr, 4 * dpr]); cx.lineWidth = 1.2 * dpr;
        cx.beginPath(); cx.arc(gx, hz + 70 * dpr, 10 * dpr, 0, 7); cx.stroke(); cx.setLineDash([]);
      }
      range.value = toV(at);
      // break only between the parts, so it wraps cleanly onto two lines on phones
      q('now').innerHTML = [clock(at), tag(at).replace(' · ', '').toUpperCase(), m.alt > RISE ? 'MOON UP' : 'BELOW THE HORIZON']
        .filter(Boolean).map(function (x, i, all) { return '<span>' + x + (i < all.length - 1 ? ' ·' : '') + '</span>'; }).join(' ');
      if (cfg.onTime) cfg.onTime(at, m);
    }
    function stop() { if (playing) { cancelAnimationFrame(playing.raf); playing = null; } q('play').setAttribute('aria-pressed', 'false'); q('play').innerHTML = PLAY; }
    range.addEventListener('input', function () { stop(); at = toT(+range.value); draw(); });
    q('play').addEventListener('click', function () {
      if (playing) { stop(); return; }
      if (window.moonTrack) window.moonTrack('Sky played', {});
      if (at >= t1 - 60000) at = t0;
      q('play').setAttribute('aria-pressed', 'true'); q('play').innerHTML = PAUSE;
      var last = performance.now();
      playing = { raf: 0 };
      (function tick(now) {
        at = Math.min(t1, at + (now - last) / 9000 * span); last = now;   // the whole pass in about nine seconds
        draw();
        if (at >= t1) { stop(); return; }
        if (playing) playing.raf = requestAnimationFrame(tick);
      })(last);
    });
    if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe(cv);
    draw();
    return { stop: stop };
  }

  window.MoonSky = { day: day, pass: pass, moonAt: moonAt, sunAlt: sunAlt, compass: compass, mount: mount };
})();
