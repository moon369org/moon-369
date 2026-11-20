/*! moon-live: Moon's live moon as one tag. https://moon369.org/api#moon-image (MIT)
 * <script src="https://cdn.jsdelivr.net/npm/moon369/moon-live.js"></script>
 * <moon-live size="160"></moon-live>     at="<unix ms>" shows another moment
 * <moon-clock size="56"></moon-clock>    live moon + ticking Moon time
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
          var rim = Math.sqrt(rr), keep = rim < 0.7 ? 1 : Math.max(0, 1 - (rim - 0.7) / 0.3); keep = keep * keep * (3 - 2 * keep);   // the surface fades out over the outer 30%, to plain light at the edge
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

;
/* <moon-live size="160" at="<unix ms>"></moon-live>: Moon's live moon. Today's phase and tilt, glowing and animated.
   <moon-clock size="56"></moon-clock>: the live moon beside the ticking Moon time, linked to moon369.org.
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

  // Moon time, ticking: cycle.moon.lune and the hour, beside the live moon. Inherits the page's text color.
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803, p = function (n) { return String(n).padStart(2, '0'); };
  function mark(ms) {
    var t = ms - EPOCH, w = Math.floor(t / SEC), da = Math.floor(w / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - Math.ceil(mi * 369 / 13) + 1, sd = w - da * 86400;
    return [y + '.' + p(mi + 1) + '.' + p(d), p(Math.floor(sd / 3600)) + ':' + p(Math.floor(sd % 3600 / 60)) + ':' + p(sd % 60)];
  }
  class MoonClock extends HTMLElement {
    connectedCallback() {
      if (this.built) return; this.built = true;
      var n = Math.max(24, Math.min(400, parseInt(this.getAttribute('size'), 10) || 56));
      this.style.display = 'inline-flex'; this.style.alignItems = 'center'; this.style.gap = Math.round(n * 0.3) + 'px';
      this.setAttribute('role', 'timer'); this.setAttribute('aria-label', 'Moon time');
      var mono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      this.innerHTML = '<moon-live size="' + n + '"></moon-live><a href="https://moon369.org" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;display:flex;flex-direction:column;gap:' + Math.round(n * 0.06) + 'px;line-height:1">' +
        '<span data-d style="font:' + Math.round(n * 0.3) + 'px ' + mono + ';letter-spacing:.02em"></span>' +
        '<span data-t style="font:' + Math.round(n * 0.42) + 'px ' + mono + ';font-variant-numeric:tabular-nums"></span>' +
        '<span style="font:' + Math.max(9, Math.round(n * 0.17)) + 'px ' + mono + ';letter-spacing:.22em;opacity:.6">MOON TIME</span></a>';
      var d = this.querySelector('[data-d]'), t = this.querySelector('[data-t]'), self = this;
      var tick = function () { var m = mark(Date.now()); if (d.textContent !== m[0]) d.textContent = m[0]; t.textContent = m[1]; };
      tick(); this.iv = setInterval(tick, 250);
    }
    disconnectedCallback() { clearInterval(this.iv); this.built = false; }
  }
  if (!customElements.get('moon-clock')) customElements.define('moon-clock', MoonClock);
})();
