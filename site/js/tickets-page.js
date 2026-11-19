/* moon369.org/tickets: show off Moon tickets with the real thing.
   The hero ticket is signed live by a key this browser makes. The lab opens a real ticketed event for this
   visitor and sends real codes to Moon's API: a live ticket, the same ticket twice, a screenshot, a copied ticket. */
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
  function sign(key, ev, tid, w) { return crypto.subtle.sign(SIG, key, new TextEncoder().encode('moon-ticket-code/1|' + ev + '|' + tid + '|' + w)).then(b64u); }

  // ---- the hero ticket: real signatures from a key made here, every 5 seconds ----
  function hero() {
    var box = $('[data-hero-qr]'); if (!box || !crypto.subtle) return;
    var lastW = -1, key = null;
    crypto.subtle.generateKey(ALG, false, ['sign', 'verify']).then(function (k) { key = k.privateKey; });
    (function tick() {
      var t = now(), w = Math.floor(t / WIN);
      $('[data-hero-bar]').style.transform = 'scaleX(' + (1 - (t % WIN) / WIN).toFixed(3) + ')';
      $('[data-hero-clock]').textContent = mm(t);
      if (key && w !== lastW) {
        lastW = w;
        sign(key, 'FullMoonRooftop', 'AveryTicket01', w).then(function (sig) {
          box.innerHTML = qr('https://moon369.org/door?c=' + ['FullMoonRooftop', 'AveryTicket01', w, sig].join('.'), t);
          $('[data-hero-w]').textContent = String(w).slice(-6) + ' · ' + sig.slice(0, 10) + '…';
        });
      }
      requestAnimationFrame(tick);
    })();
  }

  // ---- a real event for this visitor ----
  var demo = null, demoP = null;
  function api(path, body) {
    var t0 = Date.now();
    return fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (j.server_ms) skew = j.server_ms - (t0 + Date.now()) / 2; if (!r.ok && !('ok' in j)) throw new Error((j.error && j.error.message) || 'Error ' + r.status); return j; }); });
  }
  function ensure() {
    if (demoP) return demoP;
    try { demo = JSON.parse(sessionStorage.getItem('moonTixDemo') || 'null'); } catch (e) {}
    demoP = (demo ? api('/v1/tickets/' + demo.ev).then(function () { return demo; }, function () { demo = null; }) : Promise.resolve(null)).then(function (d) {
      if (d) return d;
      return api('/v1/tickets', { name: 'Your door · Moon tickets demo' }).then(function (j) {
        demo = { ev: j.event.id, key: j.door_key }; try { sessionStorage.setItem('moonTixDemo', JSON.stringify(demo)); } catch (e) {}
        return demo;
      });
    });
    demoP.catch(function () { demoP = null; });
    return demoP;
  }
  var guests = {};
  function guest(name) {   // a phone: its own key, and a ticket Moon signed for it
    if (guests[name]) return guests[name];
    var kp;
    return (guests[name] = ensure().then(function () { return crypto.subtle.generateKey(ALG, false, ['sign', 'verify']); }).then(function (k) {
      kp = k; return crypto.subtle.exportKey('raw', k.publicKey);
    }).then(function (raw) { return api('/v1/tickets/' + demo.ev + '/issue', { pub: b64u(raw), name: name }); }).then(function (j) {
      return { name: name, id: j.ticket.id, key: kp.privateKey };
    }));
  }
  function checkin(tid, w, sig) { return api('/v1/tickets/' + demo.ev + '/checkin', { key: demo.key, ticket: tid, w: w, sig: sig }); }
  function count() { api('/v1/tickets/' + demo.ev).then(function (j) { $('[data-door-count]').textContent = j.checked_in + ' IN · ' + j.tickets + ' TICKETS'; }, function () {}); }

  // ---- the lab ----
  function show(kind, big, small, json) {
    var r = $('[data-res]'); r.className = 'tp-res ' + (kind || '');
    r.innerHTML = '<b></b><span></span>'; r.firstChild.textContent = big; r.lastChild.textContent = small || '';
    if (json !== undefined) {
      var j = JSON.parse(JSON.stringify(json || {})); if (j.signed_url) j.signed_url = j.signed_url.slice(0, 48) + '…';
      $('[data-json]').textContent = json ? '// POST /v1/tickets/{event}/checkin\n' + JSON.stringify(j, null, 2) : '';
    }
  }
  function at(iso) { try { return new Date(iso).toLocaleTimeString(); } catch (e) { return ''; } }
  var busy = false, shotT = null;
  function run(which, btn) {
    if (busy) return; busy = true; btn.classList.add('done');
    clearInterval(shotT); $('[data-shot]').hidden = true;
    show('wait', 'SCANNING', '', null);
    if (window.innerWidth < 900) { try { $('.tp-door').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }   // the door sits below the moves on a phone
    var go;
    if (which === 'live' || which === 'again') {
      go = guest('Avery').then(function (g) {
        var w = Math.floor(now() / WIN);
        return sign(g.key, demo.ev, g.id, w).then(function (sig) { return checkin(g.id, w, sig); });
      }).then(function (j) {
        if (j.ok) { show('ok', 'WELCOME', 'Avery is in. Moon signed the check-in as its own Moonmark.', j); $('[data-try="again"]').disabled = false; }
        else if (j.reason === 'already_in') show('no', 'ALREADY IN', 'This ticket was used at ' + at(j.checked_in) + '. One ticket, one check-in.', j);
        else show('no', 'NOT VALID', j.message || j.reason, j);
      });
    } else if (which === 'shot') {
      go = guest('Blake').then(function (g) {
        var w = Math.floor(now() / WIN), t0 = Date.now();
        return sign(g.key, demo.ev, g.id, w).then(function (sig) {
          $('[data-shot-qr]').innerHTML = qr('https://moon369.org/door?c=' + [demo.ev, g.id, w, sig].join('.'));
          $('[data-shot]').hidden = false; $('[data-shot-s]').textContent = 'On its way to the friend…';
          show('wait', 'WAITING', 'The friend gets the text, opens it and walks up to the door. That takes about 20 seconds.', null);
          return new Promise(function (ok) {
            shotT = setInterval(function () {
              var age = Math.floor((Date.now() - t0) / 1000); $('[data-shot-age]').textContent = age;
              if (age === 12) $('[data-shot-s]').textContent = 'The friend is at the door…';
              if (age >= 20) { clearInterval(shotT); $('[data-shot-s]').textContent = 'Shown at the door.'; ok(checkin(g.id, w, sig)); }
            }, 250);
          });
        });
      }).then(function (j) {
        if (j.reason === 'stale_code') show('no', 'OLD CODE', 'The screenshot was 20 seconds old. The door only takes codes from the last 15 seconds, and only Blake’s phone can make a new one.', j);
        else if (j.ok) show('ok', 'WELCOME', 'That one got through: it reached the door within 15 seconds.', j);
        else show('no', 'NOT VALID', j.message || j.reason, j);
      });
    } else {
      go = guest('Casey').then(function (g) {
        // The friend's phone has Casey's ticket link, but its own key: Casey's never left Casey's phone.
        return crypto.subtle.generateKey(ALG, false, ['sign', 'verify']).then(function (other) {
          var w = Math.floor(now() / WIN);
          return sign(other.privateKey, demo.ev, g.id, w).then(function (sig) { return checkin(g.id, w, sig); });
        });
      }).then(function (j) {
        if (j.reason === 'wrong_phone') show('no', 'NOT VALID', 'The code wasn’t made by the phone this ticket belongs to. Casey’s key never left Casey’s phone.', j);
        else show(j.ok ? 'ok' : 'no', j.ok ? 'WELCOME' : 'NOT VALID', j.message || j.reason || '', j);
      });
    }
    go.then(count, function (e) { show('no', 'NO CONNECTION', (e && e.message) || 'Could not reach Moon. Try again.', null); btn.classList.remove('done'); })
      .then(function () { busy = false; });
  }

  // ---- your own phone at this computer's door ----
  function real() {
    ensure().then(function (d) {
      var tix = 'https://moon369.org/ticket?e=' + d.ev;
      $('[data-real-qr]').innerHTML = qr(tix);
      $('[data-mob-link]').href = '/ticket?e=' + d.ev;
      var f = $('[data-door-frame]'); if (getComputedStyle(f).display !== 'none') f.src = '/door#' + d.ev + '.' + d.key;
    }, function () {});
  }

  function start() {
    hero();
    $$('[data-try]').forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-try'), b); }); });
    var sec = $('#yours');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); real(); } }, { rootMargin: '300px' });
      io.observe(sec);
    } else real();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
