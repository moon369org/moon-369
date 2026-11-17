/* Moon app (/app): three screens.
   NOW     Moon time and the live moon, computed on the device so it works offline, and "Share this moment".
   NIGHTS  The moon on any date (a birthday, the night you met), saved on the device for offline.
   EVENTS  One link for a future moment that opens in everyone's own time, with QR and a countdown embed.
   Nothing is sent anywhere except the share card images, fetched from Moon's API when online. */
(function () {
  var EPOCH = -62165308562978.61, K = 1.0403730490216803, SEC = 1000 * K;
  var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
  var firstDay = function (m) { return Math.ceil(m * 369 / 13); };
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var API = 'https://api.moon369.org';

  function moon(ms) {
    var t = ms - EPOCH, s = t / SEC, whole = Math.floor(s), frac = s - whole, da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - firstDay(mi) + 1, sd = whole - da * 86400;
    return { y: y, m: mi + 1, d: d, h: Math.floor(sd / 3600), mi: Math.floor(sd % 3600 / 60), s: sd % 60, f: frac };
  }
  var text = function (k) { return k.y + '.' + p(k.m) + '.' + p(k.d) + ' ' + p(k.h) + ':' + p(k.mi) + ':' + p(k.s); };
  var path = function (k) { return k.y + '.' + p(k.m) + '.' + p(k.d) + '-' + p(k.h) + '.' + p(k.mi) + '.' + p(k.s); };
  // A moment's link: the Moonmark, to the second, with an optional name. It opens in each person's own time.
  function link(ms, name) { return 'https://moon369.org/m/' + path(moon(Math.floor(ms / 1000) * 1000 + 1)) + (name ? '?e=' + encodeURIComponent(name).replace(/%20/g, '+') : ''); }
  function localStr(ms, opts) { try { return new Intl.DateTimeFormat(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(ms); } catch (e) { return new Date(ms).toString(); } }
  function buzz() { try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }
  function toast(t) { var el = $('[data-app-toast]'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2400); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || '[]'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return []; } }

  // ---------- NOW ----------
  var lastSec = -1;
  function tick() {
    var now = Date.now(), k = moon(now), P = window.MoonPhase;
    $('[data-app-clock]').innerHTML = p(k.h) + ':' + p(k.mi) + ':' + p(k.s) + '<small>.' + p(Math.floor(k.f * 1000), 3) + '</small>';
    if (k.s !== lastSec) {
      lastSec = k.s;
      $('[data-app-date]').textContent = k.y + '.' + p(k.m) + '.' + p(k.d);
      if (P) { var f = P.fraction(now); $('[data-app-meta]').innerHTML = esc(P.name(f)) + ' · ' + Math.round(P.illumination(now) * 100) + '% lit · Lune ' + k.d + '<span class="lt1">Your local time: ' + esc(localStr(now)) + '</span>'; }
    }
    requestAnimationFrame(tick);
  }

  function list(key, el, title, row) {
    var r = store(key), box = $(el); if (!r.length) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '<div class="k" style="text-align:left;margin-bottom:6px">' + title + '</div>' + r.map(row).join('');
  }
  function remember(key, item, same) { var r = store(key).filter(function (x) { return !same(x); }); r.unshift(item); store(key, r.slice(0, key === 'moonMoments' ? 500 : 12)); }
  // Your moments, with an Edit mode: removing one only clears it from this phone. The proof stays on Moon.
  var editing = false;
  function showMoments() {
    var r = store('moonMoments'), box = $('[data-app-recent]');
    if (!r.length) { box.hidden = true; editing = false; return; }
    box.hidden = false;
    box.innerHTML = '<div class="rh"><span class="k">YOUR MOMENTS</span><button type="button" class="ed" data-m-edit>' + (editing ? 'DONE' : 'EDIT') + '</button></div>' +
      (editing ? '<div class="enote2">Removing a moment only clears it from this phone. The proof stays on Moon and its link still works.</div>' : '') +
      r.map(function (x, i) {
        var row = '<a class="' + (x.sha ? 'ph' : '') + '" href="' + esc(x.url) + '"><span class="nm">' + (x.sha ? '<img alt="" data-thumb="' + esc(x.sha) + '">' : '') + '<span>' + esc(x.name || (x.sha ? 'A photo' : 'A moment')) + '</span></span><span>' + esc(text(moon(x.ms + 1))) + '</span></a>';
        return editing ? '<div class="mrow">' + row + '<button type="button" class="rm" data-m-rm="' + i + '" aria-label="Remove from this phone">✕</button></div>' : row;
      }).join('');
    $$('[data-thumb]').forEach(function (im) { getThumb(im.getAttribute('data-thumb')).then(function (b) { if (b) im.src = URL.createObjectURL(b); }); });
  }
  function removeMoment(i) {
    var r = store('moonMoments'), x = r[i]; if (!x) return;
    r.splice(i, 1); store('moonMoments', r);
    if (x.sha && !r.some(function (y) { return y.sha === x.sha; })) delThumb(x.sha);
    if (!r.length) editing = false;
    showMoments(); buzz(); toast('Removed from this phone. The proof stays on Moon.');
  }

  // ---------- photos: kept on this phone only ----------
  // A small preview of each photo lives in this app's own storage on the phone. The photo itself stays in
  // the phone's library; Moon only ever gets its fingerprint (and its look-alike hash).
  var DB = null;
  function idb() {
    return DB || (DB = new Promise(function (ok, no) {
      if (!window.indexedDB) return no(); var r = indexedDB.open('moon-app', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('thumbs'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
    }));
  }
  function putThumb(k, b) { return idb().then(function (db) { return new Promise(function (ok) { var t = db.transaction('thumbs', 'readwrite'); t.objectStore('thumbs').put(b, k); t.oncomplete = ok; t.onerror = ok; }); }).catch(function () {}); }
  function delThumb(k) { return idb().then(function (db) { db.transaction('thumbs', 'readwrite').objectStore('thumbs').delete(k); }).catch(function () {}); }
  function getThumb(k) { return idb().then(function (db) { return new Promise(function (ok) { var q = db.transaction('thumbs').objectStore('thumbs').get(k); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); }
  function thumbOf(file, size) {
    return new Promise(function (ok) {
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () {
        var k = Math.min(1, size / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(function (b) { ok(b); }, 'image/jpeg', 0.82);
      };
      im.onerror = function () { URL.revokeObjectURL(u); ok(null); };
      im.src = u;
    });
  }
  var sealReady = null;
  function lookAlike(file) {
    sealReady = sealReady || new Promise(function (ok, no) { if (window.MoonSeal) return ok(); var sc = document.createElement('script'); sc.src = '/js/seal.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    return sealReady.then(function () { return window.MoonSeal.dhash(file); }).catch(function () { return null; });
  }
  function pickPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) { toast('Pick a photo'); return; }
    cur.photo = file;
    thumbOf(file, 240).then(function (b) { cur.thumb = b; if (b) $('[data-sheet-pv-img]').src = URL.createObjectURL(b); });
    $('[data-sheet-pv]').hidden = false; $('[data-sheet-pick]').hidden = true; buzz();
  }
  function clearPhoto() { if (cur) { cur.photo = null; cur.thumb = null; } $('[data-sheet-pv-img]').removeAttribute('src'); $('[data-sheet-pv]').hidden = true; $('[data-sheet-pick]').hidden = cur && cur.kind === 'event'; $('[data-sheet-photo]').value = ''; }
  // Sign the photo: its fingerprint, at this moment. The signed link proves the photo existed by then.
  function signPhoto(file) {
    return file.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (d) {
      var sha = Array.from(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
      return lookAlike(file).then(function (ph) {
        var body = { sha256: sha }; if (ph) body.phash = ph;
        return fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }).then(function (r) { return r.json().then(function (b) { if (!r.ok || !b.signed_url) throw new Error((b.error && b.error.message) || 'Moon could not sign it'); return { sha: sha, url: b.signed_url, ms: Number(BigInt(b.receipt.unix_ns) / 1000000n) }; }); });
    });
  }

  // ---------- the share sheet: name it, create it, then it's ready to share ----------
  // Nothing is posted anywhere: the link itself carries the Moonmark and the name, so it works the moment it's made.
  var cur = null, made = null;   // cur: { ms, kind }; made: { url, name, mark }
  function step(which) { $$('[data-step]').forEach(function (s) { s.hidden = s.getAttribute('data-step') !== which; }); }
  function openSheet(kind, ms, name) {
    cur = { ms: Math.floor(ms / 1000) * 1000, kind: kind }; made = null;
    $('[data-sheet-h]').textContent = kind === 'event' ? 'NEW EVENT' : 'SHARE THIS MOMENT';
    $('[data-sheet-create]').textContent = kind === 'event' ? 'CREATE EVENT' : 'MARK IT';
    $('[data-sheet-name]').classList.toggle('short', kind === 'event'); $('[data-sheet-name]').maxLength = kind === 'event' ? 80 : 280;
    $('[data-sheet-name]').value = name || ''; $('[data-sheet-name]').placeholder = kind === 'event' ? 'Name the event' : "What's happening? (optional)";
    $('[data-sheet-mk]').textContent = 'Moonmark ' + text(moon(cur.ms + 1));
    $('[data-sheet-lt]').textContent = localStr(cur.ms, { dateStyle: 'full', timeStyle: 'short' }) + ' your time.';
    $('[data-sheet-close]').textContent = 'CANCEL';
    clearPhoto(); $('[data-ready-photo]').hidden = true;
    step('name'); $('[data-app-sheet]').hidden = false; buzz();
    if (kind === 'event' && name) create(); else setTimeout(function () { $('[data-sheet-name]').focus(); }, 60);
  }
  function closeSheet() { $('[data-app-sheet]').hidden = true; }
  var signing = false;
  function create() {
    var name = $('[data-sheet-name]').value.replace(/\s+/g, ' ').trim().slice(0, cur.kind === 'event' ? 80 : 280);
    if (cur.kind === 'event' && !name) { toast('Name the event first'); $('[data-sheet-name]').focus(); return; }
    if (cur.kind !== 'event' && cur.photo) {
      if (signing) return; signing = true;
      var btn = $('[data-sheet-create]'); btn.textContent = 'SIGNING THE PHOTO…'; btn.disabled = true;
      var c0 = cur;
      signPhoto(cur.photo).then(function (s) {
        if (cur !== c0) return;
        cur.ms = Math.floor(s.ms / 1000) * 1000;
        var url = s.url + (name ? '&e=' + encodeURIComponent(name).replace(/%20/g, '+') : '');
        if (cur.thumb) putThumb(s.sha, cur.thumb);
        try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
        finish(name, url, { ms: s.ms, name: name, url: url, sha: s.sha });
      }).catch(function (e) {
        toast(navigator.onLine === false ? 'Signing a photo needs a connection' : (e && e.message) || 'Moon could not sign it. Try again.');
      }).then(function () { signing = false; btn.disabled = false; btn.textContent = 'MARK IT'; });
      return;
    }
    finish(name, link(cur.ms, name), null);
  }
  function finish(name, url, it) {
    it = it || { ms: cur.ms, name: name, url: url };
    if (cur.kind === 'event') { remember('moonEvents', it, function (x) { return x.url === url; }); showEvents(); }
    else { remember('moonMoments', it, function (x) { return x.url === url; }); showMoments(); }
    made = { url: url, name: name, mark: text(moon(cur.ms + 1)), photo: it.sha ? cur.photo : null };
    var rp = $('[data-ready-photo]'); if (made.photo && cur.thumb) { rp.src = URL.createObjectURL(cur.thumb); rp.hidden = false; } else rp.hidden = true;
    $('[data-ready-h]').textContent = cur.kind === 'event' ? 'YOUR EVENT IS READY' : 'YOUR MOMENT IS READY';
    $('[data-ready-name]').textContent = name;
    $('[data-ready-mk]').textContent = 'Moonmark ' + made.mark;
    $('[data-ready-lt]').textContent = localStr(cur.ms, { dateStyle: 'full', timeStyle: 'short' }) + ' your time.';
    $('[data-ready-link]').value = url;
    var box = $('[data-sheet-qrbox]'); try { box.innerHTML = window.MoonQR.svg(url, window.MoonPhase.fraction(cur.ms)); box.hidden = false; } catch (e) { box.hidden = true; }
    $('[data-sheet-embed]').hidden = cur.kind !== 'event';
    $('[data-sheet-close]').textContent = 'DONE';
    step('ready'); buzz();
  }
  var AFTER = 'Anyone who opens it can find their own moon.';
  function share() {
    if (!made) return; buzz();
    var msg = (made.name ? made.name + ': ' : '') + 'Moonmark ' + made.mark + '. Opens in your own time:';
    // With a photo, send the photo itself along with the signed link: friends see the picture, and anyone can
    // check it by dropping it on moon369.org/verify.
    if (made.photo && navigator.canShare && navigator.canShare({ files: [made.photo] })) {
      navigator.share({ files: [made.photo], title: made.name || 'A moment on Moon', text: msg + ' ' + made.url }).then(function () { toast('Shared. ' + AFTER); }, function () {});
      return;
    }
    if (navigator.share) navigator.share({ title: made.name || 'A moment on Moon', text: msg, url: made.url }).then(function () { toast('Shared. ' + AFTER); }, function () {});
    else copy();
  }
  function xHref() { return made ? 'https://x.com/intent/post?text=' + encodeURIComponent((made.name ? made.name + ': ' : '') + 'Moonmark ' + made.mark + '. Opens in your own time.') + '&url=' + encodeURIComponent(made.url) : 'https://x.com'; }
  function copy() {
    if (!made) return;
    (navigator.clipboard ? navigator.clipboard.writeText(made.url) : Promise.reject()).then(function () { toast('Link copied. ' + AFTER); }, function () { prompt('Copy this link', made.url); });
  }
  function card() {
    if (!made) return;
    var q = 'moonmark=' + encodeURIComponent(path(moon(cur.ms + 1)) + '.000000000') + (made.name ? '&event=' + encodeURIComponent(made.name) : '&qr=1') + '&v=3';
    shareImage(API + '/v1/card.png?' + q, 'moon-' + path(moon(cur.ms + 1)) + '.png', made.url);
  }
  function embed() {
    if (!made) return;
    var code = '<div data-moon-countdown="' + path(moon(cur.ms + 1)) + '.000000000" data-name="' + esc(made.name) + '"></div>\n<script src="https://moon369.org/embed/countdown.js" async></script>';
    (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { toast('Countdown embed copied'); }, function () { prompt('Copy this embed code', code); });
  }
  function shareImage(url, name, link) {
    fetch(url).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
      var file = new File([b], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: link }).then(function () { toast(AFTER); }, function () {});
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); toast('Card saved. ' + AFTER);
    }).catch(function () { toast('The card needs a connection'); });
  }

  // ---------- NIGHTS ----------
  var occasion = 'born', TITLES = { day: 'THE MOON ON', born: 'THE MOON WHEN I WAS BORN', met: 'THE MOON WHEN WE MET', wed: 'THE MOON ON OUR WEDDING DAY', kid: 'THE MOON WHEN MY CHILD WAS BORN' };
  var LABEL = { day: 'A day', born: 'I was born', met: 'We met', wed: 'Our wedding', kid: 'My child was born' };
  var MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  var night = null;
  function nightQuery(n) { var o = n.z, a = Math.abs(o); return 'd=' + n.d + (n.t ? '&t=' + n.t.replace(':', '') : '') + '&z=' + encodeURIComponent((o < 0 ? '-' : '+') + p(Math.floor(a / 60)) + p(a % 60)) + '&for=' + n.for; }
  function showNight(n, save) {
    var P = window.MoonPhase; if (!P) return;
    var dm = n.d.split('-'), ms = new Date(+dm[0], +dm[1] - 1, +dm[2], n.t ? +n.t.split(':')[0] : 12, n.t ? +n.t.split(':')[1] : 0).getTime();
    n.ms = ms; n.z = -new Date(ms).getTimezoneOffset(); night = n;
    var f = P.fraction(ms), k = moon(ms);
    $('[data-n-moon]').setAttribute('data-at', String(ms));
    $('[data-n-title]').textContent = TITLES[n.for];
    $('[data-n-date-out]').textContent = +dm[2] + ' ' + MONTHS[+dm[1] - 1] + ' ' + dm[0];
    $('[data-n-phase]').textContent = P.name(f) + ' · ' + Math.round(P.illumination(ms) * 100) + '% lit';
    $('[data-n-facts]').textContent = n.t ? 'At ' + n.t + ' your time' : 'At midday';
    $('[data-n-show]').hidden = true;     // one primary at a time: Share takes over until the inputs change
    $('[data-n-cells]').innerHTML = '<div><span>CYCLE</span><b>' + k.y + '</b></div><div><span>MOON</span><b>' + p(k.m) + '</b></div><div><span>LUNE</span><b>' + p(k.d) + '</b></div>';
    $('[data-n-open]').href = 'https://moon369.org/night/' + n.d + '?' + nightQuery(n).replace(/^d=[^&]*&/, '');
    var ret = $('[data-n-returns]'); ret.textContent = n.returns ? 'This moon returns to this date in ' + n.returns + '.' : '';
    if (!n.returns && navigator.onLine !== false) fetch(API + '/v1/night?' + nightQuery(n)).then(function (r) { return r.json(); }).then(function (j) {
      if (night === n && j.returns) { n.returns = j.returns; ret.textContent = 'This moon returns to this date in ' + j.returns + '.'; saveNight(n); }
    }).catch(function () {});
    $('[data-n-res]').hidden = false;
    if (save) saveNight(n);
  }
  function saveNight(n) { remember('moonNights', { d: n.d, t: n.t, for: n.for, returns: n.returns || null }, function (x) { return x.d === n.d && x.t === n.t && x.for === n.for; }); showNights(); }
  function showNights() { list('moonNights', '[data-n-saved]', 'YOUR NIGHTS · SAVED ON THIS PHONE', function (x, i) { return '<a href="#" data-n-i="' + i + '"><span>' + esc(LABEL[x.for] || 'A day') + '</span><span>' + esc(x.d + (x.t ? ' ' + x.t : '')) + '</span></a>'; }); }

  // ---------- EVENTS ----------
  function span(ms) { var m = Math.round(ms / 60000); return m < 60 ? m + ' min' : m < 2880 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' days'; }
  function showEvents() {
    list('moonEvents', '[data-e-list]', 'YOUR EVENTS', function (x) {
      var left = x.ms - Date.now(), when = left > 0 ? 'in ' + span(left) : span(-left) + ' ago';
      return '<a href="' + esc(x.url) + '"><span>' + esc(x.name) + '<br><small>' + esc(localStr(x.ms)) + '</small></span><span>' + esc(when) + '</span></a>';
    });
  }
  function setWhen(ms) { var d = new Date(ms); $('[data-e-when]').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); noteWhen(); }
  function noteWhen() { var v = Date.parse($('[data-e-when]').value); $('[data-e-note]').textContent = isNaN(v) ? 'Everyone who opens the link sees it in their own time.' : 'Moonmark ' + text(moon(Math.floor(v / 1000) * 1000 + 1)) + '. Everyone who opens the link sees it in their own time.'; }

  // ---------- screens ----------
  function go(name) {
    $$('[data-scr]').forEach(function (s) { s.hidden = s.getAttribute('data-scr') !== name; });
    $$('[data-tab]').forEach(function (b) { if (b.getAttribute('data-tab') === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    try { history.replaceState(null, '', name === 'now' ? '/app' : '/app#' + name); } catch (e) {}
    window.scrollTo(0, 0);
  }

  // Install: Chrome and Android offer a prompt; iPhone needs Share, then Add to Home Screen.
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    var el = $('[data-app-install]'); el.hidden = false; el.innerHTML = '<button type="button">Add Moon to your home screen</button>';
    el.querySelector('button').onclick = function () { deferred.prompt(); deferred = null; el.hidden = true; };
  });
  function iosHint() {
    var standalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (!standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) { var el = $('[data-app-install]'); el.hidden = false; el.textContent = 'To keep Moon on your home screen: tap Share, then Add to Home Screen.'; }
  }

  function start() {
    requestAnimationFrame(tick); showMoments(); showNights(); showEvents(); iosHint();
    setInterval(showEvents, 30000);
    $$('[data-tab]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-tab')); }; });
    $$('[data-go]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-go')); }; });
    $('[data-app-mark]').onclick = function () { openSheet('moment', Date.now()); };
    $('[data-sheet-close]').onclick = closeSheet;
    $('[data-app-sheet]').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeSheet(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    $('[data-sheet-share]').onclick = share;
    $('[data-sheet-x]').onclick = function () { this.href = xHref(); buzz(); };
    $('[data-sheet-photo]').onchange = function () { pickPhoto(this.files && this.files[0]); };
    $('[data-app-recent]').addEventListener('click', function (e) {
      if (e.target.closest('[data-m-edit]')) { editing = !editing; showMoments(); buzz(); return; }
      var b = e.target.closest('[data-m-rm]'); if (!b) return;
      e.preventDefault();
      // Two taps: the first asks, the second removes.
      if (!b.classList.contains('sure')) { $$('[data-m-rm].sure').forEach(function (x) { x.classList.remove('sure'); x.textContent = '✕'; }); b.classList.add('sure'); b.textContent = 'REMOVE'; buzz(); return; }
      removeMoment(+b.getAttribute('data-m-rm'));
    });
    $('[data-sheet-pv-x]').onclick = function () { clearPhoto(); buzz(); };
    $('[data-sheet-copy]').onclick = function () { copy(); };
    $('[data-sheet-create]').onclick = create;
    $('[data-sheet-name]').addEventListener('keydown', function (e) { if (e.key === 'Enter' && cur && cur.kind === 'event') { e.preventDefault(); create(); } });
    $('[data-ready-link]').onclick = function () { this.select(); };
    $('[data-sheet-card]').onclick = card;
    $('[data-sheet-embed]').onclick = embed;
    // Nights
    $$('[data-n-chips] button').forEach(function (b) { b.onclick = function () { occasion = b.getAttribute('data-for'); $$('[data-n-chips] button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }; });
    // Empty date and time fields show an example; any change brings back the main button.
    var again = function () { $('[data-n-show]').hidden = false; };
    ['[data-n-date]', '[data-n-time]'].forEach(function (q) { var el = $(q), mark = function () { el.classList.toggle('empty', !el.value); }; el.addEventListener('input', function () { mark(); again(); }); el.addEventListener('change', mark); mark(); });
    $$('[data-n-chips] button').forEach(function (b) { b.addEventListener('click', again); });
    $('[data-n-show]').onclick = function () {
      var d = $('[data-n-date]').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('Pick a date first'); return; }
      showNight({ d: d, t: $('[data-n-time]').value || '', for: occasion }, true); buzz();
      setTimeout(function () { $('[data-n-res]').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
    };
    $('[data-n-saved]').addEventListener('click', function (e) {
      var a = e.target.closest('[data-n-i]'); if (!a) return; e.preventDefault();
      var x = store('moonNights')[+a.getAttribute('data-n-i')]; if (!x) return;
      $('[data-n-date]').value = x.d; $('[data-n-time]').value = x.t || ''; $('[data-n-date]').classList.toggle('empty', !x.d); $('[data-n-time]').classList.toggle('empty', !x.t); showNight({ d: x.d, t: x.t, for: x.for, returns: x.returns }, false);
      $('[data-n-res]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('[data-n-share]').onclick = function () {
      if (!night) return; buzz();
      var url = $('[data-n-open]').href, msg = TITLES[night.for].charAt(0) + TITLES[night.for].slice(1).toLowerCase() + ': ' + (night.t ? night.t + ' · ' : '') + $('[data-n-phase]').textContent + '.';
      if (navigator.share) navigator.share({ title: 'Your Moon', text: msg, url: url }).then(function () { toast(AFTER); }, function () {});
      else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied. ' + AFTER); }, function () { prompt('Copy this link', url); });
    };
    $('[data-n-card]').onclick = function () { if (night) shareImage(API + '/v1/night.png?' + nightQuery(night) + '&fmt=story&v=2', 'moon-' + night.d + '.png', $('[data-n-open]').href); };
    // Events
    setWhen(Date.now() + 86400000 - (Date.now() % 3600000));
    $('[data-e-when]').oninput = noteWhen;
    $$('[data-e-quick] button').forEach(function (b) { b.onclick = function () { var a = b.getAttribute('data-add'); setWhen(a === 'now' ? Date.now() : Date.now() + +a); buzz(); }; });
    $('[data-e-make]').onclick = function () {
      var v = Date.parse($('[data-e-when]').value); if (isNaN(v)) { toast('Pick a date and time'); return; }
      var name = $('[data-e-name]').value.replace(/\s+/g, ' ').trim(); if (!name) { toast('Name the event first'); $('[data-e-name]').focus(); return; }
      openSheet('event', v, name);
    };
    var h = location.hash.replace('#', ''); if (h === 'nights' || h === 'events') go(h);
    if (/[?&]mark=1/.test(location.search)) openSheet('moment', Date.now());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app-sw.js', { scope: '/app' }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
