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
  function zOf(y, mo, d, h, mi) {   // the visitor's UTC offset on that date, in minutes
    var dt = new Date(2000, mo - 1, d, h == null ? 12 : h, mi || 0); dt.setFullYear(y);
    return -dt.getTimezoneOffset();
  }
  function fmtZ(z) { var a = Math.abs(z); return (z < 0 ? '-' : '+') + p2(Math.floor(a / 60)) + p2(a % 60); }
  function parseZ(s) { var m = /^([+-])(\d{2}):?(\d{2})$/.exec((s || '').replace(' ', '+')); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : null; }

  function ymd(n) { return n.y + '-' + p2(n.mo) + '-' + p2(n.d); }
  function rest(n) { return (n.h != null ? 't=' + p2(n.h) + p2(n.mi) + '&' : '') + 'z=' + encodeURIComponent(fmtZ(n.z)) + '&for=' + n.occasion; }
  function query(n) { return 'd=' + ymd(n) + '&' + rest(n); }
  function path(n) { return '/night/' + ymd(n) + '?' + rest(n); }
  function pageUrl(n) { return 'https://moon369.org' + path(n); }
  function cardUrl(n) { return API + '/v1/night.png?' + query(n) + '&fmt=story'; }
  function dateText(n) { return n.d + ' ' + MONTHS[n.mo - 1] + ' ' + n.y; }

  function postText(n, r) {
    var pct = Math.round(r.lit * 100) + '% lit', ph = r.phase;
    var head = {
      born: 'The moon when I was born: ', met: 'The moon the day we met: ', wed: 'The moon on our wedding day: ',
      kid: 'The moon when my child was born: ', day: 'The moon on ' + dateText(n) + ': ',
    }[n.occasion] + ph + ', ' + pct + '.';
    var back = r.eclipse ? '\nAnd there was a ' + r.eclipse + ' solar eclipse that day.' : r.returns ? '\nIt comes back to ' + ANNIV[n.occasion] + ' in ' + r.returns + '.' : '';
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
    $('[data-nt-title]').textContent = TITLES[n.occasion];
    $('[data-nt-date]').textContent = dateText(n).toUpperCase();
    $('[data-nt-sub]').textContent = (n.h != null ? p2(n.h) + ':' + p2(n.mi) + '  ·  ' : '') + r.phase.toUpperCase() + '  ·  ' + Math.round(lit * 100) + '% LIT  ·  ' + r.age.toFixed(1) + ' DAYS OLD';
    $('[data-nt-cycle]').textContent = md.cycle; $('[data-nt-mo]').textContent = p2(md.moon); $('[data-nt-lune]').textContent = p2(md.lune);
    var badge = $('[data-nt-badge]'), who = n.occasion === 'born' ? 'BORN' : n.occasion === 'kid' ? 'BORN' : n.occasion === 'met' ? 'MET' : n.occasion === 'wed' ? 'MARRIED' : '';
    if (who && (r.phase === 'Full moon' || r.phase === 'New moon')) { badge.textContent = who + ' UNDER A ' + r.phase.toUpperCase(); vis(badge, true); } else vis(badge, false);
    $('[data-nt-note]').innerHTML = 'In Moon time that was <a href="/m/' + md.path + '.000000000">Cycle ' + md.cycle + ', Moon ' + p2(md.moon) + ', Lune ' + p2(md.lune) + '</a>.' +
      (r.returns ? ' The moon looks like this on ' + ANNIV[n.occasion] + ' again in <b style="color:#E9E4D8;font-weight:500">' + r.returns + '</b>.' : '') +
      (n.h == null ? ' No time given, so this is the moon at midday.' : '');
    $('[data-nt-x]').href = 'https://x.com/intent/post?text=' + encodeURIComponent(postText(n, r)) + '&url=' + encodeURIComponent(pageUrl(n));
    var img = $('[data-nt-card]'); img.src = cardUrl(n); img.alt = TITLES[n.occasion].toLowerCase() + ', ' + dateText(n) + ': ' + r.phase + ', ' + Math.round(lit * 100) + '% lit';
    vis($('[data-nt-cardwrap]'), true); vis($('[data-nt-again]'), true);
    vis(res, true);
    try { history.replaceState(null, '', path(n)); } catch (e) {}
    document.title = TITLES[n.occasion].charAt(0) + TITLES[n.occasion].slice(1).toLowerCase() + ' · ' + dateText(n) + ' · Moon';
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
        $('[data-nt-x]').href = 'https://x.com/intent/post?text=' + encodeURIComponent(postText(n, current.r)) + '&url=' + encodeURIComponent(pageUrl(n));
        if (ecCv) { ecCv.setAttribute('data-type', e.type); ecCv.setAttribute('aria-label', 'A ' + e.type + ' solar eclipse'); vis(moonCv, false); vis(ecCv, true); }
        ecl.querySelector('b').textContent = 'A ' + e.type.toUpperCase() + ' SOLAR ECLIPSE THAT DAY';
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
    return { y: y, mo: +m[2], d: +m[3], h: h, mi: mi, z: zOf(y, +m[2], +m[3], h, mi), occasion: occasion };
  }
  function fill(n) {
    $('input[name=d]').value = n.y + '-' + p2(n.mo) + '-' + p2(n.d);
    $('input[name=t]').value = n.h != null ? p2(n.h) + ':' + p2(n.mi) : '';
    setOccasion(n.occasion);
  }
  function fromUrl() {
    var q = new URLSearchParams(location.search), pm = /^\/night\/(\d{4}-\d{2}-\d{2})\/?$/.exec(location.pathname);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pm ? pm[1] : (q.get('d') || ''));
    if (!m || +m[1] < 1000 || +m[1] > 2999 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
    var tm = /^(\d{2}):?(\d{2})$/.exec(q.get('t') || ''), z = parseZ(q.get('z'));
    var h = tm && +tm[1] < 24 && +tm[2] < 60 ? +tm[1] : null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: h, mi: h != null ? +tm[2] : 0, z: z == null ? 0 : z, occasion: TITLES[q.get('for')] ? q.get('for') : 'day' };
  }

  function getCard() {
    var u = cardUrl(current.n);
    if (cardBlob && cardFor === u) return Promise.resolve(cardBlob);
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('card'); return r.blob(); }).then(function (b) { cardBlob = b; cardFor = u; return b; });
  }
  function fileName() { var n = current.n; return 'moon-' + n.y + '-' + p2(n.mo) + '-' + p2(n.d) + '.png'; }
  function save() {
    getCard().then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('IMAGE SAVED');
    }).catch(function () { window.open(cardUrl(current.n), '_blank'); });
  }
  function share() {
    var n = current.n, text = postText(n, current.r), url = pageUrl(n);
    if (!navigator.share) { copy(); return; }
    getCard().then(function (b) {
      var file = new File([b], fileName(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: text + '\n' + url });
      return navigator.share({ text: text, url: url });
    }).catch(function (e) { if (e && e.name === 'AbortError') return; navigator.share({ text: text, url: url }).catch(function () {}); });
  }
  function copy() {
    var url = pageUrl(current.n);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('LINK COPIED'); }, function () { window.prompt('Copy this link', url); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.nt-chip,[data-try],[data-nt-share],[data-nt-save],[data-nt-copy],[data-nt-reset]');
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
    else if (t.hasAttribute('data-nt-reset')) { $('input[name=d]').value = ''; $('input[name=t]').value = ''; $('[data-nt-form]').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { $('input[name=d]').focus({ preventScroll: true }); }, 400); }
  });
  document.addEventListener('submit', function (e) {
    if (!e.target.matches || !e.target.matches('[data-nt-form]')) return;
    e.preventDefault();
    var n = fromForm(); if (n) show(n, true);
  });

  // dc-lite renders the page after load; wait for the form, then open a shared moon if the URL has one.
  (function boot(tries) {
    if (!$('[data-nt-form]') || !window.MoonPhase || document.querySelector('[data-dc-snapshot] [data-nt-form]') === $('[data-nt-form]')) { if (tries < 200) setTimeout(function () { boot(tries + 1); }, 25); return; }
    var n = fromUrl();
    if (n) { $('[data-nt-root]').classList.add('nt-shared'); fill(n); show(n, false); }
  })(0);
})();
