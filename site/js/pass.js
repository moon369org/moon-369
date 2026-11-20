/* moon369.org/pass?p=<place>[&i=<invite>]: a member's pass.
   Like a ticket, the phone makes its own key and keeps it; Moon signs a pass bound to it. The invite in the link
   works once, so the link itself can't be shared. The pass is used at every visit, until it ends or is cancelled. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); };
  var T = function (s, v) { if (window.MoonT) return window.MoonT(s, v); return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  var b64u = function (buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var q = new URLSearchParams(location.search), place = q.get('p') || '', invite = q.get('i') || '';
  var WIN = 5000, skew = 0, pass = null, key = null, lastW = -1, timer = null, poll = null, seenVisits = null, held = false;
  var now = function () { return Date.now() + skew; };
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803, p2 = function (n, w) { return String(n).padStart(w || 2, '0'); };
  function mm(ms) {
    var s = (ms - EPOCH) / SEC, whole = Math.floor(s), frac = s - whole, da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - Math.ceil(mi * 369 / 13) + 1, sd = whole - da * 86400, n9 = p2(Math.floor(frac * 1e9), 9);
    return y + '.' + p2(mi + 1) + '.' + p2(d) + ' ' + p2(Math.floor(sd / 3600)) + ':' + p2(Math.floor(sd % 3600 / 60)) + ':' + p2(sd % 60) + '.' + n9.slice(0, 3) + ' ' + n9.slice(3, 6) + ' ' + n9.slice(6);
  }
  var shortMark = function (s) { return String(s || '').replace(/^(\d{4}\.\d{2}\.\d{2})[ -](\d{2})[.:](\d{2})[.:](\d{2}).*$/, '$1 $2:$3:$4'); };
  var day = function (iso) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso)); } catch (e) { return iso.slice(0, 10); } };
  var when = function (iso) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return iso; } };

  function db() { return new Promise(function (ok, no) { var r = indexedDB.open('moon-tickets', 1); r.onupgradeneeded = function () { r.result.createObjectStore('keys'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; }); }
  function keyGet(id) { return db().then(function (d) { return new Promise(function (ok) { var x = d.transaction('keys').objectStore('keys').get(id); x.onsuccess = function () { ok(x.result || null); }; x.onerror = function () { ok(null); }; }); }); }
  function keyPut(id, k) { return db().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction('keys', 'readwrite'); t.objectStore('keys').put(k, id); t.oncomplete = ok; t.onerror = function () { no(t.error); }; }); }); }
  function saved() { try { return JSON.parse(localStorage.getItem('moonPasses') || '{}'); } catch (e) { return {}; } }
  function save(v) { var s = saved(); s[place] = v; try { localStorage.setItem('moonPasses', JSON.stringify(s)); } catch (e) {} }

  function err(msg) { var e = $('[data-t-err]'); e.textContent = msg; e.hidden = !msg; }
  function show(which) { ['get', 'live', 'in'].forEach(function (w) { $('[data-t-' + w + ']').hidden = w !== which; }); }
  function sync(j, t0) { if (j && j.server_ms) skew = j.server_ms - (t0 + Date.now()) / 2; }
  function api(path, body) {
    var t0 = Date.now();
    return fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { sync(j, t0); if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Error ' + r.status), { status: r.status }); return j; }); });
  }

  function draw() {
    var t = now(), w = Math.floor(t / WIN);
    $('[data-t-bar]').style.transform = 'scaleX(' + (1 - (t % WIN) / WIN).toFixed(3) + ')';
    $('[data-t-clock]').textContent = mm(t);
    if (w === lastW) return; lastW = w;
    crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode('moon-ticket-code/1|' + place + '|' + pass.id + '|' + w)).then(function (sig) {
      if (w !== lastW) return;
      $('[data-t-qr]').innerHTML = window.MoonQR ? MoonQR.svg('https://moon369.org/door?c=' + [place, pass.id, w, b64u(sig)].join('.'), window.MoonPhase ? MoonPhase.fraction(t) : 0, { square: true }) : '';
    });
  }
  function live() {
    held = false; show('live');
    $('[data-t-guestname]').textContent = pass.name || T('Member');
    $('[data-t-signed]').textContent = shortMark(pass.moonmark);
    $('[data-t-id]').textContent = pass.id;
    clearInterval(timer); timer = setInterval(draw, 60); lastW = -1; draw();
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
  }
  function stop(msg) { clearInterval(timer); show(''); $('[data-t-live]').hidden = true; err(msg); }
  // Every few seconds: how the pass stands, and whether the door just let this member in.
  function status() {
    return api('/v1/passes/' + place + '/' + pass.id).then(function (j) {
      $('[data-p-until]').textContent = j.pass.expires ? day(j.pass.expires) : T('No end date');
      $('[data-p-visits]').textContent = String(j.visits);
      $('[data-p-last]').textContent = j.last_visit ? when(j.last_visit) : T('Not yet');
      if (j.status === 'cancelled') return stop(T('This membership was cancelled. Ask {p} about it.', { p: j.place.name }));
      if (j.status === 'expired') return stop(T('This membership ended on {d}. Ask {p} to renew it: the same pass starts working again.', { d: day(j.pass.expires), p: j.place.name }));
      err('');
      if (seenVisits !== null && j.visits > seenVisits) welcome(j);
      else if (!held && $('[data-t-live]').hidden) live();
      seenVisits = j.visits;
    }).catch(function () {});
  }
  function welcome(j) {
    held = true; clearInterval(timer); show('in');
    $('[data-p-inh]').textContent = T('WELCOME');
    $('[data-t-inat]').textContent = T('Visit {n} · {t}', { n: j.visits, t: new Date(j.last_visit).toLocaleTimeString() });
    var a = $('[data-t-inlink]'); if (j.last_visit_url) { a.href = j.last_visit_url.replace(/^https:\/\/moon369\.org/, ''); a.hidden = false; } else a.hidden = true;
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
    clearTimeout(welcome.t); welcome.t = setTimeout(live, 8000);
  }

  function join() {
    var btn = $('[data-t-go]'); btn.disabled = true; btn.textContent = T('SIGNING'); err('');
    var kp;
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']).then(function (k) { kp = k; return crypto.subtle.exportKey('raw', k.publicKey); })
      .then(function (raw) { return api('/v1/passes/' + place + '/join', { invite: invite, pub: b64u(raw), name: $('[data-t-guest]').value.trim() || undefined }); })
      .then(function (j) {
        pass = j.pass; key = kp.privateKey;
        return keyPut('pass:' + place, kp.privateKey).then(function () {
          save({ pass: j.pass, place: j.place });
          history.replaceState(null, '', '/pass?p=' + place);   // the invite is spent: keep it out of the address bar
          seenVisits = 0; live(); status(); poll = setInterval(status, 3000);
        });
      }).catch(function (e) { btn.disabled = false; btn.textContent = T('ADD MY PASS'); err(e && e.status === 410 ? T('This invite was already used. Each invite adds one pass to one phone: ask for a new one.') : (e && e.message) || T('Could not add the pass. Try again.')); });
  }

  function start() {
    if (!/^[A-Za-z0-9_-]{8,24}$/.test(place)) { $('[data-t-name]').textContent = T('No place'); err(T('This pass link is missing its place.')); return; }
    if (!window.crypto || !crypto.subtle || !window.indexedDB) { err(T('This browser can’t hold a Moon pass. Open the link in Safari or Chrome.')); return; }
    $('[data-t-go]').addEventListener('click', join);
    $('[data-p-back]').addEventListener('click', function () { clearTimeout(welcome.t); live(); });
    var have = saved()[place];
    if (have) $('[data-t-name]').textContent = have.place.name;
    api('/v1/passes/' + place).then(function (j) {
      $('[data-t-name]').textContent = j.place.name; document.title = j.place.name + ' · Pass · Moon';
      if (!have) {
        if (invite) { show('get'); return; }
        err(T('There’s no pass for {p} on this phone. Ask them for an invite link.', { p: j.place.name })); return;
      }
      return keyGet('pass:' + place).then(function (k) {
        if (!k) { err(T('This pass’s key isn’t on this phone. Ask {p} for a new invite.', { p: j.place.name })); if (invite) show('get'); return; }
        pass = have.pass; key = k;
        if (invite) history.replaceState(null, '', '/pass?p=' + place);   // already a member here: don't spend the invite
        live(); status(); poll = setInterval(status, 3000);
      });
    }).catch(function () { err(T('Could not reach Moon. Check your connection.')); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
