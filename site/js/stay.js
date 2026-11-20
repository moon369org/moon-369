/* moon369.org/stay?d=<door>[&i=<invite>]: a guest's stay pass.
   The phone makes its own key; Moon signs a pass over the door, the stay, that key and a time window. The QR carries
   the pass and the phone's signature on the current 30-second window, so the lock can check it all with no internet.
   While the phone is online it fetches a fresh pass before the old one runs out. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); };
  var T = function (s, v) { if (window.MoonT) return window.MoonT(s, v); return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  var b64u = function (buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var q = new URLSearchParams(location.search), door = q.get('d') || '', invite = q.get('i') || '';
  var CODE = 30000, skew = 0, st = null, key = null, lastW = -1, timer = null, online = true;
  var now = function () { return Date.now() + skew; };
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803, p2 = function (n, w) { return String(n).padStart(w || 2, '0'); };
  function mm(ms) {
    var s = (ms - EPOCH) / SEC, whole = Math.floor(s), frac = s - whole, da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - Math.ceil(mi * 369 / 13) + 1, sd = whole - da * 86400, n9 = p2(Math.floor(frac * 1e9), 9);
    return y + '.' + p2(mi + 1) + '.' + p2(d) + ' ' + p2(Math.floor(sd / 3600)) + ':' + p2(Math.floor(sd % 3600 / 60)) + ':' + p2(sd % 60) + '.' + n9.slice(0, 3) + ' ' + n9.slice(3, 6) + ' ' + n9.slice(6);
  }
  var when = function (iso, tz) { try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso)); } catch (e) { return new Date(iso).toLocaleString(); } };
  function span(ms) { var m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60; return d ? d + 'D ' + h + 'H' : h ? h + 'H ' + mi + 'M' : mi + ' MIN'; }

  function db() { return new Promise(function (ok, no) { var r = indexedDB.open('moon-tickets', 1); r.onupgradeneeded = function () { r.result.createObjectStore('keys'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; }); }
  function keyGet(id) { return db().then(function (d) { return new Promise(function (ok) { var x = d.transaction('keys').objectStore('keys').get(id); x.onsuccess = function () { ok(x.result || null); }; x.onerror = function () { ok(null); }; }); }); }
  function keyPut(id, k) { return db().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction('keys', 'readwrite'); t.objectStore('keys').put(k, id); t.oncomplete = ok; t.onerror = function () { no(t.error); }; }); }); }
  function saved() { try { return JSON.parse(localStorage.getItem('moonStays') || '{}'); } catch (e) { return {}; } }
  function save() { var s = saved(); s[door] = st; try { localStorage.setItem('moonStays', JSON.stringify(s)); } catch (e) {} }
  function err(msg) { var e = $('[data-t-err]'); e.textContent = msg; e.hidden = !msg; }
  function api(path, body) {
    var t0 = Date.now();
    return fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { online = true; if (j.server_ms) skew = j.server_ms - (t0 + Date.now()) / 2; if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Error ' + r.status), { status: r.status, code: j.error && j.error.code }); return j; }); },
        function (e) { online = false; throw e; });
  }
  var sign = function (w) { return crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode('moon-stay-code/1|' + door + '|' + st.stay.id + '|' + w)).then(b64u); };

  function head() {
    $('[data-t-name]').textContent = st.door.name; document.title = st.door.name + ' · Stay · Moon';
    $('[data-s-dates]').textContent = when(st.stay.check_in, st.door.tz) + '  →  ' + when(st.stay.check_out, st.door.tz);
    $('[data-s-guest]').textContent = st.stay.guest || T('Guest');
    $('[data-s-in]').textContent = when(st.stay.check_in, st.door.tz);
    $('[data-s-out]').textContent = when(st.stay.check_out, st.door.tz);
    $('[data-s-pinv]').textContent = st.pin.slice(0, 3) + ' ' + st.pin.slice(3, 5) + ' ' + st.pin.slice(5);
    $('[data-s-passna]').textContent = when(new Date(st.pass.na * 1000).toISOString(), st.door.tz);
  }
  // Every frame: which state the stay is in, and the live code when the door should open.
  function draw() {
    var t = now(), ci = Date.parse(st.stay.check_in), co = Date.parse(st.stay.check_out);
    if (st.stay.cancelled) return stop(T('This stay was cancelled. Contact your host.'));
    if (t >= co) return stop(T('Your stay has ended. Thanks for staying at {d}.', { d: st.door.name }));
    var early = t < ci - 15 * 60000;   // the code appears 15 minutes before check-in
    $('[data-t-live]').hidden = false; $('[data-s-wait]').hidden = !early; $('[data-s-card]').hidden = early;
    if (early) { $('[data-s-count]').textContent = span(ci - t); $('[data-s-opens]').textContent = T('Check-in {t}', { t: when(st.stay.check_in, st.door.tz) }); return; }
    if (t / 1000 > st.pass.na) {   // the pass ran out: only a fresh one, fetched online, can show a code
      $('[data-s-card]').hidden = true; $('[data-s-wait]').hidden = false;
      $('[data-s-count]').textContent = T('RENEWING'); $('[data-s-opens]').textContent = T('Connect to the internet once to renew your pass. Your backup PIN still works.');
      return;
    }
    var w = Math.floor(t / CODE);
    $('[data-t-bar]').style.transform = 'scaleX(' + (1 - (t % CODE) / CODE).toFixed(3) + ')';
    $('[data-s-secs]').textContent = Math.ceil((CODE - t % CODE) / 1000);
    $('[data-t-clock]').textContent = mm(t);
    $('[data-s-off]').hidden = online;
    if (w === lastW) return; lastW = w;
    sign(w).then(function (sig) {
      if (w !== lastW) return;
      var p = st.pass, payload = 'https://moon369.org/stay#' + [door, st.stay.id, p.nb, p.na, st.pub, p.key_id, p.sig, w, sig].join('.');
      $('[data-t-qr]').innerHTML = window.MoonQR ? MoonQR.svg(payload, 0, { square: true, level: 'M' }) : '';
    });
  }
  function stop(msg) { clearInterval(timer); timer = null; $('[data-t-live]').hidden = true; err(msg); }
  function run() { head(); clearInterval(timer); timer = setInterval(draw, 100); lastW = -1; draw(); try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {} }

  // Online upkeep: a fresh pass before the old one runs out, and whether the stay changed or the door opened.
  function upkeep() {
    if (!st) return;
    api('/v1/stays/' + door + '/' + st.stay.id).then(function (j) {
      st.stay = j.stay; st.door = j.door;
      $('[data-s-opened]').textContent = j.last_opening ? when(j.last_opening, st.door.tz) + ' (' + j.openings + ')' : T('Not yet');
      if (!j.stay.cancelled && now() < Date.parse(j.stay.check_out) && st.pass.na - now() / 1000 < 12 * 3600) {
        var w = Math.floor(now() / CODE);
        return sign(w).then(function (sig) { return api('/v1/stays/' + door + '/pass', { stay: st.stay.id, w: w, sig: sig }); }).then(function (r) { st.pass = r.pass; });
      }
    }).then(function () { save(); if (timer) head(); else if (!st.stay.cancelled && now() < Date.parse(st.stay.check_out)) { err(''); run(); } }, function () {});
  }

  function join() {
    var btn = $('[data-t-go]'); btn.disabled = true; btn.textContent = T('SIGNING'); err('');
    var kp, pub;
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']).then(function (k) { kp = k; return crypto.subtle.exportKey('raw', k.publicKey); })
      .then(function (raw) { pub = b64u(raw); return api('/v1/stays/' + door + '/join', { invite: invite, pub: pub }); })
      .then(function (j) {
        key = kp.privateKey; st = { stay: j.stay, door: j.door, pass: j.pass, pin: j.pin, pub: pub };
        return keyPut('stay:' + door, kp.privateKey).then(function () { save(); history.replaceState(null, '', '/stay?d=' + door); $('[data-t-get]').hidden = true; run(); setInterval(upkeep, 60000); });
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = T('ADD MY STAY');
        err(e && e.status === 410 ? (e.code === 'cancelled' ? T('This stay was cancelled.') : T('This invite was already used. Each invite works on one phone: ask your host for a new one.')) : (e && e.message) || T('Could not add your stay. Check your connection and try again.'));
      });
  }

  function start() {
    $('[data-s-pinbtn]').addEventListener('click', function () { var p = $('[data-s-pin]'); p.hidden = !p.hidden; this.textContent = p.hidden ? T('SHOW BACKUP PIN') : T('HIDE BACKUP PIN'); });
    $('[data-t-go]').addEventListener('click', join);
    if (!/^[A-Za-z0-9_-]{8,24}$/.test(door)) { $('[data-t-name]').textContent = T('No door'); err(T('This stay link is missing its door.')); return; }
    if (!window.crypto || !crypto.subtle || !window.indexedDB) { err(T('This browser can’t hold a Moon stay pass. Open the link in Safari or Chrome.')); return; }
    var have = saved()[door];
    if (have) {   // works with no signal: everything the code needs is on this phone
      return keyGet('stay:' + door).then(function (k) {
        if (!k) { err(T('This stay’s key isn’t on this phone. Ask your host for a new invite.')); if (invite) $('[data-t-get]').hidden = false; return; }
        st = have; key = k; if (invite) history.replaceState(null, '', '/stay?d=' + door);
        run(); upkeep(); setInterval(upkeep, 60000);
      });
    }
    api('/v1/stays/' + door).then(function (j) {
      $('[data-t-name]').textContent = j.door.name;
      if (invite) $('[data-t-get]').hidden = false; else err(T('There’s no stay for {d} on this phone. Open the invite link your host sent.', { d: j.door.name }));
    }).catch(function () { err(T('Could not reach Moon. Check your connection.')); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
