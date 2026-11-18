/* The real horizon around a place: how high the land stands in every direction, so the moon chart
   can show when the moon actually clears the ridge. Built in the browser from open terrain tiles
   (AWS Terrain Tiles, Terrarium encoding), about 80 tiles and two or three seconds, then cached.
   window.MoonHorizon.profile(lat, lng, facingSouth) -> Promise<{ az: [deg...], alt: [deg...] }>
   window.MoonHorizon.at(profile, az) -> the land's height in degrees at that bearing */
(function () {
  var TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/';
  var R_EARTH = 6371000, RE = R_EARTH / (1 - 0.13);   // the Earth's curve, eased by ordinary refraction
  var NEAR = 15000, FAR = 110000, EYE = 2;
  var rad = Math.PI / 180;

  // ---- tiles ----
  var cache = {};
  function tile(z, x, y) {
    var n = 1 << z; x = ((x % n) + n) % n;
    var k = z + '/' + x + '/' + y;
    if (!cache[k]) cache[k] = fetch(TILES + k + '.png', { mode: 'cors' }).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
      .then(function (b) { return createImageBitmap(b); }).then(function (img) {
        var c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
        var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        var d = g.getImageData(0, 0, 256, 256).data, e = new Float32Array(65536);
        for (var i = 0, j = 0; i < 65536; i++, j += 4) { var v = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768; e[i] = v > 0 ? v : 0; }   // the sea counts as zero
        return e;
      }).catch(function () { return null; });
    return cache[k];
  }
  // Web Mercator: degrees to global pixel coordinates at zoom z (256-pixel tiles).
  function px(lat, lng, z) {
    var s = 256 * Math.pow(2, z), sl = Math.sin(lat * rad);
    return [(lng + 180) / 360 * s, (0.5 - Math.log((1 + sl) / (1 - sl)) / (4 * Math.PI)) * s];
  }
  function tilesAround(lat, lng, z, radius) {
    var dLat = radius / 111320, dLng = radius / (111320 * Math.max(0.05, Math.cos(lat * rad)));
    var a = px(lat + dLat, lng - dLng, z), b = px(lat - dLat, lng + dLng, z), out = [];
    for (var x = Math.floor(a[0] / 256); x <= Math.floor(b[0] / 256); x++)
      for (var y = Math.floor(a[1] / 256); y <= Math.floor(b[1] / 256); y++) out.push([z, x, y]);
    return out;
  }
  function sampler(z, grid) {
    var n = 1 << z;
    function at(gx, gy) {
      var tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), t = grid[z + '/' + (((tx % n) + n) % n) + '/' + ty];
      if (!t) return NaN;
      var ix = Math.min(255, Math.max(0, Math.floor(gx - tx * 256))), iy = Math.min(255, Math.max(0, Math.floor(gy - ty * 256)));
      return t[iy * 256 + ix];
    }
    return function (lat, lng) {   // bilinear, across tile edges too
      var p = px(lat, lng, z), x = p[0] - 0.5, y = p[1] - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      var a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    };
  }
  // The point d metres away along a bearing (great circle).
  function dest(lat, lng, brg, d) {
    var p1 = lat * rad, l1 = lng * rad, th = brg * rad, dr = d / R_EARTH;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(th));
    var l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
    return [p2 / rad, l2 / rad];
  }

  function compute(lat, lng, south) {
    var want = tilesAround(lat, lng, 12, NEAR + 1500).concat(tilesAround(lat, lng, 10, FAR + 4000)), grid = {};
    return Promise.all(want.map(function (t) { return tile(t[0], t[1], t[2]).then(function (e) { if (e) grid[t.join('/')] = e; }); })).then(function () {
      var near = sampler(12, grid), far = sampler(10, grid);
      var h0 = near(lat, lng); if (!(h0 >= 0)) h0 = far(lat, lng); if (!(h0 >= 0)) h0 = 0;
      h0 += EYE;
      var az = [], alt = [];
      for (var rel = 15; rel <= 345.0001; rel += 0.5) {
        var a = south ? rel : (rel + 180) % 360, best = -90;
        for (var d = 30; d <= FAR; d += d < NEAR ? 30 : 120) {
          var p = dest(lat, lng, a, d), h = d < NEAR ? near(p[0], p[1]) : far(p[0], p[1]);
          if (!(h >= 0)) continue;
          var ang = Math.atan((h - h0 - d * d / (2 * RE)) / d) / rad;
          if (ang > best) best = ang;
        }
        az.push(a); alt.push(best);
      }
      // A 5-point median takes out single spikes in the nearest terrain.
      var med = alt.map(function (v, i) { var w = alt.slice(Math.max(0, i - 2), i + 3).slice().sort(function (x, y) { return x - y; }); return w[w.length >> 1]; });
      return { az: az, alt: med.map(function (v) { return Math.round(v * 100) / 100; }), south: !!south, h0: Math.round(h0) };
    });
  }

  function profile(lat, lng, south) {
    if (!(lat >= -85 && lat <= 85) || !(lng >= -180 && lng <= 180)) return Promise.reject(new Error('Bad place'));
    var key = 'moonHorizon2:' + lat.toFixed(2) + ',' + lng.toFixed(2) + (south === false ? 'n' : '');
    try { var hit = localStorage.getItem(key); if (hit) return Promise.resolve(JSON.parse(hit)); } catch (e) {}
    return compute(lat, lng, south !== false).then(function (p) {
      var good = p.alt.filter(function (v) { return v > -90; }).length > p.alt.length * 0.8;
      if (!good) throw new Error('No terrain');
      try { localStorage.setItem(key, JSON.stringify(p)); } catch (e) {}
      return p;
    });
  }
  // The land's angle at a compass bearing; outside the computed fan, the nearest edge.
  function at(p, az) {
    if (!p) return 0;
    var rel = ((p.south ? az : az + 180) % 360 + 360) % 360, i = (rel - 15) / 0.5;
    if (i <= 0) return Math.max(0, p.alt[0]); if (i >= p.alt.length - 1) return Math.max(0, p.alt[p.alt.length - 1]);
    var i0 = Math.floor(i), f = i - i0;
    return p.alt[i0] * (1 - f) + p.alt[i0 + 1] * f;
  }
  window.MoonHorizon = { profile: profile, at: at, compute: compute };
})();
