/* moon369.org/lock#<door>.<key>: a lock reader that trusts signatures, not the internet.
   Online once, it saves what it needs: Moon's public keys, the door's PIN secret, hours and time zone, and the
   cancelled stays. After that it checks every pass and PIN on its own:
     QR:  Moon's Ed25519 signature over (door, stay, phone key, window) + now inside the window + the phone's P-256
          signature over the current 30-second code, and not the same code twice.
     PIN: arrival day and nights from the digits, an HMAC with the PIN secret, and now between check-in and check-out.
   Openings are kept here and sent to Moon whenever there is a connection. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); };
  var unb64u = function (s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  var enc = function (s) { return new TextEncoder().encode(s); };
  var door = '', key = '', cfg = null, skew = 0, queue = [], used = {}, pinTries = [], scanning = false, busy = false, stream = null, online = false;
  var now = function () { return Date.now() + skew; };
  var DAY0 = Date.UTC(2026, 0, 1) / 86400000;

  // ---- time in the door's time zone ----
  function tzOff(tz, t) {
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = Number(x.value); });
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  }
  function zoned(tz, dayNum, h) { var dt = new Date((dayNum + DAY0) * 86400000), g = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), h), t = g - tzOff(tz, g); return g - tzOff(tz, t); }
  function today(tz) { var t = now(), loc = t + tzOff(tz, t); return Math.floor(loc / 86400000) - DAY0; }

  // ---- saved setup ----
  function saveCfg() { try { localStorage.setItem('moonLock:' + door, JSON.stringify({ cfg: cfg, skew: skew, synced: cfg.synced })); } catch (e) {} }
  function saveQ() { try { localStorage.setItem('moonLockQ:' + door, JSON.stringify(queue)); } catch (e) {} $('[data-l-q]').textContent = queue.length; }
  function net(on) { online = on; var n = $('[data-l-net]'); n.className = on ? 'on' : 'off'; n.textContent = on ? 'ONLINE' : 'OFFLINE · STILL WORKS'; }
  function sync() {
    var t0 = Date.now();
    return fetch(API + '/v1/stays/' + door + '/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }), cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Error'), { status: r.status }); return j; }); })
      .then(function (j) {
        skew = j.server_ms - (t0 + Date.now()) / 2;   // the clock this reader trusts, corrected whenever it's online
        cfg = { door: j.door, pin_secret: j.pin_secret, keys: j.moon_keys, revoked: j.revoked, code_ms: j.code_ms, code_slack: j.code_slack, synced: new Date().toISOString() };
        saveCfg(); show(); net(true); return flush();
      }, function (e) { if (e && e.status === 403) throw e; net(false); });
  }
  function flush() {
    if (!queue.length) return;
    var batch = queue.slice(0, 200);
    return fetch(API + '/v1/stays/' + door + '/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key, visits: batch }) })
      .then(function (r) { if (!r.ok) throw 0; queue = queue.slice(batch.length); saveQ(); }, function () { net(false); });
  }
  function show() {
    $('[data-l-name]').textContent = cfg.door.name; document.title = cfg.door.name + ' · Lock · Moon';
    $('[data-l-sync]').textContent = new Date(cfg.synced).toLocaleString();
  }

  // ---- results ----
  function result(ok, big, small, extra) {
    var r = $('[data-l-res]'); r.className = 'res ' + (ok ? 'ok' : 'no'); r.hidden = false;
    $('[data-l-rb]').textContent = big; $('[data-l-rs]').textContent = small || ''; $('[data-l-rx]').textContent = extra || '';
    try { if (navigator.vibrate) navigator.vibrate(ok ? 120 : [60, 60, 60]); } catch (e) {}
    clearTimeout(result.t); result.t = setTimeout(function () { r.hidden = true; }, ok ? 4000 : 2800);
    var li = document.createElement('li'); li.className = ok ? 'ok' : 'no'; li.innerHTML = '<span></span><i></i>';
    li.firstChild.textContent = new Date().toLocaleTimeString() + ' · ' + (extra || ''); li.lastChild.textContent = big;
    var log = $('[data-l-log]'); log.insertBefore(li, log.firstChild); while (log.children.length > 20) log.removeChild(log.lastChild);
    // OPEN: on a real door, this is where the reader unlocks the Matter lock or electric strike.
  }
  function opened(v) { queue.push(v); saveQ(); if (online) flush(); }

  // ---- a stay pass, checked offline ----
  function checkQR(text) {
    var m = /stay#([A-Za-z0-9_-]{8,24})\.([A-Za-z0-9_-]{8,24})\.(\d{9,11})\.(\d{9,11})\.([A-Za-z0-9_-]{80,100})\.([0-9a-f]{16})\.([A-Za-z0-9_-]{80,90})\.(\d{1,12})\.([A-Za-z0-9_-]{80,90})/.exec(text || '');
    if (!m) return;
    var d = m[1], s = m[2], nb = Number(m[3]), na = Number(m[4]), pub = m[5], kid = m[6], msig = m[7], w = Number(m[8]), sig = m[9];
    var id = s + '.' + w; if (used[id] && Date.now() - used[id] < 4000) return;   // the same code still in front of the camera
    if (d !== door) return result(false, 'WRONG DOOR', 'This pass is for a different door.');
    var t = now(), cw = Math.floor(t / cfg.code_ms);
    var k = (cfg.keys || []).filter(function (x) { return x.key_id === kid; })[0];
    if (!k) return result(false, 'NOT VALID', 'Not signed by a Moon key this lock knows. Connect it once to update.');
    busy = true;
    crypto.subtle.importKey('raw', unb64u(k.public_key), { name: 'Ed25519' }, false, ['verify'])
      .then(function (pk) { return crypto.subtle.verify({ name: 'Ed25519' }, pk, unb64u(msig), enc(['moon-stay-pass/1', d, s, pub, nb, na].join('\n'))); })
      .then(function (moonOk) {
        if (!moonOk) return result(false, 'NOT VALID', 'Moon didn’t sign this pass.');
        if ((cfg.revoked || []).some(function (r) { return r.stay === s; })) return result(false, 'CANCELLED', 'This stay was cancelled.', s);
        if (t / 1000 < nb - 60) return result(false, 'TOO EARLY', 'This pass opens the door from ' + new Date(nb * 1000).toLocaleString() + '.', s);
        if (t / 1000 > na + 60) return result(false, 'EXPIRED', 'This pass ran out. The guest’s phone renews it whenever it’s online.', s);
        if (Math.abs(cw - w) > cfg.code_slack) return result(false, 'OLD CODE', 'A screenshot, or a phone clock far off. Ask for the live pass.', s);
        if (used[id] && used[id] !== true) return result(false, 'CODE USED', 'This code just opened the door. Wait for the next one.', s);
        return crypto.subtle.importKey('raw', unb64u(pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
          .then(function (ppk) { return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ppk, unb64u(sig), enc('moon-stay-code/1|' + d + '|' + s + '|' + w)); })
          .then(function (ok) {
            if (!ok) return result(false, 'WRONG PHONE', 'This code wasn’t made by the phone this pass belongs to.', s);
            used[id] = Date.now();
            result(true, 'OPEN', 'Welcome. Checked here, with no internet needed.', s);
            opened({ method: 'qr', stay: s, w: w, sig: sig, at: new Date(t).toISOString() });
          });
      })
      .catch(function () { result(false, 'NOT VALID', 'Not a stay pass this lock can read.'); })
      .then(function () { busy = false; });
  }

  // ---- a backup PIN, checked offline ----
  function checkPin(pin) {
    var t = Date.now();
    pinTries = pinTries.filter(function (x) { return t - x < 300000; });
    if (pinTries.length >= 5) return result(false, 'LOCKED', 'Too many wrong PINs. Try again in 5 minutes.');
    if (!/^\d{10}$/.test(pin)) return result(false, 'NOT VALID', 'A backup PIN has 10 digits.');
    var ddd = Number(pin.slice(0, 3)), nights = Number(pin.slice(3, 5)), tz = cfg.door.tz, td = today(tz);
    // The arrival day whose last three digits match: the most recent one, or one coming up (so an early guest hears TOO EARLY).
    var back = td - (((td - ddd) % 1000) + 1000) % 1000, ahead = td + (((ddd - td) % 1000) + 1000) % 1000, arrive;
    if (nights < 1) { pinTries.push(t); return result(false, 'NOT VALID', 'That PIN isn’t right.'); }
    var macOf = function (k, day) { return crypto.subtle.sign('HMAC', k, enc('moon-stay-pin/1|' + door + '|' + day + '|' + nights)).then(function (m) { return String(new DataView(m).getUint32(0) % 100000).padStart(5, '0'); }); };
    crypto.subtle.importKey('raw', unb64u(cfg.pin_secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (k) { return Promise.all([macOf(k, back), macOf(k, ahead)]); })
      .then(function (macs) {
        arrive = macs[0] === pin.slice(5) ? back : macs[1] === pin.slice(5) ? ahead : null;
        if (arrive === null) { pinTries.push(t); return result(false, 'WRONG PIN', 'That PIN isn’t right.'); }
        if ((cfg.revoked || []).some(function (r) { return r.pin_day === arrive && r.nights === nights; })) return result(false, 'CANCELLED', 'This stay was cancelled.');
        var ci = zoned(tz, arrive, cfg.door.checkin_hour), co = zoned(tz, arrive + nights, cfg.door.checkout_hour), n = now();
        if (n < ci - 60000) return result(false, 'TOO EARLY', 'This PIN works from ' + new Date(ci).toLocaleString() + '.');
        if (n > co + 60000) return result(false, 'EXPIRED', 'This PIN ended at check-out.');
        result(true, 'OPEN', 'Welcome. Backup PIN, checked here.', 'PIN');
        opened({ method: 'pin', pin_day: arrive, nights: nights, at: new Date(n).toISOString() });
      });
  }

  // ---- the camera ----
  function scan() {
    var v = $('[data-l-video]'), c = $('[data-l-canvas]'), g = c.getContext('2d', { willReadFrequently: true });
    (function tick() {
      if (!scanning) return;
      if (busy || v.readyState < 2) return setTimeout(tick, 120);
      var k = Math.min(1, 1280 / v.videoWidth), W = Math.round(v.videoWidth * k), H = Math.round(v.videoHeight * k);
      if (c.width !== W) { c.width = W; c.height = H; }
      g.drawImage(v, 0, 0, W, H);
      var code = window.jsQR ? window.jsQR(g.getImageData(0, 0, W, H).data, W, H, { inversionAttempts: 'dontInvert' }) : null;
      if (code) checkQR(code.data);
      setTimeout(tick, 130);
    })();
  }
  function startCam() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (s) {
      stream = s; var v = $('[data-l-video]'); v.srcObject = s; v.play().catch(function () {});
      var tr = s.getVideoTracks()[0], st = tr && tr.getSettings ? tr.getSettings() : {};
      $('[data-l-cam]').classList.toggle('mirror', st.facingMode !== 'environment');
      $('[data-l-camtxt]').hidden = true; $('[data-l-start]').hidden = true;
      if (!scanning) { scanning = true; scan(); }
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
    }).catch(function () { $('[data-l-camtxt]').textContent = 'The reader needs the camera. Allow it in your browser settings, then try again.'; });
  }

  function start() {
    var m = /^#?([A-Za-z0-9_-]{8,24})\.([A-Za-z0-9_-]{16,64})$/.exec(location.hash);
    if (!m) { var e = $('[data-l-msg]'); e.textContent = 'This is a Moon lock reader. Open the lock link from your host page.'; e.hidden = false; return; }
    door = m[1]; key = m[2];
    try { var c = JSON.parse(localStorage.getItem('moonLock:' + door) || 'null'); if (c) { cfg = c.cfg; skew = c.skew || 0; } } catch (x) {}
    try { queue = JSON.parse(localStorage.getItem('moonLockQ:' + door) || '[]'); } catch (x) { queue = []; }
    $('[data-l-start]').addEventListener('click', startCam);
    var pin = '';
    $('[data-l-keys]').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-k');
      if (k === 'clr') pin = ''; else if (k === 'ok') { checkPin(pin); pin = ''; } else if (pin.length < 10) pin += b.textContent;
      $('[data-l-pin]').textContent = pin ? pin.replace(/(\d{3})(\d{0,2})(\d*)/, function (_, a, b2, c2) { return [a, b2, c2].filter(Boolean).join(' '); }) : ' ';
    });
    setInterval(function () { $('[data-l-clock]').textContent = new Date(now()).toLocaleTimeString(); }, 500);
    saveQ();
    var go = function () { $('[data-l-main]').hidden = false; show(); };
    sync().then(function () { if (cfg) go(); else { var e = $('[data-l-msg]'); e.textContent = 'This reader needs a connection once to set up. After that it works offline.'; e.hidden = false; } },
      function (e) { var el = $('[data-l-msg]'); el.textContent = e && e.status === 403 ? 'This lock link has the wrong key.' : 'Could not set up the reader.'; el.hidden = false; });
    if (cfg) go();
    setInterval(sync, 10 * 60000);
    window.addEventListener('online', sync);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
