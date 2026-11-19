/* moon369.org/ticket?e=<event>: a guest's ticket.
   The phone makes its own P-256 key pair. The private half is created non-extractable and kept in IndexedDB,
   so it can't be copied out of this browser. Moon signs a ticket bound to the public half.
   At the door the QR carries the ticket, the current 5-second window and this phone's signature over both:
   a screenshot is stale within seconds, and no other phone can make the next code. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); };
  var T = function (s, v) { if (window.MoonT) return window.MoonT(s, v); return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  var b64u = function (buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var ev = new URLSearchParams(location.search).get('e') || '';
  var WIN = 5000, skew = 0, ticket = null, key = null, lastW = -1, timer = null, poll = null;
  var now = function () { return Date.now() + skew; };

  // Moon time, for the live clock under the code.
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803, p2 = function (n, w) { return String(n).padStart(w || 2, '0'); };
  function mm(ms) {
    var s = (ms - EPOCH) / SEC, whole = Math.floor(s), frac = s - whole, da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - Math.ceil(mi * 369 / 13) + 1, sd = whole - da * 86400, n9 = p2(Math.floor(frac * 1e9), 9);
    return y + '.' + p2(mi + 1) + '.' + p2(d) + ' ' + p2(Math.floor(sd / 3600)) + ':' + p2(Math.floor(sd % 3600 / 60)) + ':' + p2(sd % 60) + '.' + n9.slice(0, 3) + ' ' + n9.slice(3, 6) + ' ' + n9.slice(6);
  }
  var shortMark = function (s) { return String(s || '').replace(/^(\d{4}\.\d{2}\.\d{2})[ -](\d{2})[.:](\d{2})[.:](\d{2}).*$/, '$1 $2:$3:$4'); };

  // ---- the private key, kept in this browser only ----
  function db() { return new Promise(function (ok, no) { var r = indexedDB.open('moon-tickets', 1); r.onupgradeneeded = function () { r.result.createObjectStore('keys'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; }); }
  function keyGet(id) { return db().then(function (d) { return new Promise(function (ok) { var q = d.transaction('keys').objectStore('keys').get(id); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; }); }); }
  function keyPut(id, k) { return db().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction('keys', 'readwrite'); t.objectStore('keys').put(k, id); t.oncomplete = ok; t.onerror = function () { no(t.error); }; }); }); }
  function saved() { try { return JSON.parse(localStorage.getItem('moonTickets') || '{}'); } catch (e) { return {}; } }
  function save(t) { var s = saved(); s[ev] = t; try { localStorage.setItem('moonTickets', JSON.stringify(s)); } catch (e) {} }

  function err(msg) { var e = $('[data-t-err]'); e.textContent = msg; e.hidden = !msg; }
  function show(which) { ['get', 'live', 'in'].forEach(function (w) { $('[data-t-' + w + ']').hidden = w !== which; }); }
  function syncClock(serverMs, t0) { if (serverMs) skew = serverMs - (t0 + Date.now()) / 2; }

  function head(e) {
    $('[data-t-name]').textContent = e.name; document.title = e.name + ' · Ticket · Moon';
    var w = '';
    if (e.start_utc) { try { w = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(e.start_utc)); } catch (x) {} }
    if (e.moonmark) w = (w ? w + ' · ' : '') + shortMark(e.moonmark);
    $('[data-t-when]').textContent = w;
  }

  // ---- the live code ----
  function draw() {
    var t = now(), w = Math.floor(t / WIN);
    $('[data-t-bar]').style.transform = 'scaleX(' + (1 - (t % WIN) / WIN).toFixed(3) + ')';
    $('[data-t-clock]').textContent = mm(t);
    if (w === lastW) return; lastW = w;
    var msg = new TextEncoder().encode('moon-ticket-code/1|' + ev + '|' + ticket.id + '|' + w);
    crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, msg).then(function (sig) {
      if (w !== lastW) return;
      var url = 'https://moon369.org/door?c=' + [ev, ticket.id, w, b64u(sig)].join('.');
      var f = window.MoonPhase ? MoonPhase.fraction(t) : 0;
      $('[data-t-qr]').innerHTML = window.MoonQR ? MoonQR.svg(url, f, { square: true }) : '';
    });
  }
  function live() {
    show('live');
    $('[data-t-guestname]').textContent = ticket.name || T('Not given');
    $('[data-t-signed]').textContent = shortMark(ticket.moonmark);
    $('[data-t-id]').textContent = ticket.id;
    clearInterval(timer); timer = setInterval(draw, 60); draw();
    clearInterval(poll); poll = setInterval(status, 3000);
    // Keep the screen awake while the ticket is open, where the browser allows it.
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
  }
  function status() {
    var t0 = Date.now();
    return fetch(API + '/v1/tickets/' + ev + '/' + ticket.id, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      syncClock(j.server_ms, t0);
      if (j.checked_in) inside(j);
    }).catch(function () {});
  }
  function inside(j) {
    clearInterval(timer); clearInterval(poll); show('in');
    var at = new Date(j.checked_in);
    $('[data-t-inat]').textContent = (j.checkin_moonmark ? shortMark(j.checkin_moonmark) + ' · ' : '') + at.toLocaleTimeString();
    var a = $('[data-t-inlink]');
    if (j.checkin_url) { a.href = j.checkin_url.replace(/^https:\/\/moon369\.org/, ''); a.hidden = false; } else a.hidden = true;
    // The check-in joins the Moonlog on this phone, as a moment: proof you were there.
    try {
      var list = JSON.parse(localStorage.getItem('moonMoments') || '[]'), url = j.checkin_url;
      if (url && !list.some(function (x) { return x.url === url; })) {
        list.unshift({ ms: at.getTime(), name: T('Checked in · {e}', { e: j.event && j.event.name || '' }), url: url });
        localStorage.setItem('moonMoments', JSON.stringify(list.slice(0, 500)));
      }
    } catch (e) {}
  }

  // ---- getting a ticket ----
  function get() {
    var btn = $('[data-t-go]'); btn.disabled = true; btn.textContent = T('SIGNING'); err('');
    var kp;
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']).then(function (k) {
      kp = k; return crypto.subtle.exportKey('raw', k.publicKey);
    }).then(function (raw) {
      var t0 = Date.now();
      return fetch(API + '/v1/tickets/' + ev + '/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pub: b64u(raw), name: $('[data-t-guest]').value.trim() || undefined }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status); syncClock(j.server_ms, t0); return j; }); });
    }).then(function (j) {
      ticket = j.ticket; key = kp.privateKey;
      return keyPut(ev, kp.privateKey).then(function () { save({ ticket: j.ticket, event: j.event }); live(); });
    }).catch(function (e) { btn.disabled = false; btn.textContent = T('GET MY TICKET'); err(e && e.message || T('Could not get a ticket. Try again.')); });
  }

  function start() {
    if (!/^[A-Za-z0-9_-]{8,24}$/.test(ev)) { $('[data-t-name]').textContent = T('No event'); err(T('This ticket link is missing its event.')); return; }
    if (!window.crypto || !crypto.subtle || !window.indexedDB) { err(T('This browser can’t hold a Moon ticket. Open the link in Safari or Chrome.')); return; }
    $('[data-t-go]').addEventListener('click', get);
    var have = saved()[ev];
    if (have) head(have.event);
    var t0 = Date.now();
    fetch(API + '/v1/tickets/' + ev, { cache: 'no-store' }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status); return j; }); }).then(function (j) {
      syncClock(j.server_ms, t0); head(j.event);
      if (!have) { show('get'); return; }
      return keyGet(ev).then(function (k) {
        if (!k) { show('get'); err(T('This ticket’s key isn’t on this phone, so it can’t be shown here. Get a new one on this phone.')); return; }
        ticket = have.ticket; key = k; live(); status();
      });
    }).catch(function (e) { err(e && e.message === 'No such event' ? T('This event doesn’t exist, or its link is incomplete.') : T('Could not reach Moon. Check your connection.')); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
