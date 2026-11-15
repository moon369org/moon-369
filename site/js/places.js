/* Places for Your Moon forms outside /night (the homepage band): city search over assets/cities.json,
   "use my location", and the UTC offset of a city's time zone on any date (daylight saving included).
   Slugs and labels follow the same rules as /night (js/night.js) and the share cards (api/src/places.ts).
   MoonPlaces.bind(field) wires a .ym-where block: an input[name=where], a [data-pl-locate] button,
   a [data-pl-list] listbox and a [data-pl-tz] hint. field.place holds the chosen city, or null. */
(function () {
  var WITH_PROVINCE = { US: 1, CA: 1, AU: 1, MX: 1, BR: 1, IN: 1 };
  var CITIES = null, loading = null;
  function ascii(x) { return x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }
  function fold(x) { return x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function load() {
    if (loading) return loading;
    loading = fetch('/assets/cities.json').then(function (r) { return r.json(); }).then(function (j) {
      var seen = {}, list = [];
      j.r.forEach(function (r) {
        var prov = j.p[r[1]], cc = j.c[r[2]].split('|'), base = ascii(r[0] + ' ' + prov + ' ' + cc[1]);
        var k = (seen[base] || 0) + 1; seen[base] = k;
        var near = r[0].indexOf(',') >= 0 ? '' : WITH_PROVINCE[cc[1]] && prov && fold(prov) !== fold(r[0]) ? prov : cc[0];
        list.push({ slug: k > 1 ? base + '-' + k : base, name: r[0], prov: prov, country: cc[0], near: near, tz: j.z[r[3]], lat: r[4], lng: r[5], key: fold(r[0] + ' ' + prov + ' ' + cc[0]), nkey: fold(r[0]) });
      });
      return (CITIES = list);
    });
    return loading;
  }
  function search(q) {
    q = fold(q.trim()); if (!q || !CITIES) return [];
    var a = [], b = [], c = [], words = q.split(/[\s,]+/).filter(Boolean);
    for (var i = 0; i < CITIES.length && a.length < 8; i++) {
      var x = CITIES[i];
      if (x.nkey.indexOf(q) === 0) a.push(x);
      else if (b.length < 8 && x.nkey.indexOf(q) > 0) b.push(x);
      else if (c.length < 8 && words.length > 1 && words.every(function (w) { return x.key.indexOf(w) >= 0; })) c.push(x);
    }
    return a.concat(b, c).slice(0, 8);
  }
  function tzOffset(tz, ms) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var y = +p.year; if (p.era === 'BC' || p.era === 'B') y = 1 - y;
    var d = new Date(0); d.setUTCFullYear(y, +p.month - 1, +p.day); d.setUTCHours(+p.hour % 24, +p.minute, +p.second, 0);
    return Math.round((d.getTime() - Math.floor(ms / 1000) * 1000) / 60000);
  }
  /** Minutes east of UTC for a wall-clock time in time zone tz on that date. */
  function zIn(tz, y, mo, d, h, mi) {
    var g = new Date(0); g.setUTCFullYear(y, mo - 1, d); g.setUTCHours(h == null ? 12 : h, h == null ? 0 : mi, 0, 0);
    var o1 = tzOffset(tz, g.getTime());
    return tzOffset(tz, g.getTime() - o1 * 60000);
  }
  function zoneName(tz, ms) {
    var nm = function (style) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(new Date(ms)).filter(function (x) { return x.type === 'timeZoneName'; })[0].value; };
    try { var v = nm('long'); if (/^GMT/.test(v)) { try { v = nm('longGeneric'); } catch (e) {} } return /^GMT/.test(v) ? tz.replace(/_/g, ' ') : v; } catch (e) { return tz; }
  }
  var MY_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })();
  function label(p) { return p.near ? p.name + ', ' + p.near : p.name; }
  function fmtZ(z) { var a = Math.abs(z); return (z < 0 ? '-' : '+') + p2(Math.floor(a / 60)) + p2(a % 60); }

  function bind(field, getDate) {
    var inp = field.querySelector('input[name=where]'), list = field.querySelector('[data-pl-list]'), hint = field.querySelector('[data-pl-tz]');
    var opts = [], active = -1;
    field.place = null;
    inp.spellcheck = false;
    var show = function (el, on) { if (on) el.removeAttribute('data-off'); else el.setAttribute('data-off', ''); };
    function hintNow() {
      var tz = field.place ? field.place.tz : MY_TZ; if (!tz || !hint) return;
      var d = getDate && getDate(), ms = Date.now();
      if (d) { var z = zIn(tz, d.y, d.mo, d.d, d.h, d.mi), g = new Date(0); g.setUTCFullYear(d.y, d.mo - 1, d.d); g.setUTCHours(d.h == null ? 12 : d.h, d.h == null ? 0 : d.mi); ms = g.getTime() - z * 60000; }
      hint.textContent = (field.place ? '' : 'Your time zone: ') + zoneName(tz, ms) + ' (UTC' + fmtZ(tzOffset(tz, ms)).replace(/(\d\d)$/, ':$1') + (d ? ' that day' : '') + ')';
    }
    function close() { show(list, false); list.innerHTML = ''; inp.setAttribute('aria-expanded', 'false'); active = -1; }
    function pick(p) { field.place = p; inp.value = label(p); close(); hintNow(); }
    function open(items) {
      opts = items; active = -1;
      if (!items.length) { close(); return; }
      list.innerHTML = items.map(function (p, i) {
        return '<li role="option" id="pl-opt-' + i + '" data-i="' + i + '"><b>' + p.name.replace(/</g, '&lt;') + '</b><span>' + [p.prov !== p.name ? p.prov : '', p.country].filter(Boolean).join(', ') + '</span></li>';
      }).join('');
      show(list, true); inp.setAttribute('aria-expanded', 'true');
    }
    function setActive(i) {
      active = (i + opts.length) % opts.length;
      Array.prototype.forEach.call(list.children, function (li, k) { li.setAttribute('aria-selected', String(k === active)); });
      inp.setAttribute('aria-activedescendant', 'pl-opt-' + active);
    }
    inp.addEventListener('focus', load);
    inp.addEventListener('input', function () {
      var v = inp.value; field.place = null;
      if (!v.trim()) { close(); hintNow(); return; }
      load().then(function () { if (inp.value === v) open(search(v)); });
    });
    inp.addEventListener('keydown', function (e) {
      if (!opts.length || list.hasAttribute('data-off')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(opts[active]); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', function (e) { var li = e.target.closest('li'); if (li) { e.preventDefault(); pick(opts[+li.getAttribute('data-i')]); } });
    document.addEventListener('mousedown', function (e) { if (!field.contains(e.target)) close(); });
    var loc = field.querySelector('[data-pl-locate]');
    if (loc) loc.addEventListener('click', function () {
      if (!navigator.geolocation) return;
      loc.setAttribute('aria-busy', 'true');
      Promise.all([load(), new Promise(function (ok, no) { navigator.geolocation.getCurrentPosition(ok, no, { timeout: 10000, maximumAge: 600000 }); })]).then(function (a) {
        var la = a[1].coords.latitude, lo = a[1].coords.longitude, k = Math.cos(la * Math.PI / 180), best = null, bd = 1e9;
        CITIES.forEach(function (c) { var dx = (c.lng - lo) * k, dy = c.lat - la, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = c; } });
        if (best) pick(best);
        if (window.moonTrack) window.moonTrack('Use my location', { page: 'home' });
      }).catch(function () {}).then(function () { loc.removeAttribute('aria-busy'); });
    });
    field.refresh = hintNow;
    /** Resolve what is typed: the picked city, else the best match, else null (use this device's time zone). */
    field.resolve = function () {
      var v = inp.value.trim();
      if (!v) { field.place = null; return Promise.resolve(null); }
      if (field.place && v === label(field.place)) return Promise.resolve(field.place);
      return load().then(function () { var hit = search(v)[0] || null; if (hit) pick(hit); return hit; });
    };
    hintNow();
    return field;
  }

  window.MoonPlaces = { load: load, search: search, zIn: zIn, tzOffset: tzOffset, zoneName: zoneName, label: label, fmtZ: fmtZ, myTz: MY_TZ, bind: bind };
})();
