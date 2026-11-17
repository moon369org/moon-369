/* Your Moon (/night): the moon on any date, with a card to share.
   The page state lives in the URL (?d=1990-06-14&t=2130&z=-0700&for=born), so a shared link
   opens straight to the same moon, and its link preview is that moon's card. */
(function () {
  var API = 'https://api.moon369.org';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var TITLES = { day: 'THE MOON ON', born: 'THE MOON WHEN I WAS BORN', met: 'THE MOON WHEN WE MET', wed: 'THE MOON ON OUR WEDDING DAY', kid: 'THE MOON WHEN MY CHILD WAS BORN' };
  var ANNIV = { born: 'my birthday', met: 'the day we met', wed: 'our anniversary', kid: 'their birthday', day: 'this date' };
  var SYNODIC = 29.530588853;
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803;
  var $ = function (s) { return document.querySelector(s); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var an = function (w) { return /^[aeiou]/i.test(w) ? 'an ' : 'a '; };   // an annular eclipse, a total one
  // Shown and hidden with data-off: the page renderer drops plain hidden attributes.
  var vis = function (el, on) { if (on) el.removeAttribute('data-off'); else el.setAttribute('data-off', ''); };
  var occasion = 'born', current = null, cardBlob = null, cardFor = '';

  function isLeap(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
  function msOf(n, y) {
    var dt = new Date(0);
    dt.setUTCFullYear(y == null ? n.y : y, n.mo - 1, n.d);
    dt.setUTCHours(n.h == null ? 12 : n.h, n.h == null ? 0 : n.mi, 0, 0);
    return dt.getTime() - n.z * 60000;
  }
  function label(f) {
    var near = function (x) { return Math.abs(f - x) < 0.034; };
    if (f < 0.034 || f > 0.966) return 'New moon';
    if (near(0.25)) return 'First quarter';
    if (near(0.5)) return 'Full moon';
    if (near(0.75)) return 'Last quarter';
    return (f < 0.5 ? 'Waxing ' : 'Waning ') + (f < 0.25 || f > 0.75 ? 'crescent' : 'gibbous');
  }
  function moonDate(ms) {
    var s = (ms - EPOCH) / SEC, whole = Math.floor(s), da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), first = Math.ceil(mi * 369 / 13), sd = whole - da * 86400;
    return { cycle: y, moon: mi + 1, lune: dy - first + 1, path: y + '.' + p2(mi + 1) + '.' + p2(dy - first + 1) + '-' + p2(Math.floor(sd / 3600)) + '.' + p2(Math.floor(sd % 3600 / 60)) + '.' + p2(sd % 60) };
  }
  function nextReturn(n, f0) {
    var now = Date.now(), start = Math.max(n.y + 1, new Date(now).getUTCFullYear());
    for (var y = start; y < start + 120; y++) {
      if (n.mo === 2 && n.d === 29 && !isLeap(y)) continue;
      var ms = msOf(n, y); if (ms <= now) continue;
      var d = Math.abs(MoonPhase.fraction(ms) - f0) % 1; if (Math.min(d, 1 - d) < 0.04) return y;
    }
    return null;
  }
  function zOf(y, mo, d, h, mi) {   // the UTC offset on that date, in minutes: the chosen place, else this device's time zone
    var tz = place ? place.tz : MY_TZ;
    if (tz) { try { return zIn(tz, y, mo, d, h, mi); } catch (e) {} }
    var dt = new Date(2000, mo - 1, d, h == null ? 12 : h, mi || 0); dt.setFullYear(y);
    return -dt.getTimezoneOffset();
  }
  // ---------- where: a city (or a time zone) sets the UTC offset for that exact date ----------
  var place = null;            // { slug, name, near, tz, label } once picked
  var CITIES = null, citiesP = null;
  var WITH_PROVINCE = { US: 1, CA: 1, AU: 1, MX: 1, BR: 1, IN: 1 };
  function ascii(x) { return x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }
  function fold(x) { return x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function loadCities() {
    if (citiesP) return citiesP;
    citiesP = fetch('/assets/cities.json').then(function (r) { return r.json(); }).then(function (j) {
      var seen = {}, list = [];
      // Slugs follow the same rule and order as the generator (scripts in the API's places.ts header).
      j.r.forEach(function (r) {
        var prov = j.p[r[1]], cc = j.c[r[2]].split('|'), base = ascii(r[0] + ' ' + prov + ' ' + cc[1]);
        var k = (seen[base] || 0) + 1; seen[base] = k;
        // same rule as the card labels (api/src/places.ts): Washington, D.C. stands alone; São Paulo, Brazil, not São Paulo, São Paulo
        var near = r[0].indexOf(',') >= 0 ? '' : WITH_PROVINCE[cc[1]] && prov && fold(prov) !== fold(r[0]) ? prov : cc[0];
        list.push({ slug: k > 1 ? base + '-' + k : base, name: r[0], prov: prov, country: cc[0], near: near, tz: j.z[r[3]], lat: r[4], lng: r[5], key: fold(r[0] + ' ' + prov + ' ' + cc[0]) , nkey: fold(r[0]) });
      });
      try {
        Intl.supportedValuesOf('timeZone').forEach(function (z) {
          var nice = z.replace(/_/g, ' ');
          list.push({ slug: null, name: nice, near: 'Time zone', tz: z, key: fold(nice + ' ' + z), nkey: fold(nice.split('/').pop()) });
        });
      } catch (e) {}
      return (CITIES = list);
    });
    return citiesP;
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
  /** Minutes east of UTC in time zone tz at instant ms (from the time zone database, so history is right). */
  function tzOffset(tz, ms) {
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var y = +p.year; if (p.era === 'BC' || p.era === 'B') y = 1 - y;
    var d = new Date(0); d.setUTCFullYear(y, +p.month - 1, +p.day); d.setUTCHours(+p.hour % 24, +p.minute, +p.second, 0);
    return Math.round((d.getTime() - Math.floor(ms / 1000) * 1000) / 60000);
  }
  /** The UTC offset for a wall-clock time in tz on that date, daylight saving included. */
  function zIn(tz, y, mo, d, h, mi) {
    var g = new Date(0); g.setUTCFullYear(y, mo - 1, d); g.setUTCHours(h == null ? 12 : h, h == null ? 0 : mi, 0, 0);
    var o1 = tzOffset(tz, g.getTime()), o2 = tzOffset(tz, g.getTime() - o1 * 60000);
    return o2;
  }
  function zoneName(tz, ms) {
    var nm = function (style) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(new Date(ms)).filter(function (x) { return x.type === 'timeZoneName'; })[0].value; };
    try { var v = nm('long'); if (/^GMT/.test(v)) { try { v = nm('longGeneric'); } catch (e) {} } return /^GMT/.test(v) ? tz.replace(/_/g, ' ') : v; } catch (e) { return tz; }
  }
  var MY_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })();
  function fmtZ(z) { var a = Math.abs(z); return (z < 0 ? '-' : '+') + p2(Math.floor(a / 60)) + p2(a % 60); }
  function parseZ(s) { var m = /^([+-])(\d{2}):?(\d{2})$/.exec((s || '').replace(' ', '+')); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : null; }

  function ymd(n) { return n.y + '-' + p2(n.mo) + '-' + p2(n.d); }
  function rest(n) { return (n.h != null ? 't=' + p2(n.h) + p2(n.mi) + '&' : '') + 'z=' + encodeURIComponent(fmtZ(n.z)) + '&for=' + n.occasion + (n.place ? '&in=' + n.place.slug : '') + (n.caption ? '&c=' + encodeURIComponent(n.caption) : ''); }
  function query(n) { return 'd=' + ymd(n) + '&' + rest(n); }
  function path(n) { return '/night/' + ymd(n) + '?' + rest(n); }
  function pageUrl(n) { return 'https://moon369.org' + path(n); }
  function cardUrl(n) { return API + '/v1/night.png?' + query(n).replace(/&c=[^&]*/, '').replace(/&for=\w+/, n.caption ? '&for=none' : '&for=' + n.occasion) + '&fmt=story&v=2'; }   // v: bump when the card art changes
  function dateText(n) { return n.d + ' ' + MONTHS[n.mo - 1] + ' ' + n.y; }

  function postText(n, r) {
    var pct = Math.round(r.lit * 100) + '% lit', ph = r.phase;
    var head = {
      born: 'The moon when I was born: ', met: 'The moon the day we met: ', wed: 'The moon on our wedding day: ',
      kid: 'The moon when my child was born: ', day: 'The moon on ' + dateText(n) + ': ',
    }[n.occasion]; if (n.caption) head = n.caption + ': '; head = head.replace(/: $/, n.place ? ' in ' + n.place.name + ': ' : ': ') + ph + ', ' + pct + '.';
    var future = msOf(n) > Date.now();
    var back = r.eclipse ? '\nAnd there ' + (future ? 'will be ' : 'was ') + an(r.eclipse) + r.eclipse + ' solar eclipse that day.' : r.returns ? '\nIt comes back to ' + ANNIV[n.occasion] + ' in ' + r.returns + '.' : '';
    return head + back + '\n\nWhat did yours look like?';
  }

  function toast(t) { var e = $('[data-nt-toast]'); if (!e) return; e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('on'); }, 1800); }

  function show(n, scroll) {
    var ms = msOf(n), f = MoonPhase.fraction(ms), lit = MoonPhase.illumination(ms), md = moonDate(ms);
    var r = { phase: label(f), lit: lit, age: f * SYNODIC, returns: nextReturn(n, f) };
    current = { n: n, r: r }; cardBlob = null;
    var res = $('[data-nt-res]');
    $('[data-nt-canvas]').setAttribute('data-at', String(ms));
    $('[data-nt-canvas]').setAttribute('aria-label', r.phase + ', ' + Math.round(lit * 100) + '% lit');
    $('[data-nt-title]').textContent = titleOf(n);
    $('[data-nt-date]').textContent = dateText(n).toUpperCase();
    drawSky(n, ms, f);
    var pl = $('[data-nt-place]'); if (pl) { pl.textContent = n.place ? 'IN ' + whereText(n.place).toUpperCase() : ''; vis(pl, !!n.place); }
    $('[data-nt-sub]').textContent = (n.h != null ? p2(n.h) + ':' + p2(n.mi) + '  ·  ' : '') + r.phase.toUpperCase() + '  ·  ' + Math.round(lit * 100) + '% LIT  ·  ' + r.age.toFixed(1) + ' DAYS OLD';
    $('[data-nt-cycle]').textContent = md.cycle; $('[data-nt-mo]').textContent = p2(md.moon); $('[data-nt-lune]').textContent = p2(md.lune);
    var badge = $('[data-nt-badge]'), who = n.occasion === 'born' ? 'BORN' : n.occasion === 'kid' ? 'BORN' : n.occasion === 'met' ? 'MET' : n.occasion === 'wed' ? 'MARRIED' : '';
    if (who && (r.phase === 'Full moon' || r.phase === 'New moon')) { badge.textContent = who + ' UNDER A ' + r.phase.toUpperCase(); vis(badge, true); } else vis(badge, false);
    $('[data-nt-note]').innerHTML = 'In Moon time that ' + (ms > Date.now() ? 'will be' : 'was') + ' <a href="/m/' + md.path + '.000000000">Cycle ' + md.cycle + ', Moon ' + p2(md.moon) + ', Lune ' + p2(md.lune) + '</a>.' +
      (r.returns ? ' The moon looks like this on ' + ANNIV[n.occasion] + ' again in <b style="color:#E9E4D8;font-weight:500">' + r.returns + '</b>.' : '') +
      (n.h == null ? ' No time given, so this is the moon at midday.' : '');
    $('[data-nt-x]').href = 'https://x.com/intent/post?text=' + encodeURIComponent(postText(n, r)) + '&url=' + encodeURIComponent(pageUrl(n));
    var img = $('[data-nt-card]'); img.src = cardUrl(n);
    if (n.caption) setTimeout(function () { getCard().then(function (b) { if (current && current.n === n) img.src = URL.createObjectURL(b); }).catch(function () {}); }, 0); img.alt = titleOf(n).toLowerCase() + ', ' + dateText(n) + ': ' + r.phase + ', ' + Math.round(lit * 100) + '% lit';
    vis($('[data-nt-cardwrap]'), true); vis($('[data-nt-again]'), true);
    vis(res, true);
    try { history.replaceState(null, '', path(n)); } catch (e) {}
    document.title = titleOf(n).charAt(0) + titleOf(n).slice(1).toLowerCase() + ' · ' + dateText(n) + ' · Moon';
    var ecl = $('[data-nt-eclipse]'), moonCv = $('[data-nt-canvas]'), ecCv = $('[data-nt-ecanvas]');
    if (ecCv) { vis(moonCv, true); vis(ecCv, false); }
    if (ecl) {
      vis(ecl, false);
      var ed = ymd(n), seq = (current.seq = (current.seq || 0) + 1);
      fetch(API + '/v1/eclipses/' + ed).then(function (r) { return r.ok ? r.json() : null; }).then(function (e) {
        if (!e || current.n !== n) return;
        ecl.href = '/eclipse/' + e.date;
        ecl.querySelector('canvas').setAttribute('data-type', e.type);
        // On an eclipse day the moon you'd have seen was the eclipse itself.
        current.r.eclipse = e.type;
        var stx = $('[data-nt-sky-text]');   // on an eclipse day the moon was not lost in the glare: it crossed the sun
        if (stx && stx.getAttribute('data-glare')) stx.textContent = stx.textContent.replace(stx.getAttribute('data-glare'), stx.getAttribute('data-crossed') + ' ' + an(e.type) + e.type + ' solar eclipse.');
        $('[data-nt-x]').href = 'https://x.com/intent/post?text=' + encodeURIComponent(postText(n, current.r)) + '&url=' + encodeURIComponent(pageUrl(n));
        if (ecCv) { ecCv.setAttribute('data-type', e.type); ecCv.setAttribute('aria-label', an(e.type).replace('a', 'A') + e.type + ' solar eclipse'); vis(moonCv, false); vis(ecCv, true); }
        ecl.querySelector('b').textContent = (an(e.type) + e.type + ' solar eclipse that day').toUpperCase();
        vis(ecl, true);
      }).catch(function () {});
    }
    if (scroll) setTimeout(function () { res.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }, 60);
  }

  function setOccasion(o) {
    occasion = TITLES[o] ? o : 'day';
    document.querySelectorAll('.nt-chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-for') === occasion)); });
  }
  function fromForm() {
    var dv = $('input[name=d]').value, tv = $('input[name=t]').value, err = $('[data-nt-err]');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dv);
    if (!m) { err.textContent = 'Pick a date first.'; $('input[name=d]').focus(); return null; }
    var y = +m[1]; if (y < 1000 || y > 2999) { err.textContent = 'Pick a date between the years 1000 and 2999.'; return null; }
    err.textContent = '';
    var tm = /^(\d{2}):(\d{2})/.exec(tv), h = tm ? +tm[1] : null, mi = tm ? +tm[2] : 0;
    var wv = $('input[name=where]').value.trim();
    if (wv && (!place || wv !== whereText(place))) {
      var hit = search(wv)[0];
      if (!hit) { err.textContent = 'Pick a place from the list, or leave it empty to use your time zone.'; $('input[name=where]').focus(); return null; }
      pick(hit);
    }
    if (!wv) place = null;
    return { y: y, mo: +m[2], d: +m[3], h: h, mi: mi, z: zOf(y, +m[2], +m[3], h, mi), occasion: occasion, place: place && place.slug ? place : null, caption: cleanCap(($('[data-nt-caption]') || {}).value) };
  }
  function fill(n) {
    var cap = $('[data-nt-caption]'); if (cap) cap.value = n.caption || '';
    $('input[name=d]').value = n.y + '-' + p2(n.mo) + '-' + p2(n.d);
    $('input[name=t]').value = n.h != null ? p2(n.h) + ':' + p2(n.mi) : '';
    setOccasion(n.occasion);
    if (n.place) { place = n.place; $('input[name=where]').value = whereText(n.place); }
    tzHint();
  }
  function fromUrl() {
    var q = new URLSearchParams(location.search), pm = /^\/night\/(\d{4}-\d{2}-\d{2})\/?$/.exec(location.pathname);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pm ? pm[1] : (q.get('d') || ''));
    if (!m || +m[1] < 1000 || +m[1] > 2999 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
    var tm = /^(\d{2}):?(\d{2})$/.exec(q.get('t') || ''), z = parseZ(q.get('z'));
    var h = tm && +tm[1] < 24 && +tm[2] < 60 ? +tm[1] : null;
    var slug = /^[a-z0-9-]{1,120}$/.test(q.get('in') || '') ? q.get('in') : null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: h, mi: h != null ? +tm[2] : 0, z: z == null ? 0 : z, occasion: TITLES[q.get('for')] ? q.get('for') : 'day', slug: slug, caption: cleanCap(q.get('c')) };
  }

  function cleanCap(x) { x = String(x || '').replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim(); return x ? x.slice(0, 44) : ''; }
  function titleOf(n) { return n.caption ? n.caption.toUpperCase() : TITLES[n.occasion]; }
  // Your own words go on the card here, on this device: Moon's servers only ever draw the fixed headlines.
  function withCaption(b, n) {
    if (!n.caption) return Promise.resolve(b);
    return (window.createImageBitmap ? createImageBitmap(b) : Promise.reject()).then(function (bmp) {
      var cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
      var c = cv.getContext('2d'); c.drawImage(bmp, 0, 0);
      var k = bmp.width / 1080, txt = n.caption.toUpperCase(), fs = 24 * k;
      c.fillStyle = '#8A8B8F'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.font = fs + 'px "JetBrains Mono", monospace';
      try { c.letterSpacing = (6 * k) + 'px'; } catch (e) {}
      while (c.measureText(txt).width > 960 * k && fs > 14 * k) { fs -= k; c.font = fs + 'px "JetBrains Mono", monospace'; }
      c.fillText(txt, bmp.width / 2, 230 * k);
      return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
    }).catch(function () { return b; });
  }
  function getCard() {
    var u = cardUrl(current.n);
    var n = current.n, key = u + '|' + (n.caption || '');
    if (cardBlob && cardFor === key) return Promise.resolve(cardBlob);
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('card'); return r.blob(); }).then(function (b) { return withCaption(b, n); }).then(function (b) { cardBlob = b; cardFor = key; return b; });
  }
  function fileName() { var n = current.n; return 'moon-' + n.y + '-' + p2(n.mo) + '-' + p2(n.d) + '.png'; }
  function save() {
    if (window.moonTrack) window.moonTrack('Share', { page: 'night', via: 'save image' });
    getCard().then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('IMAGE SAVED');
    }).catch(function () { window.open(cardUrl(current.n), '_blank'); });
  }
  function share() {
    var n = current.n, text = postText(n, current.r), url = pageUrl(n);
    if (window.moonTrack) window.moonTrack('Share', { page: 'night', via: 'share' });
    if (!navigator.share) { copy(); return; }
    getCard().then(function (b) {
      var file = new File([b], fileName(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: text + '\n' + url });
      return navigator.share({ text: text, url: url });
    }).catch(function (e) { if (e && e.name === 'AbortError') return; navigator.share({ text: text, url: url }).catch(function () {}); });
  }
  function copy() {
    if (window.moonTrack) window.moonTrack('Share', { page: 'night', via: 'copy link' });
    var url = pageUrl(current.n);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('LINK COPIED'); }, function () { window.prompt('Copy this link', url); });
  }

  // Embed: the card as an image that links back to this moon, for a blog, a wedding site or a newsletter.
  function embed() {
    if (window.moonTrack) window.moonTrack('Share', { page: 'night', via: 'embed' });
    var n = current.n, url = pageUrl(n), img = API + '/v1/night.png?' + query(n) + '&v=2';
    var code = '<a href="' + url + '" target="_blank" rel="noopener"><img src="' + img + '" width="600" height="315" alt="The moon that night, on Moon" loading="lazy" style="max-width:100%;height:auto"></a>';
    (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { toast('EMBED CODE COPIED'); }, function () { window.prompt('Copy this embed code', code); });
  }

  // ---------- the moon's path across that local day ----------
  function localClock(tz) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return function (ms) { return f.format(new Date(ms)); };
  }
  function midnight(tz, y, mo, d) {   // UTC ms of local 00:00 on that date
    var z = zIn(tz, y, mo, d, 0, 0), g = new Date(0); g.setUTCFullYear(y, mo - 1, d); g.setUTCHours(0, 0, 0, 0);
    return g.getTime() - z * 60000;
  }
  function drawSky(n, ms, f) {
    var box = $('[data-nt-sky]'), ask = $('[data-nt-sky-ask]');
    if (!box || !window.MoonSky) return;
    var p = n.place && n.place.lat != null ? n.place : null;
    vis(ask, !p); vis(box, !!p);
    if (!p) return;
    var nx = new Date(0); nx.setUTCFullYear(n.y, n.mo - 1, n.d + 1);
    var t0 = midnight(p.tz, n.y, n.mo, n.d), t1 = midnight(p.tz, nx.getUTCFullYear(), nx.getUTCMonth() + 1, nx.getUTCDate());
    var sky = MoonSky.day(t0, t1, p.lat, p.lng), clock = localClock(p.tz), fut = t0 > Date.now();
    var past = function (pastWord, futWord) { return fut ? futWord : pastWord; };
    $('[data-nt-sky-k]').textContent = 'THE MOON’S PATH · ' + p.name.toUpperCase() + ' · LOCAL TIME · LOOKING ' + (p.lat >= 0 ? 'SOUTH' : 'NORTH');
    var notes = [];
    if (sky.always === 'up') notes.push('The moon ' + past('stayed', 'stays') + ' up all day and all night.');
    if (sky.always === 'down') notes.push('The moon ' + past('never rose', 'will not rise') + ' that day.');
    if (f <= 0.04 || f >= 0.96) notes.push('<glare>');
    var glare = 'Near new moon it rides with the sun, so it ' + past('was', 'will be') + ' lost in the glare.';
    var tx = $('[data-nt-sky-text]');
    tx.setAttribute('data-glare', glare);
    tx.setAttribute('data-crossed', 'That day it ' + past('crossed', 'will cross') + ' in front of the sun:');
    var setNotes = function (extra) { tx.textContent = notes.concat(extra ? [extra] : []).join(' ').replace('<glare>', current && current.r && current.r.eclipse ? tx.getAttribute('data-crossed') + ' ' + an(current.r.eclipse) + current.r.eclipse + ' solar eclipse.' : glare); vis(tx, !!tx.textContent); };
    // The headline follows the slider: where was the moon at that moment?
    var chosen = n.h != null ? ms : null;
    if (box.__sky) box.__sky.stop();
    // Hold the headline at the height of the longest one it can show, so the page never jumps while the slider moves.
    var hEl = $('[data-nt-sky-h]');
    var holdHeight = function () {
      var keep = hEl.textContent, most = 0;
      hEl.style.minHeight = '';
      ['At 00:00 the moon will be below the horizon.', 'At 00:00 the moon will be 88\u00b0 up in the west-southwest.'].forEach(function (x) { hEl.textContent = x; most = Math.max(most, hEl.offsetHeight); });
      hEl.textContent = keep; hEl.style.minHeight = most + 'px';
    };
    if (!box.__holdBound) { box.__holdBound = true; var lastW = 0; window.addEventListener('resize', function () { if (window.innerWidth !== lastW) { lastW = window.innerWidth; holdHeight(); } }); }
    box.__sky = MoonSky.mount($('[data-nt-sky-chart]'), {
      sky: sky, t0: t0, t1: t1, lat: p.lat, lng: p.lng, at: chosen, f: f, clock: clock,
      dayTag: function (t) { return t < t0 ? ' · day before' : t >= t1 ? ' · next day' : ''; },
      onTime: function (t, m) {
        var w = t > Date.now() ? 'will be' : 'was', when = clock(t);   // "next day" lives in the time line under the sky, so this stays short
        $('[data-nt-sky-h]').textContent = m.alt > -0.27
          ? 'At ' + when + ' the moon ' + w + ' ' + Math.max(0, Math.round(m.alt)) + '° up in the ' + MoonSky.compass(m.az) + '.'
          : 'At ' + when + ' the moon ' + w + ' below the horizon.';
        var sunUp = MoonSky.sunAlt(t, p.lat, p.lng) > -0.83, phase = window.MoonPhase ? MoonPhase.fraction(t) : f;
        setNotes(m.alt > -0.27 && phase > 0.04 && phase < 0.96 ? (sunUp ? 'It ' + w + ' daytime, so look for a pale moon in a blue sky.' : 'In a dark sky it ' + w + ' easy to see.') : '');
      },
    });
    holdHeight();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(holdHeight);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-nt-addplace]'); if (!b) return;
    var w = $('input[name=where]'); $('[data-nt-form]').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { w.focus({ preventScroll: true }); }, 350);
  });
  function whereText(p) { return p.slug && p.near ? p.name + ', ' + p.near : p.name; }
  function tzHint() {
    var h = $('[data-nt-tz]'); if (!h) return;
    var tz = place ? place.tz : MY_TZ; if (!tz) { h.textContent = ''; return; }
    var dv = /^(\d{4})-(\d{2})-(\d{2})$/.exec($('input[name=d]').value), ms = Date.now();
    if (dv) { var t = /^(\d{2}):(\d{2})/.exec($('input[name=t]').value), z = zIn(tz, +dv[1], +dv[2], +dv[3], t ? +t[1] : null, t ? +t[2] : 0); ms = Date.UTC(2000, 0, 1); ms = (function () { var g = new Date(0); g.setUTCFullYear(+dv[1], +dv[2] - 1, +dv[3]); g.setUTCHours(t ? +t[1] : 12, t ? +t[2] : 0); return g.getTime() - z * 60000; })(); }
    h.textContent = (place ? '' : 'Your time zone: ') + zoneName(tz, ms) + ' (UTC' + fmtZ(tzOffset(tz, ms)).replace(/(\d\d)$/, ':$1') + (dv ? ' that day' : '') + ')';
  }
  function pick(p) {
    place = p; var inp = $('input[name=where]'); inp.value = whereText(p);
    closeList(); tzHint();
    if (current && $('input[name=d]').value) { var n1 = fromForm(); if (n1) show(n1, false); }   // a moon is showing: redraw it for the new place
  }
  var opts = [], active = -1;
  function closeList() { var l = $('[data-nt-list]'); if (l) { vis(l, false); l.innerHTML = ''; } $('input[name=where]').setAttribute('aria-expanded', 'false'); active = -1; }
  function openList(items) {
    var l = $('[data-nt-list]'), inp = $('input[name=where]'); opts = items; active = -1;
    if (!items.length) { closeList(); return; }
    l.innerHTML = items.map(function (p, i) {
      return '<li role="option" id="nt-opt-' + i + '" data-i="' + i + '"><b>' + p.name.replace(/</g, '&lt;') + '</b><span>' + (p.slug ? [p.prov !== p.name ? p.prov : '', p.country].filter(Boolean).join(', ') : 'Time zone') + '</span></li>';
    }).join('');
    vis(l, true); inp.setAttribute('aria-expanded', 'true');
  }
  function setActive(i) {
    var l = $('[data-nt-list]'); active = (i + opts.length) % opts.length;
    Array.prototype.forEach.call(l.children, function (li, k) { li.setAttribute('aria-selected', String(k === active)); });
    $('input[name=where]').setAttribute('aria-activedescendant', 'nt-opt-' + active);
  }
  (function noSpell() { var w = $('input[name=where]'); if (w) w.spellcheck = false; else setTimeout(noSpell, 50); })();   // the renderer turns spellcheck="false" into true
  document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input[name=where]')) loadCities(); });
  document.addEventListener('input', function (e) {
    if (!e.target.matches) return;
    if (e.target.matches('input[name=d],input[name=t]')) { tzHint(); return; }
    if (!e.target.matches('input[name=where]')) return;
    var v = e.target.value;
    if (!v.trim()) { place = null; closeList(); tzHint(); return; }
    loadCities().then(function () { if (e.target.value === v) openList(search(v)); });
  });
  document.addEventListener('keydown', function (e) {
    if (!e.target.matches || !e.target.matches('input[name=where]') || !opts.length || $('[data-nt-list]').hasAttribute('data-off')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(opts[active]); }
    else if (e.key === 'Escape') closeList();
  });
  document.addEventListener('mousedown', function (e) {
    var li = e.target.closest && e.target.closest('[data-nt-list] li');
    if (li) { e.preventDefault(); pick(opts[+li.getAttribute('data-i')]); return; }
    if (!(e.target.closest && e.target.closest('.nt-combo'))) closeList();
  });
  document.addEventListener('click', function (e) {
    var loc = e.target.closest && e.target.closest('[data-nt-locate]');
    if (!loc) return;
    if (!navigator.geolocation) { toast('LOCATION IS NOT AVAILABLE HERE'); return; }
    if (window.moonTrack) window.moonTrack('Use my location', { page: 'night' });
    loc.setAttribute('aria-busy', 'true');
    Promise.all([loadCities(), new Promise(function (ok, no) { navigator.geolocation.getCurrentPosition(ok, no, { timeout: 10000, maximumAge: 600000 }); })]).then(function (a) {
      var la = a[1].coords.latitude, lo = a[1].coords.longitude, k = Math.cos(la * Math.PI / 180), best = null, bd = 1e9;
      CITIES.forEach(function (c) { if (!c.slug) return; var dx = (c.lng - lo) * k, dy = c.lat - la, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } });
      if (best) pick(best);
    }).catch(function () { toast('COULD NOT GET YOUR LOCATION'); }).then(function () { loc.removeAttribute('aria-busy'); });
  });

  document.addEventListener('click', function (e) {
    var xl = e.target.closest && e.target.closest('[data-nt-x]'); if (xl) if (window.moonTrack) window.moonTrack('Share', { page: 'night', via: 'x' });
    var t = e.target.closest && e.target.closest('.nt-chip,[data-try],[data-nt-share],[data-nt-save],[data-nt-copy],[data-nt-embed],[data-nt-reset]');
    if (!t) return;
    if (t.classList.contains('nt-chip')) { setOccasion(t.getAttribute('data-for')); if (current && $('input[name=d]').value) { var n0 = fromForm(); if (n0) show(n0, false); } return; }
    if (t.hasAttribute('data-try')) {
      var v = t.getAttribute('data-try'), n;
      if (v === 'today') { var d = new Date(); n = { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), z: -d.getTimezoneOffset(), occasion: 'day' }; }
      else { var a = v.split('|'), dm = a[0].split('-'), tm = a[1] ? a[1].split(':') : null; n = { y: +dm[0], mo: +dm[1], d: +dm[2], h: tm ? +tm[0] : null, mi: tm ? +tm[1] : 0, occasion: a[3] }; n.z = a[2] ? parseZ(a[2]) : zOf(n.y, n.mo, n.d, n.h, n.mi); }
      fill(n); show(n, true); return;
    }
    if (!current) return;
    if (t.hasAttribute('data-nt-share')) share();
    else if (t.hasAttribute('data-nt-save')) save();
    else if (t.hasAttribute('data-nt-copy')) copy();
    else if (t.hasAttribute('data-nt-embed')) embed();
    else if (t.hasAttribute('data-nt-reset')) { $('input[name=d]').value = ''; $('input[name=t]').value = ''; $('[data-nt-form]').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { $('input[name=d]').focus({ preventScroll: true }); }, 400); }
  });
  document.addEventListener('submit', function (e) {
    if (!e.target.matches || !e.target.matches('[data-nt-form]')) return;
    e.preventDefault();
    var n = fromForm(); if (n) { show(n, true); if (window.moonTrack) window.moonTrack('Your Moon', { from: 'night', occasion: n.occasion, place: n.place ? 'yes' : 'no', time: n.h != null ? 'yes' : 'no' }); }
  });

  // dc-lite renders the page after load; wait for the form, then open a shared moon if the URL has one.
  (function boot(tries) {
    if (!$('[data-nt-form]') || !window.MoonPhase || document.querySelector('[data-dc-snapshot] [data-nt-form]') === $('[data-nt-form]')) { if (tries < 200) setTimeout(function () { boot(tries + 1); }, 25); return; }
    var n = fromUrl();
    if (n) {
      $('[data-nt-root]').classList.add('nt-shared'); fill(n); show(n, false);
      // Counted here, not on the homepage, so the event is not lost as the page changes.
      var ref = document.referrer, home = false;
      try { var u = new URL(ref); home = u.host === location.host && /^\/(index\.html)?$/.test(u.pathname); } catch (e) {}
      if (window.moonTrack) window.moonTrack(home ? 'Your Moon' : 'Your Moon opened from a link', home
        ? { from: 'home', occasion: n.occasion, place: n.slug ? 'yes' : 'no', time: n.h != null ? 'yes' : 'no' }
        : { occasion: n.occasion, place: n.slug ? 'yes' : 'no' });
      if (n.slug) loadCities().then(function () {
        var hit = CITIES.filter(function (c) { return c.slug === n.slug; })[0];
        if (hit && current && current.n === n) { n.place = hit; fill(n); show(n, false); }
      }).catch(function () {});
    }
    tzHint();
  })(0);
})();
