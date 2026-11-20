/* moon369.org/passes: show off Moon member passes with the real thing.
   The hero pass is signed live by a key this browser makes. The lab opens a real place for this visitor, invites real
   members and sends real codes to Moon's API. The form makes a visitor's own place and opens its members page. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var b64u = function (buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var WIN = 5000, skew = 0, now = function () { return Date.now() + skew; };
  var ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };
  var qr = function (url, t) { return window.MoonQR ? MoonQR.svg(url, window.MoonPhase ? MoonPhase.fraction(t || Date.now()) : 0, { square: true }) : ''; };
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803, p2 = function (n, w) { return String(n).padStart(w || 2, '0'); };
  function mm(ms) {
    var s = (ms - EPOCH) / SEC, whole = Math.floor(s), frac = s - whole, da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - Math.ceil(mi * 369 / 13) + 1, sd = whole - da * 86400, n9 = p2(Math.floor(frac * 1e9), 9);
    return y + '.' + p2(mi + 1) + '.' + p2(d) + ' ' + p2(Math.floor(sd / 3600)) + ':' + p2(Math.floor(sd % 3600 / 60)) + ':' + p2(sd % 60) + '.' + n9.slice(0, 3) + ' ' + n9.slice(3, 6) + ' ' + n9.slice(6);
  }
  function sign(key, p, id, w) { return crypto.subtle.sign(SIG, key, new TextEncoder().encode('moon-ticket-code/1|' + p + '|' + id + '|' + w)).then(b64u); }

  function hero() {
    var box = $('[data-hero-qr]'); if (!box || !crypto.subtle) return;
    try { $('[data-hero-until]').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(Date.now() + 300 * 86400000); } catch (e) {}
    var lastW = -1, key = null;
    crypto.subtle.generateKey(ALG, false, ['sign', 'verify']).then(function (k) { key = k.privateKey; });
    (function tick() {
      var t = now(), w = Math.floor(t / WIN);
      $('[data-hero-bar]').style.transform = 'scaleX(' + (1 - (t % WIN) / WIN).toFixed(3) + ')';
      $('[data-hero-clock]').textContent = mm(t);
      if (key && w !== lastW) { lastW = w; sign(key, 'IronPeakGym1', 'AveryColePass', w).then(function (sig) { box.innerHTML = qr('https://moon369.org/door?c=' + ['IronPeakGym1', 'AveryColePass', w, sig].join('.'), t); }); }
      requestAnimationFrame(tick);
    })();
  }

  // ---- a real place for this visitor, with real members ----
  var demo = null, demoP = null;
  function api(path, body) {
    var t0 = Date.now();
    return fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (j.server_ms) skew = j.server_ms - (t0 + Date.now()) / 2; if (!r.ok && !('ok' in j)) throw Object.assign(new Error((j.error && j.error.message) || 'Error ' + r.status), { status: r.status, body: j }); return j; }); });
  }
  function ensure() {
    if (demoP) return demoP;
    try { demo = JSON.parse(sessionStorage.getItem('moonPassDemo') || 'null'); } catch (e) {}
    demoP = (demo ? api('/v1/passes/' + demo.p).then(function () { return demo; }, function () { demo = null; }) : Promise.resolve(null)).then(function (d) {
      if (d) return d;
      return api('/v1/passes', { name: 'Iron Peak Gym · Moon passes demo', passback_min: 30 }).then(function (j) {
        demo = { p: j.place.id, key: j.key }; try { sessionStorage.setItem('moonPassDemo', JSON.stringify(demo)); } catch (e) {}
        return demo;
      });
    });
    demoP.catch(function () { demoP = null; });
    return demoP;
  }
  var people = {};
  function member(name) {   // the owner invites them; their phone takes the invite and makes its own key
    if (people[name]) return people[name];
    var kp, tok;
    return (people[name] = ensure().then(function () { return api('/v1/passes/' + demo.p + '/invite', { key: demo.key, name: name, days: 365 }); })
      .then(function (j) { tok = j.invite.token; return crypto.subtle.generateKey(ALG, false, ['sign', 'verify']); })
      .then(function (k) { kp = k; return crypto.subtle.exportKey('raw', k.publicKey); })
      .then(function (raw) { return api('/v1/passes/' + demo.p + '/join', { invite: tok, pub: b64u(raw) }); })
      .then(function (j) { return { name: name, id: j.pass.id, key: kp.privateKey, invite: tok }; }));
  }
  function checkin(id, w, sig) { return api('/v1/passes/' + demo.p + '/checkin', { key: demo.key, ticket: id, w: w, sig: sig }); }
  function scanNow(m) { var w = Math.floor(now() / WIN); return sign(m.key, demo.p, m.id, w).then(function (sig) { return checkin(m.id, w, sig); }); }
  function count() { api('/v1/passes/' + demo.p + '/members', { key: demo.key }).then(function (j) { var d = new Date().toDateString(); $('[data-door-count]').textContent = j.members.filter(function (m) { return m.last_visit && new Date(m.last_visit).toDateString() === d; }).length + ' TODAY · ' + j.members.length + ' MEMBERS'; }, function () {}); }

  function show(kind, big, small, json, label) {
    var r = $('[data-res]'); r.className = 'tp-res ' + (kind || '');
    r.innerHTML = '<b></b><span></span>'; r.firstChild.textContent = big; r.lastChild.textContent = small || '';
    if (json !== undefined) {
      var j = JSON.parse(JSON.stringify(json || {})); if (j.signed_url) j.signed_url = j.signed_url.slice(0, 48) + '…';
      $('[data-json]').textContent = json ? '// ' + (label || 'POST /v1/passes/{place}/checkin') + '\n' + JSON.stringify(j, null, 2) : '';
    }
  }
  var at = function (iso) { try { return new Date(iso).toLocaleTimeString(); } catch (e) { return ''; } };
  var busy = false, shotT = null;
  function run(which, btn) {
    if (busy) return; busy = true; btn.classList.add('done');
    clearInterval(shotT); $('[data-shot]').hidden = true;
    show('wait', 'SCANNING', '', null);
    if (window.innerWidth < 900) { try { $('.tp-door').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    var go;
    if (which === 'in' || which === 'back') {
      go = member('Avery').then(scanNow).then(function (j) {
        if (j.ok) { show('ok', 'WELCOME', 'Avery is in. Visit ' + j.visits + ', signed by Moon as its own Moonmark.', j); $('[data-try="back"]').disabled = false; }
        else if (j.reason === 'just_in') show('no', 'JUST IN', 'This pass came in at ' + at(j.last_visit) + '. It can’t come in again for 30 minutes, so one pass is one person.', j);
        else show('no', 'NOT VALID', j.message || j.reason, j);
      });
    } else if (which === 'shot') {
      go = member('Blake').then(function (m) {
        var w = Math.floor(now() / WIN), t0 = Date.now();
        return sign(m.key, demo.p, m.id, w).then(function (sig) {
          $('[data-shot-qr]').innerHTML = qr('https://moon369.org/door?c=' + [demo.p, m.id, w, sig].join('.'));
          $('[data-shot]').hidden = false; $('[data-shot-s]').textContent = 'Posted in the group chat…';
          show('wait', 'WAITING', 'A friend sees the post, opens it and walks up to the desk. That takes about 20 seconds.', null);
          return new Promise(function (ok) {
            shotT = setInterval(function () {
              var age = Math.floor((Date.now() - t0) / 1000); $('[data-shot-age]').textContent = age;
              if (age === 12) $('[data-shot-s]').textContent = 'The friend is at the desk…';
              if (age >= 20) { clearInterval(shotT); $('[data-shot-s]').textContent = 'Shown at the desk.'; ok(checkin(m.id, w, sig)); }
            }, 250);
          });
        });
      }).then(function (j) {
        if (j.reason === 'stale_code') show('no', 'OLD CODE', 'The screenshot was 20 seconds old. The desk only takes codes from the last 15 seconds, and only Blake’s phone can make a new one.', j);
        else show(j.ok ? 'ok' : 'no', j.ok ? 'WELCOME' : 'NOT VALID', j.message || '', j);
      });
    } else if (which === 'lapsed') {
      go = member('Casey').then(function (m) {
        return api('/v1/passes/' + demo.p + '/cancel', { key: demo.key, pass: m.id }).then(function () { return scanNow(m); });
      }).then(function (j) {
        if (j.reason === 'cancelled') show('no', 'CANCELLED', 'Casey’s membership was cancelled, so the pass stopped working the same minute. Renew it and the same pass works again.', j);
        else show(j.ok ? 'ok' : 'no', j.ok ? 'WELCOME' : 'NOT VALID', j.message || '', j);
      });
    } else {
      go = member('Dana').then(function (m) {
        // The friend opens Dana's spent invite on their own phone.
        return crypto.subtle.generateKey(ALG, false, ['sign', 'verify']).then(function (k) { return crypto.subtle.exportKey('raw', k.publicKey); })
          .then(function (raw) { return api('/v1/passes/' + demo.p + '/join', { invite: m.invite, pub: b64u(raw) }); });
      }).then(function (j) { show('ok', 'JOINED', 'That shouldn’t happen.', j, 'POST /v1/passes/{place}/join'); }, function (e) {
        if (e && e.status === 410) { show('no', 'INVITE USED', 'Dana’s invite already put a pass on Dana’s phone. Each invite works once, so the friend gets nothing.', e.body, 'POST /v1/passes/{place}/join  → 410'); return; }
        throw e;
      });
    }
    go.then(count, function (e) { show('no', 'NO CONNECTION', (e && e.message) || 'Could not reach Moon. Try again.', null); btn.classList.remove('done'); })
      .then(function () { busy = false; });
  }

  // ---- the visitor's own place ----
  function make(e) {
    e.preventDefault();
    var name = $('[data-make-name]').value.trim(), b = $('[data-make-go]'), msg = $('[data-make-msg]');
    if (!name) { $('[data-make-name]').focus(); return; }
    b.disabled = true; b.textContent = 'CREATING';
    api('/v1/passes', { name: name }).then(function (j) {
      try { var s = JSON.parse(localStorage.getItem('moonPlaces') || '{}'); s[j.place.id] = j.key; localStorage.setItem('moonPlaces', JSON.stringify(s)); } catch (x) {}
      location.href = '/members#' + j.place.id + '.' + j.key;
    }).catch(function (er) { b.disabled = false; b.textContent = 'CREATE'; msg.textContent = er.message || 'Could not reach Moon. Try again.'; msg.classList.add('err'); });
  }

  function start() {
    hero();
    $$('[data-try]').forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-try'), b); }); });
    $('[data-make]').addEventListener('submit', make);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
