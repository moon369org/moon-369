/* Solar eclipses: the list (/eclipses) and one eclipse (/eclipse/2024-04-08). Data from the Moon API. */
(function () {
  var API = 'https://api.moon369.org';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var NAME = { total: 'Total solar eclipse', annular: 'Annular solar eclipse', hybrid: 'Hybrid solar eclipse', partial: 'Partial solar eclipse' };
  var WHAT = {
    total: 'The moon covered the whole sun. Along a narrow path the sky went dark, the stars came out and the corona appeared around the black disc.',
    annular: 'The moon was too far from Earth to cover the sun, so a ring of fire stayed around it along the path.',
    hybrid: 'One of the rarest kinds: total along part of the path and annular along the rest, because Earth’s curve brings some places closer to the moon.',
    partial: 'Only the edge of the moon’s shadow touched Earth, so the moon took a bite out of the sun but never covered it.',
  };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var yl = function (y) { return y <= 0 ? (1 - y) + ' BCE' : String(y); };
  function parts(date) { var m = /^(-?\d{4})-(\d{2})-(\d{2})$/.exec(date); return { y: +m[1], mo: +m[2], d: +m[3] }; }
  function longDate(date) { var p = parts(date); return p.d + ' ' + MONTHS[p.mo - 1] + ' ' + yl(p.y); }
  function shortDate(date) { var p = parts(date); return p.d + ' ' + MONTHS[p.mo - 1].slice(0, 3) + ' ' + yl(p.y); }
  function icon(t) { return 'assets/eclipse/' + t + '.svg'; }
  function get(path) { return fetch(API + path).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status); return j; }); }); }
  function toast(t) { var e = $('[data-ec-toast]'); if (!e) return; e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('on'); }, 1800); }

  // ---------- the list ----------
  var state = { c0: Math.floor((new Date().getUTCFullYear() - 1) / 100) * 100 + 1, type: '' };
  function century(y) { return Math.floor((y - 1) / 100) * 100 + 1; }
  function loadList() {
    var list = $('[data-ec-list]'), from = Math.max(-1999, state.c0), to = Math.min(3000, state.c0 + 99);
    var thisC = century(new Date().getUTCFullYear());
    $('[data-ec-range]').textContent = (from <= 0 ? yl(from) : from) + ' TO ' + (to <= 0 ? yl(to) : to);
    $('[data-ec-title]').textContent = state.c0 === thisC ? 'THIS CENTURY' : (state.type ? state.type.toUpperCase() + ' ECLIPSES' : 'ALL ECLIPSES');
    list.innerHTML = '<div class="ec-empty">Loading…</div>';
    get('/v1/eclipses?from=' + from + '&to=' + to + '&limit=1000' + (state.type ? '&type=' + state.type : '')).then(function (j) {
      var now = Date.now();
      if (!j.eclipses.length) { list.innerHTML = '<div class="ec-empty">No ' + esc(state.type) + ' eclipses in these years.</div>'; return; }
      list.innerHTML = j.eclipses.map(function (e) {
        return '<a class="ec-row' + (e.unix_ms < now ? ' past' : '') + '" href="/eclipse/' + e.date + '" data-y="' + parts(e.date).y + '"><img src="' + icon(e.type) + '" alt="" width="56" height="56" loading="lazy">' +
          '<div><b>' + esc(shortDate(e.date).toUpperCase()) + '</b><span>' + e.type.toUpperCase() + ' · SAROS ' + e.saros + '</span></div></a>';
      }).join('');
      if (state.jump != null) {
        var t = list.querySelector('[data-y="' + state.jump + '"]'); state.jump = null;
        if (t) { t.scrollIntoView({ block: 'center' }); t.style.background = '#1C1D20'; }
      }
    }).catch(function (e) { list.innerHTML = '<div class="ec-empty">Could not load eclipses. ' + esc(e.message) + '</div>'; });
  }
  function initList() {
    get('/v1/eclipses/next').then(function (e) {
      $('[data-ec-next]').href = '/eclipse/' + e.date;
      $('[data-ec-next-icon]').src = icon(e.type);
      $('[data-ec-next-icon]').alt = NAME[e.type];
      $('[data-ec-next-date]').textContent = longDate(e.date).toUpperCase();
      $('[data-ec-next-sub]').textContent = e.type.toUpperCase() + ' · ' + new Date(e.unix_ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + ' your time · SAROS ' + e.saros;
      $('[data-ec-next-days]').textContent = Math.max(0, Math.ceil(e.in_days));
    }).catch(function () {});
    loadList();
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest && ev.target.closest('[data-ec-type],[data-ec-step]');
      if (!t) return;
      if (t.hasAttribute('data-ec-type')) {
        var v = t.getAttribute('data-ec-type'); state.type = state.type === v ? '' : v;
        document.querySelectorAll('[data-ec-type]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-ec-type') === state.type)); });
      } else state.c0 = Math.max(-2099, Math.min(2901, state.c0 + 100 * +t.getAttribute('data-ec-step')));
      loadList();
    });
    document.addEventListener('submit', function (ev) {
      if (!ev.target.matches('[data-ec-form]')) return;
      ev.preventDefault();
      var y = parseInt(ev.target.querySelector('input').value, 10);
      if (isNaN(y) || y < -1999 || y > 3000) { toast('PICK A YEAR FROM -1999 TO 3000'); return; }
      state.c0 = century(y); state.jump = y; loadList();
    });
  }

  // ---------- one eclipse ----------
  function initOne() {
    var m = /^\/eclipse\/(-?\d{4}-\d{2}-\d{2})\/?$/.exec(location.pathname) || /[?&]date=(-?\d{4}-\d{2}-\d{2})/.exec(location.search);
    if (!m) { $('[data-ec-kind]').textContent = 'SOLAR ECLIPSES'; $('[data-ec-date]').innerHTML = '<a href="/eclipses">SEE EVERY ECLIPSE</a>'; return; }
    get('/v1/eclipses/' + m[1]).then(function (e) {
      var title = NAME[e.type] + ' · ' + longDate(e.date);
      document.title = title + ' · Moon';
      $('[data-ec-icon]').src = icon(e.type); $('[data-ec-icon]').alt = NAME[e.type];
      $('[data-ec-kind]').textContent = NAME[e.type].toUpperCase();
      $('[data-ec-date]').textContent = longDate(e.date).toUpperCase();
      $('[data-ec-sub]').textContent = 'GREATEST ECLIPSE ' + e.greatest_eclipse_td + ' TT · SAROS ' + e.saros;
      var p = parts(e.date);
      if (p.y >= 1900) $('[data-ec-when]').textContent = 'In your time zone: ' + new Date(e.unix_ms).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
      var ut = e.utc.slice(11, 19);
      var mm = e.cycle >= 0 ? '<a href="/m/' + e.moonmark.replace(' ', '-').replace(/:/g, '.') + '.000000000">' + esc(e.moonmark) + '</a>' : esc(e.moonmark);
      var s = e.saros_series;
      var fact = function (k, v) { return '<div><span class="ec-k">' + k + '</span><b>' + v + '</b></div>'; };
      $('[data-ec-facts]').innerHTML =
        fact('TYPE', NAME[e.type] + (e.central ? '' : ' (non-central)')) +
        fact('GREATEST ECLIPSE', e.greatest_eclipse_td + ' TT<br>' + ut + ' UT') +
        fact('SAROS', e.saros + ', number ' + s.member + ' of ' + s.of + (s.previous || s.next ? '<br>' + (s.previous ? '<a href="/eclipse/' + s.previous.date + '">' + esc(shortDate(s.previous.date)) + '</a>' : '') + (s.previous && s.next ? ' · ' : '') + (s.next ? '<a href="/eclipse/' + s.next.date + '">' + esc(shortDate(s.next.date)) + '</a>' : '') : '')) +
        fact('MOONMARK', mm) +
        fact('CYCLE · MOON · LUNE', e.cycle + ' · ' + String(e.moon).padStart(2, '0') + ' · ' + String(e.lune).padStart(2, '0')) +
        fact('GAMMA', e.gamma.toFixed(4)) +
        (e.magnitude != null ? fact('MAGNITUDE', e.magnitude.toFixed(3)) : '') +
        fact('CALENDAR', e.calendar === 'julian' ? 'Julian' : 'Gregorian') +
        fact('DELTA T', e.delta_t_s.toLocaleString() + ' s');
      $('[data-ec-note]').textContent = WHAT[e.type] + ' Gamma is how far the shadow’s axis passed from Earth’s centre, in Earth radii. Eclipses in the same saros repeat every 18 years, 11 days and 8 hours.';
      if (e.previous) { $('[data-ec-prev]').href = '/eclipse/' + e.previous.date; } else $('[data-ec-prev]').hidden = true;
      if (e.next) { $('[data-ec-nextone]').href = '/eclipse/' + e.next.date; } else $('[data-ec-nextone]').hidden = true;
      var url = 'https://moon369.org/eclipse/' + e.date;
      var future = e.unix_ms > Date.now();
      var text = (future ? 'A ' + NAME[e.type].toLowerCase() + ' is coming on ' : 'A ' + NAME[e.type].toLowerCase() + ' happened on ') + longDate(e.date) + '.\nEvery solar eclipse from 2000 BCE to 3000 CE:';
      $('[data-ec-x]').href = 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
      document.addEventListener('click', function (ev) {
        var t = ev.target.closest && ev.target.closest('[data-ec-share],[data-ec-copy]'); if (!t) return;
        if (t.hasAttribute('data-ec-share') && navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); return; }
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('LINK COPIED'); }, function () { window.prompt('Copy this link', url); });
      });
    }).catch(function (err) {
      $('[data-ec-kind]').textContent = 'NOT FOUND';
      $('[data-ec-date]').textContent = 'NO SOLAR ECLIPSE ON THAT DATE';
      $('[data-ec-sub]').textContent = err.message;
    });
  }

  (function boot(n) {
    var list = $('[data-ec-list]'), one = $('[data-ec-facts]');
    var snap = document.querySelector('[data-dc-snapshot]');
    if ((!list && !one) || (snap && snap.contains(list || one))) { if (n < 200) setTimeout(function () { boot(n + 1); }, 25); return; }
    if (list) initList(); else initOne();
  })(0);
})();
