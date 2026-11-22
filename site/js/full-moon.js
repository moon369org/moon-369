/* Full moon tracker (/full-moon): a live countdown to the next full moon, its exact Moonmark and UTC
   time, and every full moon in any month. Times come from the Moon API (/v1/full-moons). */
(function () {
  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://api.moon369.org';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var T = function (x, v) { return window.MoonT ? MoonT(x, v) : x.replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? v[k] : m; }); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function lang() { var l = window.MoonI18n && MoonI18n.lang; if (!l) { try { l = localStorage.getItem('moonLang'); } catch (e) {} } return l && l !== 'en' ? (l === 'pt' ? 'pt-PT' : l) : undefined; }
  function get(path) { return fetch(API + path).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status); return j; }); }); }
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  function local(ms, opts) { try { return new Intl.DateTimeFormat(lang(), opts).format(ms); } catch (e) { return new Date(ms).toString(); } }
  function longLocal(ms) { return local(ms, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }); }
  function utcText(f) { return f.utc.replace('T', ' ').replace('Z', ' UTC'); }
  function mmPath(mm) { return mm.replace(' ', '-').replace(/:/g, '.'); }

  function ics(f) {
    var d = new Date(f.unix_ms), z = function (x) { return x.getUTCFullYear() + p2(x.getUTCMonth() + 1) + p2(x.getUTCDate()) + 'T' + p2(x.getUTCHours()) + p2(x.getUTCMinutes()) + p2(x.getUTCSeconds()) + 'Z'; };
    var end = new Date(f.unix_ms + 60000), title = f.supermoon ? T('Full moon (supermoon)') : T('Full moon');
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moon//Full moon//EN', 'BEGIN:VEVENT', 'UID:full-moon-' + f.lunation + '@moon369.org', 'DTSTAMP:' + z(new Date()),
      'DTSTART:' + z(d), 'DTEND:' + z(end), 'SUMMARY:' + title, 'DESCRIPTION:Moonmark ' + f.moonmark + ' · ' + utcText(f) + '\\nhttps://moon369.org/full-moon',
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + title, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' })); a.download = 'full-moon-' + f.utc.slice(0, 10) + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function facts(f) {
    return '<div><span>' + esc(T('MOONMARK')) + '</span><b><a href="/m/' + esc(mmPath(f.moonmark)) + '">' + esc(f.moonmark) + '</a></b></div>' +
      '<div><span>' + esc(T('UTC')) + '</span><b>' + esc(utcText(f)) + '</b></div>' +
      '<div><span>' + esc(T('YOUR TIME')) + '</span><b>' + esc(longLocal(f.unix_ms)) + '</b></div>' +
      '<div><span>' + esc(T('LIT NOW')) + '</span><b data-fm-litnow>' + litNow() + '</b></div>' +
      '<div><span>' + esc(T('LIT AT FULL MOON')) + '</span><b>' + f.illumination.toFixed(3) + '%</b></div>' +
      '<div><span>' + esc(T('DISTANCE')) + '</span><b>' + esc(f.distance_km.toLocaleString(lang())) + ' km' + (f.supermoon ? ' · ' + esc(T('SUPERMOON')) : '') + '</b></div>';
  }

  // Lit now, from the same formula the API uses (MoonPhase.illumination matches /v1 to the digit).
  function litNow() { return window.MoonPhase ? (MoonPhase.illumination(Date.now()) * 100).toFixed(3) + '%' : '…'; }

  // The next full moon, with a live countdown.
  var next = null, tick = null;
  function drawNext(f) {
    next = f;
    var cv = $('[data-fm-cv]'); if (cv) { cv.setAttribute('data-at', String(f.unix_ms)); cv.__moonKey = null; }
    $('[data-fm-when]').textContent = local(f.unix_ms, { weekday: 'long', month: 'long', day: 'numeric' });
    $('[data-fm-tag]').hidden = !f.supermoon;
    $('[data-fm-facts]').innerHTML = facts(f);
    if (tick) clearInterval(tick); count(); tick = setInterval(count, 1000);
  }
  function count() {
    if (!next) return;
    var s = Math.max(0, Math.round((next.unix_ms - Date.now()) / 1000));
    if (s === 0) { clearInterval(tick); setTimeout(loadNext, 5000); }
    var parts = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    var ln = $('[data-fm-litnow]'); if (ln) ln.textContent = litNow();
    document.querySelectorAll('[data-fm-n]').forEach(function (el, i) { el.textContent = i ? p2(parts[i]) : String(parts[0]); });
    $('[data-fm-cd]').setAttribute('aria-label', T('{d} days, {h} hours, {m} minutes until the full moon', { d: parts[0], h: parts[1], m: parts[2] }));
  }
  function loadNext() {
    get('/v1/full-moons/next?count=13').then(function (j) { drawNext(j.full_moons[0]); drawList($('[data-fm-coming]'), j.full_moons.slice(1)); })
      .catch(function () { $('[data-fm-facts]').innerHTML = '<div><span>' + esc(T('OFFLINE')) + '</span><b>' + esc(T('Could not reach the Moon API. Try again in a moment.')) + '</b></div>'; });
  }

  function row(f) {
    return '<li class="fm-row"><div class="fm-rd"><b>' + esc(local(f.unix_ms, { month: 'long', day: 'numeric', year: 'numeric' })) + '</b>' + (f.supermoon ? '<em>' + esc(T('SUPERMOON')) + '</em>' : '') +
      '<span>' + esc(local(f.unix_ms, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })) + ' · ' + esc(T('{p}% lit', { p: f.illumination.toFixed(2) })) + '</span></div>' +
      '<div class="fm-rm"><a href="/m/' + esc(mmPath(f.moonmark)) + '">' + esc(f.moonmark) + '</a><span>' + esc(utcText(f)) + '</span></div>' +
      '<button type="button" class="fm-ics" data-fm-ics="' + f.lunation + '" aria-label="' + esc(T('Add to calendar')) + '">+ ' + esc(T('CALENDAR')) + '</button></li>';
  }
  var known = {};
  function drawList(el, list) {
    list.forEach(function (f) { known[f.lunation] = f; });
    el.innerHTML = list.length ? list.map(row).join('') : '<li class="fm-none">' + esc(T('No full moon falls in this month.')) + '</li>';
  }

  // Any month.
  function monthOf(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1); }
  function shift(v, n) { var y = +v.slice(0, v.length - 3), m = +v.slice(-2) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + p2(m + 1); }
  function loadMonth(v, push) {
    var inp = $('[data-fm-month]'), out = $('[data-fm-mlist]'), msg = $('[data-fm-mmsg]');
    if (!/^-?\d{1,4}-\d{2}$/.test(v)) return;
    inp.value = v; msg.textContent = '';
    var d = new Date(0); d.setUTCFullYear(+v.slice(0, v.length - 3), +v.slice(-2) - 1, 15);
    $('[data-fm-mname]').textContent = local(d.getTime(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (push) { try { history.replaceState(null, '', '?month=' + v); } catch (e) {} }
    get('/v1/full-moons?month=' + v).then(function (j) {
      drawList(out, j.full_moons);
      if (j.full_moons.length > 1) msg.textContent = T('Two full moons this month. The second is often called a blue moon.');
    }).catch(function (e) { out.innerHTML = ''; msg.textContent = e.message; });
  }

  function start() {
    loadNext();
    var q = new URLSearchParams(location.search).get('month');
    loadMonth(q && /^-?\d{1,4}-\d{2}$/.test(q) ? q : monthOf(Date.now()));
    $('[data-fm-month]').addEventListener('change', function (e) { loadMonth(e.target.value, true); });
    $('[data-fm-prev]').onclick = function () { loadMonth(shift($('[data-fm-month]').value, -1), true); };
    $('[data-fm-next]').onclick = function () { loadMonth(shift($('[data-fm-month]').value, 1), true); };
    $('[data-fm-add]').onclick = function () { if (next) ics(next); };
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-fm-ics]'); if (b && known[b.dataset.fmIcs]) ics(known[b.dataset.fmIcs]); });
  }
  // Start once the live page has replaced the first-paint snapshot.
  var t = 0, iv = setInterval(function () {
    var el = $('[data-fm-cd]'), snap = document.querySelector('[data-dc-snapshot]');
    if ((el && !(snap && snap.contains(el))) || ++t > 200) { clearInterval(iv); if (el) start(); }
  }, 25);
})();
