/* moon369.org/stays: Moon Stays with the real thing. The page makes a real door, a real booking and a real pass
   (this browser plays the guest's phone), and runs the same offline checks a lock runs, with its internet on or off. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var b64u = function (buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var unb64u = function (s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  var enc = function (s) { return new TextEncoder().encode(s); };
  var CODE = 30000, skew = 0, now = function () { return Date.now() + skew; };
  var ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };
  var qr = function (url) { return window.MoonQR ? MoonQR.svg(url, 0, { square: true, level: 'M' }) : ''; };
  var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803, p2 = function (n, w) { return String(n).padStart(w || 2, '0'); };
  function mm(ms) {
    var s = (ms - EPOCH) / SEC, whole = Math.floor(s), frac = s - whole, da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - Math.ceil(mi * 369 / 13) + 1, sd = whole - da * 86400, n9 = p2(Math.floor(frac * 1e9), 9);
    return y + '.' + p2(mi + 1) + '.' + p2(d) + ' ' + p2(Math.floor(sd / 3600)) + ':' + p2(Math.floor(sd % 3600 / 60)) + ':' + p2(sd % 60) + '.' + n9.slice(0, 3) + ' ' + n9.slice(3, 6) + ' ' + n9.slice(6);
  }
  var iso = function (ms) { var d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  var short = function (ms) { try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(ms); } catch (e) { return new Date(ms).toLocaleString(); } };

  // ---- the hero: a pass signed by a key this browser makes ----
  function hero() {
    var box = $('[data-hero-qr]'); if (!box || !crypto.subtle) return;
    var d0 = new Date(); d0.setHours(15, 0, 0, 0); var d1 = new Date(d0.getTime() + 2 * 86400000); d1.setHours(11, 0, 0, 0);
    $('[data-hero-in]').textContent = short(d0); $('[data-hero-out]').textContent = short(d1);
    var lastW = -1, key = null, pub = '';
    crypto.subtle.generateKey(ALG, true, ['sign', 'verify']).then(function (k) { key = k.privateKey; return crypto.subtle.exportKey('raw', k.publicKey); }).then(function (r) { pub = b64u(r); });
    (function tick() {
      var t = now(), w = Math.floor(t / CODE);
      $('[data-hero-bar]').style.transform = 'scaleX(' + (1 - (t % CODE) / CODE).toFixed(3) + ')';
      $('[data-hero-clock]').textContent = mm(t);
      if (key && pub && w !== lastW) {
        lastW = w;
        crypto.subtle.sign(SIG, key, enc('moon-stay-code/1|Cabin1Door01|AveryStay001|' + w)).then(function (sig) {
          box.innerHTML = qr('https://moon369.org/stay#' + ['Cabin1Door01', 'AveryStay001', Math.floor(d0 / 1000), Math.floor(d1 / 1000), pub, '8efd3211b23533ed', b64u(sig).slice(0, 86), w, b64u(sig)].join('.'));
        });
      }
      requestAnimationFrame(tick);
    })();
  }

  // ---- a real door, booking and pass ----
  var D = '', K = '', stay = null, pass = null, pin = '', pub = '', gkey = null, cfg = null, online = true, used = {}, last = null, busy = false;
  function api(path, body) {
    var t0 = Date.now();
    return fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (j.server_ms) skew = j.server_ms - (t0 + Date.now()) / 2; if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Error ' + r.status), { status: r.status }); return j; }); });
  }
  function lockSync() { return api('/v1/stays/' + D + '/lock', { key: K }).then(function (j) { cfg = { door: j.door, pin_secret: j.pin_secret, keys: j.moon_keys, revoked: j.revoked, code_ms: j.code_ms, code_slack: j.code_slack }; }); }
  function setup() {
    var t = Date.now();
    return api('/v1/stays', { name: 'Cabin 1 · Moon stays demo', tz: tz })
      .then(function (j) { D = j.door.id; K = j.key; return api('/v1/stays/' + D + '/book', { key: K, guest: 'Avery', arrive: iso(t - 86400000), depart: iso(t + 2 * 86400000) }); })
      .then(function (j) { stay = j.stay; pin = j.pin; return crypto.subtle.generateKey(ALG, false, ['sign', 'verify']).then(function (k) { gkey = k.privateKey; return crypto.subtle.exportKey('raw', k.publicKey); }).then(function (raw) { pub = b64u(raw); return api('/v1/stays/' + D + '/join', { invite: new URL(j.link).searchParams.get('i'), pub: pub }); }); })
      .then(function (j) { pass = j.pass; return lockSync(); })
      .then(function () {
        $('[data-pin-v]').textContent = pin.slice(0, 3) + ' ' + pin.slice(3, 5) + ' ' + pin.slice(5);
        $$('[data-try]').forEach(function (b) { if (b.getAttribute('data-try') !== 'again') b.disabled = false; });
        phone();
      }).catch(function (e) { $('[data-g-qr]').innerHTML = '<span>' + ((e && e.message) || 'Could not reach Moon') + '</span>'; });
  }
  function payloadFor(w) {
    return crypto.subtle.sign(SIG, gkey, enc('moon-stay-code/1|' + D + '|' + stay.id + '|' + w)).then(function (sig) {
      return 'https://moon369.org/stay#' + [D, stay.id, pass.nb, pass.na, pub, pass.key_id, pass.sig, w, b64u(sig)].join('.');
    });
  }
  var lastW = -1, curPayload = '';
  // A code the lock hasn't seen yet: the current one, or the one just before it (both are fresh enough).
  function fresh() { var w = Math.floor(now() / CODE); return payloadFor(used[stay.id + '.' + w] ? w - 1 : w); }
  function phone() {
    (function tick() {
      var t = now(), w = Math.floor(t / CODE);
      $('[data-g-bar]').style.transform = 'scaleX(' + (1 - (t % CODE) / CODE).toFixed(3) + ')';
      $('[data-g-secs]').textContent = 'NEW CODE IN ' + Math.ceil((CODE - t % CODE) / 1000) + 'S';
      if (w !== lastW) { lastW = w; payloadFor(w).then(function (p) { curPayload = p; $('[data-g-qr]').innerHTML = qr(p); }); }
      requestAnimationFrame(tick);
    })();
  }

  // ---- the lock: the same checks moon369.org/lock runs, with no internet ----
  function check(text) {
    var m = /stay#([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]+)\.([0-9a-f]{16})\.([A-Za-z0-9_-]+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(text);
    var d = m[1], s = m[2], nb = +m[3], na = +m[4], pk = m[5], kid = m[6], msig = m[7], w = +m[8], sig = m[9], t = now(), cw = Math.floor(t / cfg.code_ms);
    var log = { internet: online ? 'on' : 'off, not needed', door: d === D ? 'this door' : 'other door' };
    var k = cfg.keys.filter(function (x) { return x.key_id === kid; })[0];
    return crypto.subtle.importKey('raw', unb64u(k.public_key), { name: 'Ed25519' }, false, ['verify'])
      .then(function (mk) { return crypto.subtle.verify({ name: 'Ed25519' }, mk, unb64u(msig), enc(['moon-stay-pass/1', d, s, pk, nb, na].join('\n'))); })
      .then(function (ok) {
        log.moon_signature = ok ? 'valid (Ed25519, key ' + kid + ')' : 'invalid';
        if (!ok) return { ok: false, big: 'NOT VALID', small: 'Moon didn’t sign this pass.', log: log };
        log.cancelled_list = cfg.revoked.some(function (r) { return r.stay === s; }) ? 'listed' : 'not listed' + (online ? '' : ' (as of the last sync)');
        if (log.cancelled_list === 'listed') return { ok: false, big: 'CANCELLED', small: 'The host cancelled this stay, and the lock heard at its last sync.', log: log };
        log.window = new Date(nb * 1000).toLocaleString() + ' → ' + new Date(na * 1000).toLocaleString();
        if (t / 1000 < nb - 60 || t / 1000 > na + 60) return { ok: false, big: 'OUTSIDE THE STAY', small: 'This pass only works between check-in and check-out.', log: log };
        log.code_age_s = Math.round((t - w * cfg.code_ms) / 1000);
        if (Math.abs(cw - w) > cfg.code_slack) return { ok: false, big: 'OLD CODE', small: 'This code is ' + Math.round(log.code_age_s / 60) + ' minutes old. Only the guest’s phone can make the current one, so a screenshot is useless.', log: log };
        if (used[s + '.' + w]) { log.code = 'already opened the door'; return { ok: false, big: 'CODE USED', small: 'Each code opens the door once. The next one needs the guest’s phone.', log: log }; }
        return crypto.subtle.importKey('raw', unb64u(pk), ALG, false, ['verify'])
          .then(function (ppk) { return crypto.subtle.verify(SIG, ppk, unb64u(sig), enc('moon-stay-code/1|' + d + '|' + s + '|' + w)); })
          .then(function (good) {
            log.phone_signature = good ? 'valid (P-256)' : 'invalid';
            if (!good) return { ok: false, big: 'WRONG PHONE', small: 'This code wasn’t made by the phone this pass belongs to.', log: log };
            used[s + '.' + w] = true;
            if (online) api('/v1/stays/' + D + '/log', { key: K, visits: [{ method: 'qr', stay: s, w: w, sig: sig, at: new Date(t).toISOString() }] }).catch(function () {});
            return { ok: true, big: 'OPEN', small: online ? 'Welcome, Avery. The lock checked it all itself, and logged the opening with Moon.' : 'Welcome, Avery. Checked with no internet at all. The opening goes to Moon when the lock is back online.', log: log };
          });
      });
  }
  var DAY0 = Date.UTC(2026, 0, 1) / 86400000;
  function tzOff(z, t) { var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = +x.value; }); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; }
  function zoned(z, day, h) { var dt = new Date((day + DAY0) * 86400000), g = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), h), t = g - tzOff(z, g); return g - tzOff(z, t); }
  function checkPin(p) {
    var z = cfg.door.tz, t = now(), td = Math.floor((t + tzOff(z, t)) / 86400000) - DAY0, ddd = +p.slice(0, 3), nights = +p.slice(3, 5);
    var arrive = td - (((td - ddd) % 1000) + 1000) % 1000;
    return crypto.subtle.importKey('raw', unb64u(cfg.pin_secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (k) { return crypto.subtle.sign('HMAC', k, enc('moon-stay-pin/1|' + D + '|' + arrive + '|' + nights)); })
      .then(function (mac) {
        var ok = String(new DataView(mac).getUint32(0) % 100000).padStart(5, '0') === p.slice(5), ci = zoned(z, arrive, cfg.door.checkin_hour), co = zoned(z, arrive + nights, cfg.door.checkout_hour);
        var log = { internet: online ? 'on' : 'off, not needed', pin: 'arrival day ' + arrive + ', ' + nights + ' nights', hmac: ok ? 'matches the door’s secret' : 'wrong', window: new Date(ci).toLocaleString() + ' → ' + new Date(co).toLocaleString() };
        if (!ok) return { ok: false, big: 'WRONG PIN', small: 'That PIN isn’t right.', log: log };
        if (cfg.revoked.some(function (r) { return r.pin_day === arrive && r.nights === nights; })) return { ok: false, big: 'CANCELLED', small: 'This stay was cancelled.', log: log };
        if (t < ci - 60000 || t > co + 60000) return { ok: false, big: 'OUTSIDE THE STAY', small: 'This PIN only works between check-in and check-out.', log: log };
        if (online) api('/v1/stays/' + D + '/log', { key: K, visits: [{ method: 'pin', pin_day: arrive, nights: nights, at: new Date(t).toISOString() }] }).catch(function () {});
        return { ok: true, big: 'OPEN', small: 'The lock worked the PIN out itself from the dates and its secret. No internet, no phone.', log: log };
      });
  }
  function show(r) {
    var el = $('[data-res]'); el.className = 'tp-res ' + (r.ok ? 'ok' : r.wait ? 'wait' : 'no');
    el.innerHTML = '<b></b><span></span>'; el.firstChild.textContent = r.big; el.lastChild.textContent = r.small || '';
    if (r.log) $('[data-json]').textContent = '// what the lock checked\n' + JSON.stringify(r.log, null, 2);
  }
  function run(which, btn) {
    if (busy || !cfg) return; busy = true; btn.classList.add('done'); $('[data-pin]').hidden = which !== 'pin';
    if (window.innerWidth < 900) { try { $('.tp-door').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    var go;
    if (which === 'scan') go = fresh().then(function (p) { last = p; return check(p); }).then(function (r) { if (r.ok) $('[data-try="again"]').disabled = false; return r; });
    else if (which === 'again') go = check(last || curPayload);
    else if (which === 'shot') go = payloadFor(Math.floor(now() / CODE) - 4).then(check);   // the code the phone showed two minutes ago
    else if (which === 'pin') go = checkPin(pin);
    else go = api('/v1/stays/' + D + '/cancel', { key: K, stay: stay.id }).then(function () { return online ? lockSync() : null; }).then(fresh).then(check).then(function (r) {
      if (r.ok && !online) { r.ok = false; r.wait = true; r.big = 'STILL OPENS'; r.small = 'The lock is offline, so it hasn’t heard about the cancellation. It refuses the stay at its next sync, and the guest’s pass can’t renew past tomorrow. Turn the internet back on and scan again.'; btn.disabled = false; btn.classList.remove('done'); }
      return r;
    });
    go.then(show, function (e) { show({ ok: false, big: 'NO CONNECTION', small: (e && e.message) || 'Could not reach Moon.' }); btn.classList.remove('done'); })
      .then(function () { busy = false; });
  }
  function toggleNet() {
    online = !online;
    var b = $('[data-net]'); b.setAttribute('aria-pressed', String(online)); $('[data-net-l]').textContent = online ? 'ONLINE' : 'OFFLINE';
    if (online && D) lockSync().then(function () { show({ ok: true, big: 'BACK ONLINE', small: 'The lock synced: Moon’s keys, the PIN secret and the cancelled stays.' }); }, function () {});
    else show({ ok: true, big: 'OFFLINE', small: 'The lock has no internet now. Try any move: it still decides on its own.' });
  }

  function start() {
    hero();
    $$('[data-try]').forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-try'), b); }); });
    $('[data-net]').addEventListener('click', toggleNet);
    var started = false, go = function () { if (!started) { started = true; setup(); } };
    if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); } }, { rootMargin: '400px' }); io.observe($('#try')); } else go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
