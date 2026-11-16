/*
 * Sky Check, the math: find the Moon in a photo, measure how much of it is lit and which way the
 * lit side points, and work out what Moon time says the sky should show at that moment and place.
 * No DOM here, so it runs in the browser and in tests. Needs MoonPhase (js/moon-phase.js).
 *
 *   MoonSkyCheck.measure(lum, w, h)        lum: one byte of brightness per pixel, row by row
 *   MoonSkyCheck.expected(ms, lat, lng)    lat/lng may be null: then the tilt can't be checked
 *   MoonSkyCheck.compare(measured, expected)
 *   MoonSkyCheck.exif(arrayBuffer)         { ms, lat, lng } from a JPEG's EXIF, when present
 *
 * Angles on screen are degrees clockwise from straight up, like a clock face.
 */
(function (root) {
  var RAD = Math.PI / 180;
  var MP = function () { return root.MoonPhase; };
  var clockDeg = function (dx, dy) { return ((Math.atan2(dx, -dy) / RAD) + 360) % 360; };   // screen vector -> clockwise from up
  var angDiff = function (a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  /* ---------- the Moon in a photo ---------- */

  // Least-squares circle through points (Kasa).
  function fitCircle(pts) {
    var n = pts.length, mx = 0, my = 0;
    for (var i = 0; i < n; i++) { mx += pts[i][0]; my += pts[i][1]; }
    mx /= n; my /= n;
    var suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (i = 0; i < n; i++) {
      var u = pts[i][0] - mx, v = pts[i][1] - my;
      suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
    }
    var det = suu * svv - suv * suv;
    if (Math.abs(det) < 1e-9) return null;
    var b1 = (suuu + suvv) / 2, b2 = (svvv + svuu) / 2;
    var uc = (b1 * svv - b2 * suv) / det, vc = (b2 * suu - b1 * suv) / det;
    return [uc + mx, vc + my, Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)];
  }

  function measure(lum, w, h) {
    // Brightest pixels, ignoring a few hot ones.
    var hist = new Uint32Array(256), i;
    for (i = 0; i < lum.length; i++) hist[lum[i]]++;
    var top = 0, seen = 0;
    for (i = 255; i >= 0; i--) { seen += hist[i]; if (seen >= 12) { top = i; break; } }
    if (top < 60) return { ok: false, reason: 'dark' };
    // A phone usually overexposes the Moon: its face clips to white and a glow spreads around it.
    // Then cut higher, so the glow isn't counted as Moon.
    var T = Math.max(40, Math.round(top * (top >= 245 ? 0.6 : 0.35)));

    // The largest bright patch is the Moon.
    var lab = new Int32Array(w * h), best = -1, bestN = 0, q = new Int32Array(w * h), id = 0;
    for (i = 0; i < w * h; i++) {
      if (lum[i] < T || lab[i]) continue;
      id++; var head = 0, tail = 0, n = 0; q[tail++] = i; lab[i] = id;
      while (head < tail) {
        var k = q[head++], x = k % w, y = (k - x) / w; n++;
        if (x > 0 && !lab[k - 1] && lum[k - 1] >= T) { lab[k - 1] = id; q[tail++] = k - 1; }
        if (x < w - 1 && !lab[k + 1] && lum[k + 1] >= T) { lab[k + 1] = id; q[tail++] = k + 1; }
        if (y > 0 && !lab[k - w] && lum[k - w] >= T) { lab[k - w] = id; q[tail++] = k - w; }
        if (y < h - 1 && !lab[k + w] && lum[k + w] >= T) { lab[k + w] = id; q[tail++] = k + w; }
      }
      if (n > bestN) { bestN = n; best = id; }
    }
    if (bestN < 30) return { ok: false, reason: 'small' };

    // Its box, and darker patches inside it (the seas) filled in.
    var x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (i = 0; i < w * h; i++) if (lab[i] === best) { var xx = i % w, yy = (i - xx) / w; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    var bx0 = Math.max(0, x0 - 1), by0 = Math.max(0, y0 - 1), bx1 = Math.min(w - 1, x1 + 1), by1 = Math.min(h - 1, y1 + 1);
    var bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, inside = new Uint8Array(bw * bh), out = new Uint8Array(bw * bh);
    for (var yy2 = 0; yy2 < bh; yy2++) for (var xx2 = 0; xx2 < bw; xx2++) inside[yy2 * bw + xx2] = lab[(yy2 + by0) * w + xx2 + bx0] === best ? 1 : 0;
    var head2 = 0, tail2 = 0, q2 = new Int32Array(bw * bh);
    var push = function (kk) { if (!inside[kk] && !out[kk]) { out[kk] = 1; q2[tail2++] = kk; } };
    for (var xb = 0; xb < bw; xb++) { push(xb); push((bh - 1) * bw + xb); }
    for (var yb = 0; yb < bh; yb++) { push(yb * bw); push(yb * bw + bw - 1); }
    while (head2 < tail2) {
      var kk = q2[head2++], xk = kk % bw, yk = (kk - xk) / bw;
      if (xk > 0) push(kk - 1); if (xk < bw - 1) push(kk + 1); if (yk > 0) push(kk - bw); if (yk < bh - 1) push(kk + bw);
    }
    var area = 0, sx = 0, sy = 0, edge = [];
    for (yb = 0; yb < bh; yb++) for (xb = 0; xb < bw; xb++) {
      var kq = yb * bw + xb; if (out[kq]) continue;
      area++; sx += xb + bx0 + 0.5; sy += yb + by0 + 0.5;
      var e = xb === 0 || yb === 0 || xb === bw - 1 || yb === bh - 1 || out[kq - 1] || out[kq + 1] || out[kq - bw] || out[kq + bw];
      if (e) edge.push([xb + bx0 + 0.5, yb + by0 + 0.5]);
    }
    if (edge.length > 3000) { var st = edge.length / 3000, sm = []; for (var s = 0; s < edge.length; s += st) sm.push(edge[Math.floor(s)]); edge = sm; }

    // The whole disc. The lit rim is part of one circle and every lit pixel lies inside it; the
    // shadow edge is a curve the lit part pokes outside of. So: try circles through three edge
    // points, keep the one that runs along the most edge and holds every lit pixel, then refine it.
    var litPts = [];
    for (var t2 = 0; t2 < 400; t2++) { var e2 = edge[Math.floor(Math.random() * edge.length)]; litPts.push(e2); }
    var bestC = null, bestScore = 0, tol = Math.max(1.5, Math.sqrt(area) * 0.012);
    var circ3 = function (a, b, d) {
      var D = 2 * (a[0] * (b[1] - d[1]) + b[0] * (d[1] - a[1]) + d[0] * (a[1] - b[1]));
      if (Math.abs(D) < 1e-9) return null;
      var a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], d2 = d[0] * d[0] + d[1] * d[1];
      var ux = (a2 * (b[1] - d[1]) + b2 * (d[1] - a[1]) + d2 * (a[1] - b[1])) / D, uy = (a2 * (d[0] - b[0]) + b2 * (a[0] - d[0]) + d2 * (b[0] - a[0])) / D;
      return [ux, uy, Math.hypot(a[0] - ux, a[1] - uy)];
    };
    var maxR = Math.max(x1 - x0, y1 - y0) * 0.75 + 4;
    for (var it = 0; it < 600; it++) {
      var cc = circ3(edge[Math.floor(Math.random() * edge.length)], edge[Math.floor(Math.random() * edge.length)], edge[Math.floor(Math.random() * edge.length)]);
      if (!cc || cc[2] < 6 || cc[2] > maxR) continue;
      var outside = 0;
      for (var li = 0; li < litPts.length; li++) if (Math.hypot(litPts[li][0] - cc[0], litPts[li][1] - cc[1]) > cc[2] + tol) outside++;
      if (outside > litPts.length * 0.02) continue;
      var on = 0;
      for (var ei = 0; ei < edge.length; ei++) if (Math.abs(Math.hypot(edge[ei][0] - cc[0], edge[ei][1] - cc[1]) - cc[2]) <= tol) on++;
      if (on > bestScore) { bestScore = on; bestC = cc; }
    }
    if (!bestC) return { ok: false, reason: 'shape' };
    var c = bestC;
    for (var pass = 0; pass < 2; pass++) {
      var inl = edge.filter(function (p) { return Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - c[2]) <= tol * 1.5; });
      var fc = inl.length >= 12 ? fitCircle(inl) : null;
      if (fc && Math.abs(fc[2] - c[2]) < c[2] * 0.1) c = fc;
    }
    var rim = edge.filter(function (p) { return Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - c[2]) <= tol * 1.5; });
    // How much of the lit rim there is: a Moon shows at least half a circle of it.
    var bins = new Uint8Array(36), span = 0;
    rim.forEach(function (p) { bins[Math.floor(((Math.atan2(p[1] - c[1], p[0] - c[0]) / RAD) + 360) % 360 / 10)] = 1; });
    for (i = 0; i < 36; i++) span += bins[i] * 10;
    if (span < 120) return { ok: false, reason: 'shape', cx: c[0], cy: c[1], r: c[2] };

    var lit = Math.min(1, area / (Math.PI * c[2] * c[2]));
    var dx = sx / area - c[0], dy = sy / area - c[1];
    return {
      ok: true, cx: c[0], cy: c[1], r: c[2], lit: lit, rimSpan: span,
      // which way the lit side points, clockwise from up; meaningless near full
      dir: Math.hypot(dx, dy) > c[2] * 0.02 ? clockDeg(dx, dy) : null,
    };
  }

  /* ---------- what the sky should show ---------- */

  // Low-precision Moon position (same terms as js/sky.js) for the parallactic angle.
  function moonRaDec(ms) {
    var d = ms / 86400000 - 0.5 + 2440588 - 2451545, E = RAD * 23.4397;
    var Lp = RAD * (218.3165 + 13.17639648 * d), D = RAD * (297.8502 + 12.19074912 * d);
    var M = RAD * (357.5291 + 0.98560028 * d), Mp = RAD * (134.9634 + 13.06499295 * d), F = RAD * (93.2721 + 13.22935024 * d);
    var l = Lp + RAD * (6.289 * Math.sin(Mp) + 1.274 * Math.sin(2 * D - Mp) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * Mp) - 0.186 * Math.sin(M) - 0.114 * Math.sin(2 * F));
    var b = RAD * (5.128 * Math.sin(F) + 0.281 * Math.sin(Mp + F) + 0.278 * Math.sin(Mp - F) + 0.173 * Math.sin(2 * D - F));
    return { d: d, ra: Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l)), dec: Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l)) };
  }

  function expected(ms, lat, lng) {
    var m = MP(), f = m.fraction(ms), out = { ms: ms, fraction: f, lit: m.illumination(ms), name: m.name(f), limbAngle: m.limbAngle(ms), dir: null, alt: null };
    if (lat == null || lng == null) return out;
    var c = moonRaDec(ms), phi = RAD * lat, H = RAD * (280.16 + 360.9856235 * c.d) + RAD * lng - c.ra;
    var q = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(H));
    out.alt = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)) / RAD;
    // The lit side's angle from straight up, counterclockwise (east is to the left in the sky)...
    var Z = out.limbAngle * RAD - q;
    // ...as a screen vector, then clockwise from up.
    out.dir = clockDeg(-Math.sin(Z), -Math.cos(Z));
    return out;
  }

  function compare(me, ex) {
    var dLit = Math.abs(me.lit - ex.lit);
    var phase = dLit <= 0.12 ? 'match' : dLit <= 0.22 ? 'close' : 'off';
    var tiltable = ex.dir != null && me.dir != null && ex.lit > 0.04 && ex.lit < 0.94;
    var dDir = tiltable ? angDiff(me.dir, ex.dir) : null;
    var tilt = !tiltable ? 'skip' : dDir <= 25 ? 'match' : dDir <= 45 ? 'close' : 'off';
    var verdict = phase === 'off' || tilt === 'off' ? 'off' : phase === 'match' && (tilt === 'match' || tilt === 'skip') ? 'match' : 'close';
    return { verdict: verdict, phase: phase, tilt: tilt, dLit: dLit, dDir: dDir };
  }

  /* ---------- when and where the photo was taken ---------- */

  function exif(buf) {
    try {
      var v = new DataView(buf), n = v.byteLength, p = 2;
      if (v.getUint16(0) !== 0xFFD8) return null;
      while (p + 4 < n) {
        var mk = v.getUint16(p), len = v.getUint16(p + 2);
        if (mk === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) return tiff(v, p + 10);
        if ((mk & 0xFF00) !== 0xFF00 || mk === 0xFFDA) return null;
        p += 2 + len;
      }
    } catch (e) {}
    return null;
  }
  function tiff(v, t) {
    var le = v.getUint16(t) === 0x4949, u16 = function (o) { return v.getUint16(t + o, le); }, u32 = function (o) { return v.getUint32(t + o, le); };
    var str = function (o, c) { var s = ''; for (var i = 0; i < c; i++) { var ch = v.getUint8(t + o + i); if (!ch) break; s += String.fromCharCode(ch); } return s; };
    var ifd = function (o) {
      var out = {}, cnt = u16(o);
      for (var i = 0; i < cnt; i++) {
        var e = o + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4), val = e + 8;
        var size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 })[type] || 1;
        if (size * count > 4) val = u32(e + 8);
        if (type === 2) out[tag] = str(val, count);
        else if (type === 3) out[tag] = u16(val);
        else if (type === 4) out[tag] = u32(val);
        else if (type === 5) { var a = []; for (var k = 0; k < count; k++) a.push(u32(val + k * 8) / (u32(val + k * 8 + 4) || 1)); out[tag] = a; }
      }
      return out;
    };
    var i0 = ifd(u32(4)), ex = i0[0x8769] ? ifd(i0[0x8769]) : {}, gps = i0[0x8825] ? ifd(i0[0x8825]) : {};
    var r = { ms: null, lat: null, lng: null, zoned: false };
    var dt = ex[0x9003] || i0[0x0132];
    var m = dt && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt);
    if (m) {
      var off = ex[0x9011] && /^([+-])(\d{2}):(\d{2})$/.exec(ex[0x9011]);
      if (off) {
        r.ms = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - (off[1] === '-' ? -1 : 1) * (off[2] * 3600000 + off[3] * 60000); r.zoned = true;
      } else r.ms = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();   // no zone written: the phone's local time
    }
    var dms = function (a) { return a && a.length === 3 ? a[0] + a[1] / 60 + a[2] / 3600 : null; };
    var la = dms(gps[2]), lo = dms(gps[4]);
    if (la != null && lo != null) { r.lat = gps[1] === 'S' ? -la : la; r.lng = gps[3] === 'W' ? -lo : lo; }
    return r;
  }

  var api = { measure: measure, expected: expected, compare: compare, exif: exif, angDiff: angDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonSkyCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
