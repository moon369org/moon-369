/*! moon-live: Moon's live moon as one tag. https://moon369.org/api#moon-image (MIT)
 * <script src="https://cdn.jsdelivr.net/npm/moon369/moon-live.js"></script>
 * <moon-live size="160"></moon-live>     at="<unix ms>" shows another moment
 * Built by scripts/build-live.cjs from site/js/moon-phase.js, moonglow.js and moon-live-el.js. Do not edit. */
/*
 * True moon phase for any instant, from the Moon's real position.
 *
 * Moon's months follow the mean lunation (that is the standard), but the real
 * moon speeds up and slows down along its elliptical orbit, so the sky can run
 * up to about 14 hours ahead of or behind the mean. Everything that *shows* a
 * phase uses this function so the icon matches the moon outside.
 *
 * Method: elongation of the Moon from the Sun with the principal periodic
 * terms (Meeus, Astronomical Algorithms, ch. 47-49). Quarter-phase instants
 * land within about 15 minutes of published times.
 *
 *   MoonPhase.fraction(ms)      0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
 *   MoonPhase.illumination(ms)  0..1 fraction of the disc lit
 *   MoonPhase.name(fraction)    "Waxing crescent", ...
 *   MoonPhase.path(fraction, r, tilt) SVG path of the lit part for a disc of radius r, turned by tilt
 *   MoonPhase.limbAngle(ms)     which way the lit side points: degrees from north toward east
 *   MoonPhase.distance(ms)      Earth-Moon distance in km
 *   MoonPhase.sky(ms)           phase, tilt, distance and tide strength at one instant (same as the API's "sky")
 *   MoonPhase.tilt(ms)          degrees to turn a standard drawing (lit right while waxing) clockwise
 *                               so its lit side points the real way, north up and east to the left
 */
(function (root) {
  const RAD = Math.PI / 180;
  const sin = (d) => Math.sin(d * RAD);
  const norm = (d) => ((d % 360) + 360) % 360;

  function elongation(ms) {
    const jd = ms / 86400000 + 2440587.5;
    const T = (jd - 2451545.0) / 36525;
    const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868);
    const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699);
    const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    // Moon longitude perturbations minus the Sun's equation of center, in degrees.
    const moon =
      6.288774 * sin(Mp) + 1.274027 * sin(2 * D - Mp) + 0.658314 * sin(2 * D) +
      0.213618 * sin(2 * Mp) - 0.185116 * E * sin(M) - 0.114332 * sin(2 * F) +
      0.058793 * sin(2 * D - 2 * Mp) + 0.057066 * E * sin(2 * D - M - Mp) +
      0.053322 * sin(2 * D + Mp) + 0.045758 * E * sin(2 * D - M) -
      0.040923 * E * sin(M - Mp) - 0.034720 * sin(D) - 0.030383 * E * sin(M + Mp) +
      0.015327 * sin(2 * D - 2 * F) - 0.012528 * sin(Mp + 2 * F) + 0.010980 * sin(Mp - 2 * F) +
      0.010675 * sin(4 * D - Mp) + 0.010034 * sin(3 * Mp) + 0.008548 * sin(4 * D - 2 * Mp);
    const sun = (1.914602 - 0.004817 * T) * sin(M) + 0.019993 * sin(2 * M) + 0.000289 * sin(3 * M);
    return norm(D + moon - sun);
  }

  const fraction = (ms) => elongation(ms) / 360;
  const cos = (d) => Math.cos(d * RAD);
  // Lit fraction from the true phase angle: Moon latitude and the Earth-Moon and
  // Earth-Sun distances (Meeus ch. 47-48). Matches PyEphem within 0.05 points.
  function illumination(ms) {
    const T = (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;
    const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868);
    const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699);
    const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    const beta = 5.128122 * sin(F) + 0.280602 * sin(Mp + F) + 0.277693 * sin(Mp - F) + 0.173237 * sin(2 * D - F) +
      0.055413 * sin(2 * D - Mp + F) + 0.046271 * sin(2 * D - Mp - F) + 0.032573 * sin(2 * D + F) + 0.017198 * sin(2 * Mp + F);
    const dist = 385000.56 - 20905.355 * cos(Mp) - 3699.111 * cos(2 * D - Mp) - 2955.968 * cos(2 * D) - 569.925 * cos(2 * Mp) +
      48.888 * E * cos(M) - 3.149 * cos(2 * F) + 246.158 * cos(2 * D - 2 * Mp) - 152.138 * E * cos(2 * D - M - Mp) -
      170.733 * cos(2 * D + Mp) - 204.586 * E * cos(2 * D - M) - 129.620 * E * cos(M - Mp) + 108.743 * cos(D) + 104.755 * E * cos(M + Mp);
    const R = 149597870.7 * (1.000140 - 0.016708 * cos(M) - 0.000141 * cos(2 * M));
    const psi = Math.acos(Math.max(-1, Math.min(1, cos(beta) * cos(elongation(ms)))));
    const i = Math.atan2(R * Math.sin(psi), dist - R * Math.cos(psi));
    return (1 + Math.cos(i)) / 2;
  }
  const NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const name = (f) => NAMES[Math.floor((f * 8 + 0.5) % 8)];
  function path(f, r = 10, tilt = 0) {
    const k = Math.cos(2 * Math.PI * f), waxing = f < 0.5;
    const outer = waxing ? 1 : 0, inner = (waxing === (k > 0)) ? 0 : 1, rx = Math.abs(k) * r;
    if (!tilt) return 'M0,-' + r + ' A' + r + ',' + r + ' 0 0 ' + outer + ' 0,' + r + ' A' + rx.toFixed(3) + ',' + r + ' 0 0 ' + inner + ' 0,-' + r + 'Z';
    // Turned: the poles move, and the terminator ellipse turns with them.
    const a = tilt * RAD, x = (r * Math.sin(a)).toFixed(3), y = (r * Math.cos(a)).toFixed(3);
    const nx = (-r * Math.sin(a)).toFixed(3), ny = (-r * Math.cos(a)).toFixed(3);
    return 'M' + x + ',' + ny + ' A' + r + ',' + r + ' 0 0 ' + outer + ' ' + nx + ',' + y + ' A' + rx.toFixed(3) + ',' + r + ' ' + tilt + ' 0 ' + inner + ' ' + x + ',' + ny + 'Z';
  }

  // Position angle of the bright limb (Meeus ch. 48), seen from Earth's centre. Good to about
  // two degrees, plenty for a drawing. Same math as the API (api/src/moon.ts limbAngle).
  function limbAngle(ms) {
    const T = (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;
    const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868);
    const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699);
    const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    const sunLon = norm(280.46646 + 36000.76983 * T + (1.914602 - 0.004817 * T) * sin(M) + 0.019993 * sin(2 * M) + 0.000289 * sin(3 * M));
    const moonLon = norm(218.3164477 + 481267.88123421 * T +
      6.288774 * sin(Mp) + 1.274027 * sin(2 * D - Mp) + 0.658314 * sin(2 * D) +
      0.213618 * sin(2 * Mp) - 0.185116 * E * sin(M) - 0.114332 * sin(2 * F) +
      0.058793 * sin(2 * D - 2 * Mp) + 0.057066 * E * sin(2 * D - M - Mp) +
      0.053322 * sin(2 * D + Mp) + 0.045758 * E * sin(2 * D - M) -
      0.040923 * E * sin(M - Mp) - 0.034720 * sin(D) - 0.030383 * E * sin(M + Mp));
    const beta = 5.128122 * sin(F) + 0.280602 * sin(Mp + F) + 0.277693 * sin(Mp - F) + 0.173237 * sin(2 * D - F) +
      0.055413 * sin(2 * D - Mp + F) + 0.046271 * sin(2 * D - Mp - F) + 0.032573 * sin(2 * D + F) + 0.017198 * sin(2 * Mp + F);
    const eps = 23.439291 - 0.0130042 * T;
    const eq = (lon, lat) => [Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * RAD) * sin(eps), cos(lon)),
      Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon))];
    const s = eq(sunLon, 0), m = eq(moonLon, beta);
    const chi = Math.atan2(Math.cos(s[1]) * Math.sin(s[0] - m[0]), Math.sin(s[1]) * Math.cos(m[1]) - Math.cos(s[1]) * Math.sin(m[1]) * Math.cos(s[0] - m[0]));
    return norm(chi / RAD);
  }
  function tilt(ms) {
    const pa = limbAngle(ms) * RAD, dir = Math.atan2(-Math.cos(pa), -Math.sin(pa)) / RAD;
    const t = fraction(ms) < 0.5 ? dir : dir + 180;
    return Math.round(((((t + 180) % 360) + 360) % 360 - 180) * 10) / 10;
  }

  function distance(ms) {
    const T = (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;
    const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868);
    const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T);
    const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699);
    const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    return 385000.56 - 20905.355 * cos(Mp) - 3699.111 * cos(2 * D - Mp) - 2955.968 * cos(2 * D) - 569.925 * cos(2 * Mp) +
      48.888 * E * cos(M) - 3.149 * cos(2 * F) + 246.158 * cos(2 * D - 2 * Mp) - 152.138 * E * cos(2 * D - M - Mp) -
      170.733 * cos(2 * D + Mp) - 204.586 * E * cos(2 * D - M) - 129.620 * E * cos(M - Mp) + 108.743 * cos(D) + 104.755 * E * cos(M + Mp);
  }
  // Same rules as the API (api/src/moon.ts skyAt): spring within about 2.5 days of new or full,
  // neap within about 2.5 days of a quarter, king when a spring tide meets a supermoon.
  const TIDE_NOTES = {
    king: 'Spring tide with the Moon near its closest: the biggest swings of the month',
    spring: 'Sun and Moon in line: the biggest swings of the month',
    medium: 'Between spring and neap tides',
    neap: 'Sun and Moon at right angles: the smallest swings of the month',
  };
  function sky(ms) {
    const f = fraction(ms), el = f * 360, lit = illumination(ms), km = distance(ms);
    const fromSyzygy = Math.min(el, Math.abs(el - 180), 360 - el);
    const syzygy = fromSyzygy < 30, quarter = Math.abs(fromSyzygy - 90) < 30, supermoon = syzygy && km < 367600;
    const strength = syzygy ? (supermoon ? 'king' : 'spring') : quarter ? 'neap' : 'medium';
    return {
      phase: { name: name(f), fraction: Math.round(f * 1e6) / 1e6, illumination: Math.round(lit * 1e4) / 1e4 },
      tilt: { limb_angle_deg: Math.round(limbAngle(ms) * 10) / 10, rotate_deg: tilt(ms), fully_lit: lit > 0.98 },
      distance: { km: Math.round(km), vs_average_km: Math.round(km - 384400), supermoon: supermoon },
      tide: { strength: strength, note: TIDE_NOTES[strength] },
    };
  }

  const api = { elongation, fraction, illumination, name, path, limbAngle, tilt, distance, sky };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonPhase = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
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

;
/* <moon-live size="160" at="<unix ms>"></moon-live>: Moon's live moon. Today's phase and tilt, glowing and animated.
   Needs MoonPhase (moon-phase.js) and the moonglow loop (moonglow.js), which draws every canvas.hm-moonglow. */
(function () {
  if (typeof window === 'undefined' || !window.customElements || customElements.get('moon-live')) return;
  class MoonLive extends HTMLElement {
    static get observedAttributes() { return ['size', 'at']; }
    connectedCallback() { this.draw(); }
    attributeChangedCallback() { if (this.cv) this.draw(); }
    draw() {
      var n = Math.max(16, Math.min(2000, parseInt(this.getAttribute('size'), 10) || 160)), at = this.getAttribute('at');
      this.style.display = 'inline-block'; this.style.position = 'relative'; this.style.width = n + 'px'; this.style.height = n + 'px'; this.style.verticalAlign = 'middle';
      if (!this.getAttribute('role')) { this.setAttribute('role', 'img'); this.setAttribute('aria-label', 'The Moon'); }
      if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.className = 'hm-moonglow'; this.cv.setAttribute('aria-hidden', 'true'); this.appendChild(this.cv); }
      var w = n * 1.9;   // room for the glow to fade out
      this.cv.style.cssText = 'position:absolute;left:50%;top:50%;width:' + w + 'px;height:' + w + 'px;margin:' + (-w / 2) + 'px 0 0 ' + (-w / 2) + 'px;pointer-events:none;display:block';
      if (at) this.cv.setAttribute('data-at', at); else this.cv.removeAttribute('data-at');
    }
  }
  customElements.define('moon-live', MoonLive);
})();
