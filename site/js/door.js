/* moon369.org/door#<event>.<door key>: the organizer's scanner.
   It reads a guest's live code, checks it here first (the ticket is real, the code was made by that ticket's
   phone, and it's from the last few seconds), then asks Moon to check the guest in, once.
   With no signal it still checks codes itself, holds the check-ins, and sends them when it can.
   A code scanned by an ordinary camera lands here too, as /door?c=...: it explains itself and does nothing. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); };
  var T = function (s, v) { if (window.MoonT) return window.MoonT(s, v); return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  var unb64u = function (s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  var ev = '', key = '', base = '/v1/tickets/', pass = false, passback = 0, list = {}, keys = {}, WIN = 5000, SLACK = 3, skew = 0, recent = {}, queue = [], scanning = false, busy = false;
  var now = function () { return Date.now() + skew; };

  function doors() { try { return JSON.parse(localStorage.getItem('moonDoors') || '{}'); } catch (e) { return {}; } }
  function msg(html) { var m = $('[data-d-msg]'); m.innerHTML = html; m.hidden = !html; }
  function saveQ() { try { localStorage.setItem('moonDoorQ:' + ev, JSON.stringify(queue)); } catch (e) {} }

  // ---- the guest list, for checking codes here ----
  function load() {
    var t0 = Date.now();
    // The same door runs an event's tickets or a place's member passes: ask for an event first, then a place.
    return fetch(API + base + ev + '/door', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }), cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Error'), { status: r.status }); return j; }); })
      .then(null, function (e) { if (e && e.status === 404 && base === '/v1/tickets/') { base = '/v1/passes/'; return load(); } throw e; })
      .then(function (j) {
        if (!j || !j.tickets) return;   // the retry already did the work
        skew = j.server_ms - (t0 + Date.now()) / 2; WIN = j.window_ms || WIN; SLACK = j.window_slack || SLACK;
        pass = j.kind === 'pass'; passback = (j.passback_min || 0) * 60000;
        if (pass) { $('[data-d-inl]').textContent = T('TODAY'); $('[data-d-alll]').textContent = T('MEMBERS'); }
        $('[data-d-name]').textContent = j.event.name; document.title = j.event.name + ' · Door · Moon';
        j.tickets.forEach(function (t) { var had = list[t.id]; list[t.id] = t; if (had && had.local_in && (!t.checked_in || had.local_in > t.checked_in)) t.local_in = had.local_in; });
        try { localStorage.setItem('moonDoorList:' + ev, JSON.stringify({ name: j.event.name, tickets: list, skew: skew, base: base, pass: pass, passback: passback })); } catch (e) {}
        counts(); $('[data-d-net]').textContent = T('LIVE');
        flush();
      }).catch(function (e) {
        if (e && e.status === 403) { $('[data-d-main]').hidden = true; msg(T('This door link has the wrong key. Use the door link you got when you made the event or place.')); throw e; }
        $('[data-d-net]').textContent = T('SAVED');
      });
  }
  function counts() {
    var all = 0, inn = 0, today = new Date().toDateString();
    for (var k in list) { all++; var x = list[k], last = x.local_in || x.checked_in; if (pass ? last && new Date(last).toDateString() === today : last) inn++; }
    $('[data-d-in]').textContent = inn.toLocaleString(); $('[data-d-all]').textContent = all.toLocaleString();
  }

  // ---- checking one code ----
  function verifyHere(t, w, sig) {
    if (Math.abs(w - Math.floor(now() / WIN)) > SLACK) return Promise.resolve('stale_code');
    var k = keys[t.id] || (keys[t.id] = crypto.subtle.importKey('raw', unb64u(t.pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
    return k.then(function (pk) {
      return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pk, unb64u(sig), new TextEncoder().encode('moon-ticket-code/1|' + ev + '|' + t.id + '|' + w));
    }).then(function (ok) { return ok ? 'ok' : 'wrong_phone'; }, function () { return 'bad_code'; });
  }
  var WHY = {
    stale_code: 'Old code: a screenshot, or a phone clock far off. Ask to see the live ticket.',
    wrong_phone: 'This code wasn’t made by the phone this ticket belongs to.',
    bad_code: 'Not a valid ticket code.', no_ticket: 'Not a ticket for this event.', other_event: 'This ticket is for a different event.',
    already_in: 'Already checked in', cancelled: 'This membership was cancelled.', no_pass: 'Not a pass for this place.'
  };
  function result(kind, big, name, small) {
    if (pass) {   // the same door words, for a place's member passes
      big = big === T('NO TICKET') ? T('NO PASS') : big === T('WRONG EVENT') ? T('WRONG PLACE') : big;
      small = String(small || '').replace(/\bticket\b/g, 'pass').replace(/\bevent\b/g, 'place');
    }
    var r = $('[data-d-res]'); r.className = 'dr-res ' + kind; r.hidden = false;
    $('[data-d-rb]').textContent = big; $('[data-d-rn]').textContent = name || ''; $('[data-d-rs]').textContent = small || '';
    try { if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : [60, 60, 60]); } catch (e) {}
    clearTimeout(result.t); result.t = setTimeout(function () { r.hidden = true; }, kind === 'ok' ? 1600 : 2600);
    var li = document.createElement('li'); li.className = kind === 'ok' ? 'ok' : 'no';
    li.innerHTML = '<span></span><i></i>'; li.firstChild.textContent = (name || T('Guest')) + ' · ' + new Date().toLocaleTimeString(); li.lastChild.textContent = big;
    var log = $('[data-d-log]'); log.insertBefore(li, log.firstChild); while (log.children.length > 30) log.removeChild(log.lastChild);
  }
  function at(iso) { try { return new Date(iso).toLocaleTimeString(); } catch (e) { return ''; } }
  function handle(text) {
    var m = /[?&]c=([A-Za-z0-9_-]{8,24})\.([A-Za-z0-9_-]{8,24})\.(\d{1,12})\.([A-Za-z0-9_-]{60,100})/.exec(text || '');
    if (!m) return;
    var tid = m[2], w = Number(m[3]), sig = m[4];
    if (recent[tid] && Date.now() - recent[tid] < 4000) return;   // the same ticket held in front of the camera
    recent[tid] = Date.now();
    if (m[1] !== ev) return result('no', T('WRONG EVENT'), '', T(WHY.other_event));
    var t = list[tid];
    if (!t) {   // a ticket issued since the list was last loaded: load it again, then check once more
      if (handle.reloaded === tid) return result('no', T('NO TICKET'), '', T(WHY.no_ticket));
      handle.reloaded = tid; busy = true; delete recent[tid];
      load().then(function () { busy = false; if (list[tid]) handle(text); else result('no', T('NO TICKET'), '', T(WHY.no_ticket)); }, function () { busy = false; result('no', T('NO TICKET'), '', T(WHY.no_ticket)); });
      return;
    }
    var last = t.local_in && (!t.checked_in || t.local_in > t.checked_in) ? t.local_in : t.checked_in;
    if (pass) {
      if (t.cancelled) return result('no', T('CANCELLED'), t.name, T(WHY.cancelled));
      if (t.expires && Date.parse(t.expires) < now()) return result('no', T('EXPIRED'), t.name, T('Membership ended {d}', { d: new Date(t.expires).toLocaleDateString() }));
      if (passback && last && now() - Date.parse(last) < passback) return result('no', T('JUST IN'), t.name, T('This pass came in at {t}. One person per pass.', { t: at(last) }));
    } else if (last) return result('no', T('ALREADY IN'), t.name, T('Checked in at {t}', { t: at(last) }));
    busy = true;
    verifyHere(t, w, sig).then(function (v) {
      if (v !== 'ok') { result('no', v === 'stale_code' ? T('OLD CODE') : T('NOT VALID'), t.name, T(WHY[v])); return; }
      return fetch(API + base + ev + '/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key, ticket: tid, w: w, sig: sig }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          if (j.ok) { t.checked_in = j.checked_in; t.visits = j.visits; counts(); result('ok', T('WELCOME'), t.name, pass ? T('Visit {n} · signed by Moon', { n: j.visits }) : T('Checked in · signed by Moon')); }
          else {
            if (j.checked_in) t.checked_in = j.checked_in; if (j.last_visit) t.checked_in = j.last_visit; counts();
            var BIG = { already_in: 'ALREADY IN', stale_code: 'OLD CODE', just_in: 'JUST IN', cancelled: 'CANCELLED', expired: 'EXPIRED' };
            result('no', T(BIG[j.reason] || 'NOT VALID'), t.name, j.reason === 'already_in' ? T('Checked in at {t}', { t: at(j.checked_in) }) : j.reason === 'just_in' ? T('This pass came in at {t}. One person per pass.', { t: at(j.last_visit) }) : T(WHY[j.reason] || j.message || ''));
          }
        }, function () {
          // No signal: the code checked out here, so let them in and send it when the door is back online.
          t.local_in = new Date().toISOString(); queue.push({ ticket: tid, w: w, sig: sig, at: t.local_in, base: base }); saveQ(); counts();
          result('ok', T('WELCOME'), t.name, T('Checked here. It reaches Moon when the signal is back.'));
        });
    }).then(function () { busy = false; }, function () { busy = false; });
  }
  // Check-ins made with no signal go to Moon when it's back, marked late: Moon checks the phone's signature
  // and accepts a code up to a day old, because the door already checked it when it was fresh.
  function flush() {
    if (!queue.length) return;
    var q = queue.slice(); queue = []; saveQ();
    q.forEach(function (x) {
      fetch(API + (x.base || base) + ev + '/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key, ticket: x.ticket, w: x.w, sig: x.sig, late: true }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.ok && list[x.ticket]) list[x.ticket].checked_in = j.checked_in; }, function () { queue.push(x); saveQ(); });
    });
  }

  // ---- the camera ----
  function scan() {
    var v = $('[data-d-video]'), c = $('[data-d-canvas]'), g = c.getContext('2d', { willReadFrequently: true }), bd = null;
    try { if ('BarcodeDetector' in window) bd = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { bd = null; }
    (function tick() {
      if (!scanning) return;
      if (busy || v.readyState < 2) return setTimeout(tick, 120);
      if (bd) { bd.detect(v).then(function (r) { if (r && r[0]) handle(r[0].rawValue); }, function () {}).then(function () { setTimeout(tick, 110); }); return; }
      // The whole frame, at up to 1280 wide: the ticket's dotted code needs the detail to read reliably.
      var k = Math.min(1, 1280 / v.videoWidth), W = Math.round(v.videoWidth * k), H = Math.round(v.videoHeight * k);
      if (c.width !== W) { c.width = W; c.height = H; }
      g.drawImage(v, 0, 0, W, H);
      var code = window.jsQR ? window.jsQR(g.getImageData(0, 0, W, H).data, W, H, { inversionAttempts: 'dontInvert' }) : null;
      if (code) handle(code.data);
      setTimeout(tick, 130);
    })();
  }
  // The camera: the back one on a phone, or the one picked from the list (remembered on this device).
  var stream = null;
  function savedCam() { try { return localStorage.getItem('moonDoorCam') || ''; } catch (e) { return ''; } }
  function startCam(id) {
    var b = $('[data-d-start]');
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    id = id || savedCam();
    var video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (id) video.deviceId = { exact: id }; else video.facingMode = { ideal: 'environment' };
    navigator.mediaDevices.getUserMedia({ video: video, audio: false }).then(function (s) {
      stream = s;
      var v = $('[data-d-video]'); v.srcObject = s; v.play().catch(function () {});
      var tr = s.getVideoTracks()[0], st = tr && tr.getSettings ? tr.getSettings() : {};
      // A camera facing you (a laptop's, or a phone's front one) shows like a mirror, so holding a ticket up is natural.
      $('.dr-cam').classList.toggle('mirror', st.facingMode !== 'environment');
      $('[data-d-camtxt]').hidden = true; b.hidden = true;
      if (!scanning) { scanning = true; scan(); }
      cams(st.deviceId);
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
    }).catch(function () {
      if (id) { try { localStorage.removeItem('moonDoorCam'); } catch (e) {} return startCam(''); }   // the saved camera is gone: use the default
      $('[data-d-camtxt]').hidden = false;
      $('[data-d-camtxt]').textContent = T('Moon needs the camera to scan tickets. Allow it in your browser settings, then try again.');
    });
  }
  function cams(current) {
    if (!navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var vs = ds.filter(function (d) { return d.kind === 'videoinput'; }), sel = $('[data-d-cam]');
      $('[data-d-camrow]').hidden = vs.length < 2;
      sel.innerHTML = '';
      vs.forEach(function (d, i) { var o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || T('Camera {n}', { n: i + 1 }); if (d.deviceId === current) o.selected = true; sel.appendChild(o); });
    }, function () {});
  }

  function start() {
    var q = new URLSearchParams(location.search), h = location.hash.replace(/^#/, ''), m = /^([A-Za-z0-9_-]{8,24})\.([A-Za-z0-9_-]{16,64})$/.exec(h);
    if (m) {
      ev = m[1]; key = m[2];
      var d = doors(); d[ev] = key; try { localStorage.setItem('moonDoors', JSON.stringify(d)); localStorage.setItem('moonDoorLast', ev); } catch (e) {}
    } else {
      var d2 = doors(), last = null; try { last = localStorage.getItem('moonDoorLast'); } catch (e) {}
      if (last && d2[last]) { ev = last; key = d2[last]; }
    }
    if (!ev) {
      msg(q.get('c') ? T('This is a live Moon ticket code. Only the event’s door can check it in, so there’s nothing to do here.')
        : T('This is the door for a Moon event. Open the door link the organizer got when they made the event.'));
      return;
    }
    if (q.get('c')) history.replaceState(null, '', '/door#' + ev + '.' + key);   // a code opened in the door's own browser: just scan
    $('[data-d-main]').hidden = false;
    try { var cached = JSON.parse(localStorage.getItem('moonDoorList:' + ev) || 'null'); if (cached) { list = cached.tickets || {}; skew = cached.skew || 0; base = cached.base || base; pass = !!cached.pass; passback = cached.passback || 0; $('[data-d-name]').textContent = cached.name; if (pass) { $('[data-d-inl]').textContent = T('TODAY'); $('[data-d-alll]').textContent = T('MEMBERS'); } counts(); } } catch (e) {}
    try { queue = JSON.parse(localStorage.getItem('moonDoorQ:' + ev) || '[]'); } catch (e) { queue = []; }
    $('[data-d-start]').addEventListener('click', function () { startCam(); });
    $('[data-d-cam]').addEventListener('change', function () { var id = this.value; try { localStorage.setItem('moonDoorCam', id); } catch (e) {} startCam(id); });
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', function () { if (stream) cams(savedCam()); });
    load().then(function () { setInterval(load, 15000); }, function () { setInterval(load, 15000); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
