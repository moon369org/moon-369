/* Sun: the local layer of Moon. Local clock, sunrise, sunset and the seasons.
   Same math as the API (api/src/sun.ts). */
(function () {
  var D2R = Math.PI / 180, JD0 = 2440587.5;
  var jdToMs = function (jd) { return (jd - JD0) * 86400000; };
  var TERMS = [[485,324.96,1934.136],[203,337.23,32964.467],[199,342.08,20.186],[182,27.85,445267.112],[156,73.14,45036.886],[136,171.52,22518.443],[77,222.54,65928.934],[74,296.72,3034.906],[70,243.58,9037.513],[58,119.81,33718.147],[52,297.17,150.678],[50,21.02,2281.232],[45,247.54,29929.562],[44,325.15,31555.956],[29,60.93,4443.417],[18,155.12,67555.328],[17,288.79,4562.452],[16,198.04,62894.029],[14,199.76,31436.921],[12,95.39,14577.848],[12,287.11,31931.756],[12,320.81,34777.259],[9,227.73,1222.114],[8,15.45,16859.074]];
  var POLY = [[2451623.80984,365242.37404,0.05169,-0.00411,-0.00057],[2451716.56767,365241.62603,0.00325,0.00888,-0.0003],[2451810.21715,365242.01767,-0.11575,0.00337,0.00078],[2451900.05952,365242.74049,-0.06223,-0.00823,0.00032]];
  var EVENTS = ['March equinox', 'June solstice', 'September equinox', 'December solstice'];
  var NORTH = ['Spring', 'Summer', 'Autumn', 'Winter'], SOUTH = ['Autumn', 'Winter', 'Spring', 'Summer'];
  function deltaT(y) { if (y >= 2005 && y < 2050) { var t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t - 6; } var u = (y - 1820) / 100; return -20 + 32 * u * u; }
  function seasonEvent(year, k) {
    var Y = (year - 2000) / 1000, c = POLY[k];
    var j0 = c[0] + c[1] * Y + c[2] * Y * Y + c[3] * Math.pow(Y, 3) + c[4] * Math.pow(Y, 4);
    var T = (j0 - 2451545) / 36525, W = (35999.373 * T - 2.47) * D2R;
    var dl = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W), S = 0;
    for (var i = 0; i < TERMS.length; i++) S += TERMS[i][0] * Math.cos((TERMS[i][1] + TERMS[i][2] * T) * D2R);
    return jdToMs(j0 + 0.00001 * S / dl) - deltaT(year) * 1000;
  }
  function season(ms, south) {
    var y = new Date(ms).getUTCFullYear(), ev = [];
    [y - 1, y, y + 1].forEach(function (yy) { for (var k = 0; k < 4; k++) ev.push({ k: k, ms: seasonEvent(yy, k) }); });
    var i = 0; while (ev[i + 1].ms <= ms) i++;
    var names = south ? SOUTH : NORTH, nx = ev[i + 1];
    return { name: names[ev[i].k], next: EVENTS[nx.k], nextSeason: names[nx.k], nextMs: nx.ms, inDays: (nx.ms - ms) / 86400000 };
  }
  // dateUtcNoonMs: noon UTC of the local calendar date
  function sunDay(dateUtcNoonMs, lat, lon) {
    var n = Math.round(dateUtcNoonMs / 86400000 + JD0 - 2451545), Js = n - lon / 360;
    var M = (357.5291 + 0.98560028 * Js) % 360;
    var C = 1.9148 * Math.sin(M * D2R) + 0.02 * Math.sin(2 * M * D2R) + 0.0003 * Math.sin(3 * M * D2R);
    var L = (M + C + 180 + 102.9372) % 360;
    var Jt = 2451545 + Js + 0.0053 * Math.sin(M * D2R) - 0.0069 * Math.sin(2 * L * D2R);
    var sd = Math.sin(L * D2R) * Math.sin(23.4397 * D2R), cd = Math.cos(Math.asin(sd));
    var cw = (Math.sin(-0.833 * D2R) - Math.sin(lat * D2R) * sd) / (Math.cos(lat * D2R) * cd);
    if (cw > 1) return { polar: 'night', noon: jdToMs(Jt) };
    if (cw < -1) return { polar: 'day', noon: jdToMs(Jt) };
    var w = Math.acos(cw) / D2R;
    return { rise: jdToMs(Jt - w / 360), noon: jdToMs(Jt), set: jdToMs(Jt + w / 360), length: w / 180 * 86400 };
  }
  var zone = 'UTC'; try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
  var SOUTH_RE = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate|Tahiti|Rarotonga|Easter)|^America\/(Argentina|Sao_Paulo|Santiago|Montevideo|Asuncion|La_Paz|Lima|Punta_Arenas|Recife|Fortaleza|Bahia|Belem|Maceio|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Manaus)|^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi|Luanda)|^Indian\/(Mauritius|Reunion|Antananarivo)/;
  window.MoonSun = { seasonEvent: seasonEvent, season: season, sunDay: sunDay, zone: zone, south: SOUTH_RE.test(zone) };
  /* Light and Dark: counters from first light and sunset, in Moon seconds. Same rules as api/src/light.ts. */
  var MSEC = 1.0403730490216803, DAYMS = 86400000;
  function edges(ms, lat, lon) {
    var out = [];
    for (var k = -2; k <= 2; k++) {
      var d0 = new Date(ms + k * DAYMS), noonUtc = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate(), 12);
      var d = sunDay(noonUtc, lat, lon);
      if (d.polar === 'day') out.push({ k: 'pd', ms: d.noon - DAYMS / 2 });
      else if (d.polar === 'night') out.push({ k: 'pn', ms: d.noon - DAYMS / 2 });
      else { out.push({ k: 'fl', ms: d.rise }); out.push({ k: 'ss', ms: d.set }); }
    }
    out.sort(function (a, b) { return a.ms - b.ms; });
    return out.filter(function (e, i) { return i === 0 || Math.abs(e.ms - out[i - 1].ms) > 60000; });
  }
  function counter(ms) {
    var s = Math.max(0, Math.floor(ms / 1000 / MSEC)), p = function (n) { return String(n).padStart(2, '0'); };
    return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60);
  }
  function light(ms, lat, lon) {
    var es = edges(ms, lat, lon), i = 0;
    while (i + 1 < es.length && es[i + 1].ms <= ms) i++;
    var cur = es[i], nxt = es[i + 1], ds = i;
    while (ds > 0 && !(es[ds].k === 'fl' || es[ds].k === 'pd' || es[ds].k === 'pn')) ds--;
    var ph = (cur.k === 'fl' || cur.k === 'pd') ? 'light' : 'dark';
    return { phase: ph, counter: counter(ms - cur.ms), remaining: counter(nxt.ms - ms), remainingMs: nxt.ms - ms, began: cur.ms, ends: nxt.ms, dayStart: es[ds].ms,
      polar: cur.k === 'pd' ? 'day' : cur.k === 'pn' ? 'night' : null, label: (ph === 'light' ? 'LIGHT ' : 'DARK ') + counter(ms - cur.ms) };
  }
  window.MoonSun.light = light;
  window.MoonSun.counter = counter;


  /* Homepage Light panel */
  var loc = null; try { loc = JSON.parse(localStorage.getItem('moon.sun.loc') || 'null'); } catch (e) {}
  /* Until someone shares a location, show New York. */
  var approx = { lat: 40.71, lon: -74.01, name: 'NEW YORK', approx: true };
  window.MoonSun.where = function () { var l = null; try { l = JSON.parse(localStorage.getItem('moon.sun.loc') || 'null'); } catch (e) {} return l || approx; };
  var DEMO = approx;
  var EPOCH = -62165308562978.61, MS = 1000 * MSEC;
  var moonDate = function (ms) { var t = ms - EPOCH, dd = Math.floor(t / MS / 86400), y = Math.floor(dd / 369), dy = dd - y * 369, m = Math.floor(dy * 13 / 369); return { y: y, m: m + 1, d: dy - Math.ceil(m * 369 / 13) + 1 }; };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var dur = function (ms) { var mm = Math.round(ms / 60000); return Math.floor(mm / 60) + 'h ' + p2(mm % 60) + 'm'; };
  function cell(label, value, sub, cls) {
    return '<div class="sun-c' + (cls ? ' ' + cls : '') + '"><div class="sun-l">' + label + '</div><div class="sun-v">' + value + '</div>' + (sub ? '<div class="sun-s">' + sub + '</div>' : '') + '</div>';
  }
  function render() {
    var now = Date.now(), L = loc || DEMO, r = light(now, L.lat, L.lon);
    document.querySelectorAll('[data-light-label]').forEach(function (el) { var t = r.label; if (el.textContent !== t) el.textContent = t; });
    var el = document.querySelector('[data-sun-panel]'); if (!el) return;
    var md = moonDate(now);
    var place = loc ? 'YOUR SKY' : DEMO.name;
    var s = season(now, L.lat < 0);
    var html = cell((r.phase === 'light' ? 'LIGHT' : 'DARK') + ' · ' + place, r.counter, r.polar ? (r.polar === 'day' ? 'Midnight sun' : 'Polar night') : (r.phase === 'light' ? 'since first light' : 'since sunset'), 'sun-big');
    html += cell(r.phase === 'light' ? 'UNTIL SUNSET' : 'UNTIL FIRST LIGHT', dur(r.remainingMs), r.phase === 'light' ? 'of light left' : 'of dark left');
    html += cell('MOON DATE', p2(md.m) + ' · ' + p2(md.d), 'Moon ' + p2(md.m) + ', Lune ' + p2(md.d));
    if (loc) html += cell('SEASON', s.name, s.next + ' in ' + Math.ceil(s.inDays) + ' days');
    else html += '<div class="sun-c sun-btn-c"><button type="button" class="sun-btn" data-sun-locate>USE MY LOCATION</button><div class="sun-s">Showing New York until you share yours.</div></div>';
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sun-locate]'); if (!b || !navigator.geolocation) return;
    b.textContent = 'LOCATING…';
    navigator.geolocation.getCurrentPosition(function (p) {
      loc = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 };
      try { localStorage.setItem('moon.sun.loc', JSON.stringify(loc)); } catch (err) {}
      render();
    }, function () { b.textContent = 'LOCATION UNAVAILABLE'; }, { maximumAge: 3600000, timeout: 10000 });
  });
  setInterval(render, 1000);
  var t = 0, iv = setInterval(function () { if (document.querySelector('[data-sun-panel]') || ++t > 50) { clearInterval(iv); render(); } }, 100);
})();
