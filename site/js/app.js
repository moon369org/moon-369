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
  var T = window.MoonT || function (x, v) { return v ? x.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : x; }, LANG = window.MoonI18n ? MoonI18n.lang : 'en', LOC = LANG === 'en' ? undefined : LANG;

  function moon(ms) {
    var t = ms - EPOCH, s = t / SEC, whole = Math.floor(s), frac = s - whole, da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - firstDay(mi) + 1, sd = whole - da * 86400;
    return { y: y, m: mi + 1, d: d, h: Math.floor(sd / 3600), mi: Math.floor(sd % 3600 / 60), s: sd % 60, f: frac };
  }
  var text = function (k) { return k.y + '.' + p(k.m) + '.' + p(k.d) + ' ' + p(k.h) + ':' + p(k.mi) + ':' + p(k.s); };
  var path = function (k) { return k.y + '.' + p(k.m) + '.' + p(k.d) + '-' + p(k.h) + '.' + p(k.mi) + '.' + p(k.s); };
  // A moment's link: the Moonmark, to the second, with an optional name. It opens in each person's own time.
  // Events carry their name as e= (a title with a countdown); moments carry what's happening as n= (a note).
  function link(ms, name, kind) { return 'https://moon369.org/m/' + path(moon(Math.floor(ms / 1000) * 1000 + 1)) + (name ? (kind === 'moment' ? '?n=' : '?e=') + encodeURIComponent(name).replace(/%20/g, '+') : ''); }
  function localStr(ms, opts) { try { return new Intl.DateTimeFormat(LOC, opts || { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(ms); } catch (e) { return new Date(ms).toString(); } }
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
      if (P) { var f = P.fraction(now); $('[data-app-meta]').innerHTML = esc(T('{p} · {n}% lit', { p: T(P.name(f)), n: Math.round(P.illumination(now) * 100) })) + ' · ' + esc(T('Lune {n}', { n: k.d })) + '<span class="lt1">' + esc(T('Your local time: {t}', { t: localStr(now) })) + '</span>'; }
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
    setStars();
    if (!r.length) { box.hidden = true; editing = false; return; }
    box.hidden = false;
    box.innerHTML = '<div class="rh"><span class="k"><span translate="no">MOONLOG</span><i class="rh-n"> | ' + (r.length === 1 ? T('1 MOMENT') : T('{n} MOMENTS', { n: r.length.toLocaleString(LOC) })) + '</i></span><button type="button" class="ed" data-m-edit>' + (editing ? 'DONE' : 'EDIT') + '</button></div>' +
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

  // ---------- your stars: one around the moon for every moment you've marked ----------
  // Each star's place, size and twinkle come from its own moment, so it never moves. The newest is born bright.
  var STARS = { list: [], born: 0, raf: 0 };
  function seeded(n) { return function () { n = (n + 0x6D2B79F5) | 0; var t = Math.imul(n ^ (n >>> 15), 1 | n); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function setStars() {
    var r = store('moonMoments'), prev = STARS.list.length;
    STARS.list = r.map(function (x) {
      // Weight: longer notes and photos make bigger, brighter stars; a quick few words, a small dim one.
      var g = seeded((x.ms / 1000) | 0), w = Math.min(1, (x.name ? x.name.length : 0) / 200 + (x.sha ? 0.6 : 0));
      return { seed: (x.ms / 1000) | 0, size: (0.85 + 1.5 * w) * (0.9 + g() * 0.2), lum: 0.6 + 0.4 * w, sp: 0.6 + g() * 1.4, ph: g() * 6.28, ms: x.ms };
    });
    STARS.key = '';
    if (STARS.list.length > prev && prev) STARS.born = performance.now();
    if (!STARS.raf) STARS.raf = requestAnimationFrame(drawStars);
  }
  // Every star goes where it can be seen: on screen, below the top bar, above the words, off the moon.
  // Each star tries spots from its own seed, so it lands in the same place every time on the same screen.
  function layoutStars(cv, dpr) {
    var cr = cv.getBoundingClientRect(), top = $('.top'), lab = $('[data-scr="now"] > .k'), st = $('[data-scr="now"] .stage');
    var L = Math.max(cr.left, 12), Rt = Math.min(cr.right, document.documentElement.clientWidth - 12);
    var T = Math.max(cr.top, top ? top.getBoundingClientRect().bottom + 8 : cr.top), B = Math.min(cr.bottom, lab ? lab.getBoundingClientRect().top - 8 : cr.bottom);
    var sr = st.getBoundingClientRect(), mx = sr.left + sr.width / 2, my = sr.top + sr.height / 2, mr = sr.width / 2 + 12;
    STARS.list.forEach(function (s) {
      var g = seeded(s.seed ^ 0x5bd1e995), x = 0, y = 0, pad = s.size * 3;
      for (var i = 0; i < 80; i++) {
        x = L + pad + g() * (Rt - L - pad * 2); y = T + pad + g() * (B - T - pad * 2);
        if (Math.hypot(x - mx, y - my) > mr + pad) break;
      }
      s.x = (x - cr.left) * dpr; s.y = (y - cr.top) * dpr;
    });
  }
  function drawStars(now) {
    STARS.raf = 0;
    var cv = $('[data-app-stars]'); if (!cv || !STARS.list.length) { if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) { STARS.raf = requestAnimationFrame(drawStars); return; }
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var cr = cv.getBoundingClientRect(), key = W + 'x' + H + '|' + Math.round(cr.left) + '|' + Math.round(cr.top + window.scrollY) + '|' + document.documentElement.clientWidth + '|' + STARS.list.length;
    if (STARS.key !== key) { STARS.key = key; layoutStars(cv, dpr); }
    var c = cv.getContext('2d'), t = now / 1000;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.clearRect(0, 0, W, H);
    var newest = STARS.list.reduce(function (m, s) { return s.ms > m.ms ? s : m; }, STARS.list[0]), age = (now - STARS.born) / 1000;
    STARS.list.forEach(function (s) {
      var x = s.x, y = s.y;
      var tw = (still ? 0.85 : 0.72 + 0.28 * Math.sin(t * s.sp + s.ph)) * (s.lum || 1), size = s.size * dpr * 1.15;
      if (s === newest && STARS.born && age < 2.5) { var k = 1 - age / 2.5; size *= 1 + 2.2 * k; tw = Math.min(1, tw + k); }
      var g = c.createRadialGradient(x, y, 0, x, y, size * 4);
      g.addColorStop(0, 'rgba(233,228,216,' + (0.9 * tw) + ')'); g.addColorStop(0.25, 'rgba(233,228,216,' + (0.35 * tw) + ')'); g.addColorStop(1, 'rgba(233,228,216,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, size * 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,252,244,' + tw + ')'; c.beginPath(); c.arc(x, y, size * 0.7, 0, Math.PI * 2); c.fill();
    });
    if (!still || (STARS.born && age < 2.5)) STARS.raf = requestAnimationFrame(drawStars);
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
    $('[data-sheet-h]').textContent = kind === 'event' ? 'NEW EVENT' : 'MARK THIS MOMENT';
    $('[data-sheet-create]').textContent = kind === 'event' ? 'CREATE EVENT' : 'MARK IT';
    $('[data-sheet-name]').classList.toggle('short', kind === 'event'); $('[data-sheet-name]').maxLength = kind === 'event' ? 80 : 280;
    $('[data-sheet-name]').value = name || ''; $('[data-sheet-name]').placeholder = kind === 'event' ? 'Name the event' : "What's happening? (optional)";
    $('[data-sheet-mk]').textContent = 'Moonmark ' + text(moon(cur.ms + 1));
    $('[data-sheet-lt]').textContent = T('{t} your time.', { t: localStr(cur.ms, { dateStyle: 'full', timeStyle: 'short' }) });
    $('[data-sheet-close]').textContent = 'CANCEL';
    clearPhoto(); $('[data-ready-photo]').hidden = true;
    $('[data-first-star]').hidden = kind === 'event' || store('moonMoments').length > 0;
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
        var url = s.url + (name ? '&n=' + encodeURIComponent(name).replace(/%20/g, '+') : '');
        try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
        // Save the photo before opening the moment, so its page can show it at the top.
        return Promise.all([cur.thumb ? putThumb(s.sha, cur.thumb) : null, thumbOf(cur.photo, 1600).then(function (big) { return big ? putThumb('full:' + s.sha, big) : null; })]).then(function () {
          if (cur === c0) finish(name, url, { ms: s.ms, name: name, url: url, sha: s.sha });
        });
      }).catch(function (e) {
        toast(navigator.onLine === false ? 'Signing a photo needs a connection' : (e && e.message) || 'Moon could not sign it. Try again.');
      }).then(function () { signing = false; btn.disabled = false; btn.textContent = 'MARK IT'; });
      return;
    }
    finish(name, link(cur.ms, name, cur.kind === 'event' ? 'event' : 'moment'), null);
  }
  function finish(name, url, it) {
    it = it || { ms: cur.ms, name: name, url: url };
    if (cur.kind === 'event') { remember('moonEvents', it, function (x) { return x.url === url; }); showEvents(); }
    else {
      remember('moonMoments', it, function (x) { return x.url === url; }); showMoments(); buzz();
      // A new moment opens straight in its own page.
      location.href = url.replace(/^https:\/\/moon369\.org/, '');
      return;
    }
    made = { url: url, name: name, mark: text(moon(cur.ms + 1)), photo: it.sha ? cur.photo : null };
    var rp = $('[data-ready-photo]'); if (made.photo && cur.thumb) { rp.src = URL.createObjectURL(cur.thumb); rp.hidden = false; } else rp.hidden = true;
    $('[data-ready-h]').textContent = cur.kind === 'event' ? 'YOUR EVENT IS READY' : 'YOUR MOMENT IS READY';
    $('[data-ready-name]').textContent = name;
    $('[data-ready-mk]').textContent = 'Moonmark ' + made.mark;
    $('[data-ready-lt]').textContent = T('{t} your time.', { t: localStr(cur.ms, { dateStyle: 'full', timeStyle: 'short' }) });
    $('[data-ready-link]').value = url;
    var box = $('[data-sheet-qrbox]'); try { box.innerHTML = window.MoonQR.svg(url, window.MoonPhase.fraction(cur.ms)); box.hidden = false; } catch (e) { box.hidden = true; }
    $('[data-sheet-embed]').hidden = cur.kind !== 'event';
    $('[data-sheet-close]').textContent = 'DONE';
    step('ready'); buzz();
  }
  var AFTER = 'Anyone who opens it can find their own moon.';
  function share() {
    if (!made) return; buzz();
    var msg = made.name ? T('{name}: Moonmark {mark}. Opens in your own time:', { name: made.name, mark: made.mark }) : T('Moonmark {mark}. Opens in your own time:', { mark: made.mark });
    // With a photo, send the photo itself along with the signed link: friends see the picture, and anyone can
    // check it by dropping it on moon369.org/verify.
    if (made.photo && navigator.canShare && navigator.canShare({ files: [made.photo] })) {
      navigator.share({ files: [made.photo], title: made.name || 'A moment on Moon', text: msg + ' ' + made.url }).then(function () { toast('Shared. ' + AFTER); }, function () {});
      return;
    }
    if (navigator.share) navigator.share({ title: made.name || 'A moment on Moon', text: msg, url: made.url }).then(function () { toast('Shared. ' + AFTER); }, function () {});
    else copy();
  }
  function xHref() { return made ? 'https://x.com/intent/post?text=' + encodeURIComponent(made.name ? T('{name}: Moonmark {mark}. Opens in your own time.', { name: made.name, mark: made.mark }) : T('Moonmark {mark}. Opens in your own time.', { mark: made.mark })) + '&url=' + encodeURIComponent(made.url) : 'https://x.com'; }
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
    $('[data-n-date-out]').textContent = LANG === 'en' ? +dm[2] + ' ' + MONTHS[+dm[1] - 1] + ' ' + dm[0] : new Date(Date.UTC(+dm[0], +dm[1] - 1, +dm[2], 12)).toLocaleDateString(LANG, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
    $('[data-n-phase]').textContent = T('{p} · {n}% lit', { p: T(P.name(f)), n: Math.round(P.illumination(ms) * 100) });
    $('[data-n-facts]').textContent = n.t ? T('At {t} your time', { t: n.t }) : T('At midday');
    $('[data-n-show]').hidden = true;     // one primary at a time: Share takes over until the inputs change
    $('[data-n-cells]').innerHTML = '<div><span>CYCLE</span><b>' + k.y + '</b></div><div><span>MOON</span><b>' + p(k.m) + '</b></div><div><span>LUNE</span><b>' + p(k.d) + '</b></div>';
    $('[data-n-open]').href = 'https://moon369.org/night/' + n.d + '?' + nightQuery(n).replace(/^d=[^&]*&/, '');
    var ret = $('[data-n-returns]'); ret.textContent = n.returns ? T('This moon returns to this date in {y}.', { y: n.returns }) : '';
    if (!n.returns && navigator.onLine !== false) fetch(API + '/v1/night?' + nightQuery(n)).then(function (r) { return r.json(); }).then(function (j) {
      if (night === n && j.returns) { n.returns = j.returns; ret.textContent = T('This moon returns to this date in {y}.', { y: j.returns }); saveNight(n); }
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
  function noteWhen() { var v = Date.parse($('[data-e-when]').value); $('[data-e-note]').textContent = isNaN(v) ? 'Everyone who opens the link sees it in their own time.' : T('Moonmark {m}. Everyone who opens the link sees it in their own time.', { m: text(moon(Math.floor(v / 1000) * 1000 + 1)) }); }

  // ---------- screens ----------
  // ---------- MOON / SKY: the moon itself, or its path across your sky today ----------
  var view = 'moon', skyBox = null;
  try { view = localStorage.getItem('moonView') === 'sky' ? 'sky' : 'moon'; } catch (e) {}
  function place() { try { var p = JSON.parse(localStorage.getItem('moonPlace') || 'null'); return p && isFinite(p.lat) && isFinite(p.lng) ? p : null; } catch (e) { return null; } }
  function setView(v, fromTap) {
    view = v; try { localStorage.setItem('moonView', v); } catch (e) {}
    $$('[data-view]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-view') === v)); });
    var away = v !== 'moon';
    $('[data-scr="now"] .stage').hidden = away; $('[data-skyv]').hidden = !away;
    if (skyBox) skyBox.stop();
    if (away) drawPath();
    if (fromTap) { go('now'); buzz(); }
  }
  function drawPath() {
    var p = place();
    var tide = view === 'tide';
    $('[data-sky-ask]').hidden = !!p; $('[data-sky-chart]').hidden = !p || tide; $('[data-sky-h]').hidden = !p || tide; $('[data-sky-where]').hidden = !p;
    $('[data-tide]').hidden = !p || !tide;
    $('[data-sky-k]').textContent = tide ? 'TIDES' : "THE MOON'S PATH TODAY";
    if (p) $('[data-sky-place]').textContent = (p.name ? p.name : 'YOUR LOCATION').toUpperCase();
    if (!p || !window.MoonSky) return;
    if (tide) { drawTide(p); return; }
    var now = Date.now(), fmt = new Intl.DateTimeFormat(LOC, { hour: 'numeric', minute: '2-digit' });
    var dayOf = function (t) { var d = new Date(t); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); }, today = dayOf(now);
    $('[data-sky-k]').textContent = T(p.lat >= 0 ? "THE MOON'S PATH · LOOKING SOUTH" : "THE MOON'S PATH · LOOKING NORTH");
    if (skyBox) skyBox.stop();
    skyBox = MoonSky.mount($('[data-sky-chart]'), {
      t0: now - 16 * 3600000, t1: now + 16 * 3600000, at: now, lat: p.lat, lng: p.lng,
      f: window.MoonPhase ? MoonPhase.fraction(now) : 0.5,
      clock: function (t) { return fmt.format(new Date(t)); },
      dayTag: function (t) { var d = dayOf(t); return d < today ? T(' · yesterday') : d > today ? T(' · tomorrow') : ''; },
      onTime: function (t, m) {
        var nowish = Math.abs(t - Date.now()) < 90000, w = T(nowish ? 'is' : t > Date.now() ? 'will be' : 'was');
        var when = nowish ? T('Right now') : T('At {t}', { t: fmt.format(new Date(t)) });
        $('[data-sky-h]').textContent = m.alt > -0.27 ? T('{when} the moon {verb} {deg}\u00b0 up in the {dir}.', { when: when, verb: w, deg: Math.max(0, Math.round(m.alt)), dir: T(MoonSky.compass(m.az)) })
          : T('{when} the moon {verb} below the horizon.', { when: when, verb: w });
      },
    });
  }
  // A US ZIP code: looked up from Moon's own small files (one per first two digits), so nothing is sent anywhere.
  function zipPlace(e) {
    e.preventDefault();
    var z = ($('[data-sky-zipin]').value || '').trim();
    if (!/^\d{5}$/.test(z)) { toast('Enter a 5-digit ZIP code'); return; }
    fetch('/data/zip/' + z.slice(0, 2) + '.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
      var x = d[z]; if (!x) { toast('That ZIP code was not found'); return; }
      try { localStorage.setItem('moonPlace', JSON.stringify({ lat: x[0], lng: x[1], name: x[2] + ', ' + x[3] + ' ' + z })); } catch (e2) {}
      $('[data-sky-zipin]').blur(); drawPath(); buzz();
    }).catch(function () { toast(navigator.onLine === false ? 'Looking up a ZIP code needs a connection' : 'Could not look up that ZIP code'); });
  }
  // ---------- TIDE: the ocean near you, and how hard the moon is pulling ----------
  var tideCache = {};
  function drawTide(p) {
    var fmt = new Intl.DateTimeFormat(LOC, { hour: 'numeric', minute: '2-digit' }), dfmt = new Intl.DateTimeFormat(LOC, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    $('[data-sky-k]').textContent = 'TIDES';
    strength();
    var key = p.lat + ',' + p.lng, c = tideCache[key];
    if (c && Date.now() - c.at < 15 * 60000) return showTide(c.d, fmt, dfmt);
    $('[data-tide-h]').textContent = 'Finding the nearest tide station…';
    var why = '';
    fetch(API + '/v1/tides?lat=' + p.lat + '&lng=' + p.lng).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.hilo) { why = d && d.error && d.error.detail ? d.error.detail : ''; throw 0; } tideCache[key] = { at: Date.now(), d: d }; if (view === 'tide') showTide(d, fmt, dfmt);
    }).catch(function () {
      $('[data-tide-h]').textContent = navigator.onLine === false ? 'Tides need a connection.' : 'Tide times are not available right now.';
      $('[data-tide-chart]').innerHTML = ''; $('[data-tide-list]').innerHTML = ''; $('[data-tide-ax]').innerHTML = ''; $('[data-tide-src]').textContent = why ? 'Details: ' + why : '';
    });
  }
  function showTide(d, fmt, dfmt) {
    var now = Date.now(), ev = d.hilo.map(function (x) { return { t: Date.parse(x.utc), ft: x.ft, type: x.type }; });
    var next = ev.filter(function (x) { return x.t > now; }), prev = ev.filter(function (x) { return x.t <= now; }).pop();
    var curve = d.curve.map(function (x) { return { t: Date.parse(x.utc), ft: x.ft }; });
    var level = null; for (var i = 1; i < curve.length; i++) if (curve[i].t >= now) { var a = curve[i - 1], b = curve[i]; level = a.ft + (b.ft - a.ft) * (now - a.t) / (b.t - a.t); break; }
    var n0 = next[0], ft = function (v) { return (Math.round(v * 10) / 10).toFixed(1) + ' ft'; };
    $('[data-tide-h]').textContent = n0 ? T('{dir} · {lvl} now.', { dir: T(n0.type === 'high' ? 'Rising' : 'Falling'), lvl: level != null ? ft(level) : '' }).replace(' ·  ', ' ') + ' ' + T('{kind} tide {ft} at {t}.', { kind: T(n0.type === 'high' ? 'High' : 'Low'), ft: ft(n0.ft), t: fmt.format(new Date(n0.t)) }) : '';
    // The next 24 hours, with highs and lows marked and a line at now.
    var t0 = now - 3 * 3600000, t1 = now + 21 * 3600000, pts = curve.filter(function (x) { return x.t >= t0 && x.t <= t1; });
    var svg = '';
    if (pts.length > 1) {
      var lo = Math.min.apply(null, pts.map(function (x) { return x.ft; })), hi = Math.max.apply(null, pts.map(function (x) { return x.ft; })), pad = (hi - lo) * 0.18 || 1;
      var X = function (t) { return (t - t0) / (t1 - t0) * 360; }, Y = function (v) { return 160 - (v - lo + pad) / (hi - lo + pad * 2) * 150; };
      var line = pts.map(function (x, i) { return (i ? 'L' : 'M') + X(x.t).toFixed(1) + ' ' + Y(x.ft).toFixed(1); }).join(' ');
      svg += '<path d="' + line + ' L360 170 L0 170 Z" fill="rgba(138,139,143,.16)"/><path d="' + line + '" fill="none" stroke="#E9E4D8" stroke-width="1.6" vector-effect="non-scaling-stroke"/>';
      ev.filter(function (x) { return x.t >= t0 && x.t <= t1; }).forEach(function (x) { svg += '<circle cx="' + X(x.t).toFixed(1) + '" cy="' + Y(x.ft).toFixed(1) + '" r="3" fill="' + (x.type === 'high' ? '#E9E4D8' : '#0B0B0D') + '" stroke="#E9E4D8" stroke-width="1.2" vector-effect="non-scaling-stroke"/>'; });
      svg += '<line x1="' + X(now).toFixed(1) + '" x2="' + X(now).toFixed(1) + '" y1="0" y2="170" stroke="#8A8B8F" stroke-dasharray="3 3" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    }
    $('[data-tide-chart]').innerHTML = svg;
    $('[data-tide-ax]').innerHTML = '<span>' + esc(fmt.format(new Date(t0))) + '</span><span>' + esc(fmt.format(new Date(t1))) + ' ' + esc(dfmt.format(new Date(t1)).split(' ')[0].replace(',', '')) + '</span>';
    // Drag along the curve to see the tide at any moment; it starts at now.
    if (pts.length > 1) { TC = { t0: t0, t1: t1, lo: lo, hi: hi, pad: pad, curve: curve, fmt: fmt, ft: ft, headline: $('[data-tide-h]').textContent }; cursorAt(now, true); }
    $('[data-tide-list]').innerHTML = next.slice(0, 4).map(function (x) { return '<div><span>' + (x.type === 'high' ? 'HIGH' : 'LOW') + '</span><b>' + esc(fmt.format(new Date(x.t))) + '</b><i>' + esc(ft(x.ft)) + ' · ' + esc(dfmt.format(new Date(x.t)).split(' ')[0].replace(',', '')) + '</i></div>'; }).join('');
    var st = d.station, far = st.distance_km > 60;
    var where = st.name + (st.state ? ', ' + st.state : '');
    $('[data-tide-src]').textContent = T('NOAA predictions for {place} · {far}heights above {datum}.', { place: where, far: far ? T('{km} km away, the nearest station · ', { km: st.distance_km.toLocaleString() }) : '', datum: d.datum });
    if (far) $('[data-tide-h]').textContent = T('Nearest coast: {place}.', { place: where }) + ' ' + $('[data-tide-h]').textContent;
  }
  var TC = null;
  function levelAt(t) { var c = TC.curve; for (var i = 1; i < c.length; i++) if (c[i].t >= t) { var a = c[i - 1], b = c[i]; return { ft: a.ft + (b.ft - a.ft) * (t - a.t) / (b.t - a.t), up: b.ft > a.ft }; } return null; }
  function cursorAt(t, isNow) {
    if (!TC) return;
    t = Math.max(TC.t0, Math.min(TC.t1, t));
    var L = levelAt(t), cur = $('[data-tide-cur]'), x = (t - TC.t0) / (TC.t1 - TC.t0);
    if (!L) return;
    var y = 1 - (L.ft - TC.lo + TC.pad) / (TC.hi - TC.lo + TC.pad * 2);   // same scale as the curve: 150 of 170 tall, 10 from the bottom
    cur.hidden = false; cur.style.left = (x * 100).toFixed(2) + '%'; cur.classList.toggle('flip', x > 0.62);
    cur.querySelector('b').style.top = ((10 + y * 150) / 170 * 100).toFixed(2) + '%';
    cur.querySelector('span').textContent = (isNow ? T('NOW') : TC.fmt.format(new Date(t))) + ' · ' + TC.ft(L.ft);
    $('[data-tide-back]').hidden = !!isNow;
    $('[data-tide-h]').textContent = isNow ? TC.headline : T('At {t}: {lvl}, {dir}.', { t: TC.fmt.format(new Date(t)), lvl: TC.ft(L.ft), dir: T(L.up ? 'rising' : 'falling') });
  }
  function bindTideDrag() {
    var w = $('[data-tide-wrap]'), dragging = false;
    var at = function (e) { var r = w.getBoundingClientRect(); return TC.t0 + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (TC.t1 - TC.t0); };
    w.addEventListener('pointerdown', function (e) { if (!TC) return; dragging = true; try { w.setPointerCapture(e.pointerId); } catch (x) {} var t = at(e); cursorAt(t, Math.abs(t - Date.now()) < 5 * 60000); buzz(); });
    w.addEventListener('pointermove', function (e) { if (!dragging || !TC) return; var t = at(e); cursorAt(t, Math.abs(t - Date.now()) < 5 * 60000); });
    var up = function () { dragging = false; }; w.addEventListener('pointerup', up); w.addEventListener('pointercancel', up);
    $('[data-tide-back]').onclick = function () { cursorAt(Date.now(), true); buzz(); };
  }

  // How strong the tides are worldwide right now: spring tides near new and full moon, neap near the quarters,
  // a little stronger when the moon is close.
  function strength() {
    var P = window.MoonPhase; if (!P) return;
    var now = Date.now(), f = P.fraction(now), dist = window.MoonSky && MoonSky.distanceKm ? MoonSky.distanceKm(now) : null;
    var off = function (target) { var x = Math.abs(((f - target) % 1 + 1.5) % 1 - 0.5); return x; };
    var dSpring = Math.min(off(0), off(0.5)), dNeap = Math.min(off(0.25), off(0.75));
    var findNext = function (targets) { for (var h = 1; h < 24 * 16; h++) { var a = P.fraction(now + (h - 1) * 3600000), b = P.fraction(now + h * 3600000); for (var k = 0; k < targets.length; k++) { var tg = targets[k]; if ((a < tg && b >= tg) || (tg === 0 && b < a)) return now + h * 3600000; } } return null; };
    var ns = findNext([0, 0.5]), nn = findNext([0.25, 0.75]), dd = new Intl.DateTimeFormat(LOC, { weekday: 'short', month: 'short', day: 'numeric' });
    var kind = T(dSpring < 0.07 ? 'SPRING TIDES' : dNeap < 0.07 ? 'NEAP TIDES' : dSpring < dNeap ? 'TIDES GROWING' : 'TIDES EASING');
    var why = T(dSpring < 0.07 ? 'Sun and moon pull in line, so highs run higher and lows lower.' : dNeap < 0.07 ? 'Sun and moon pull at right angles, so the range between high and low is smallest.' : dSpring < dNeap ? 'The range between high and low is growing toward spring tides.' : 'The range between high and low is shrinking toward neap tides.');
    var km = dist ? Math.round(dist / 1000) + ',000' : '';
    var close = dist ? (dist < 370000 ? T(' The moon is close ({km} km), adding a little extra.', { km: km }) + (dSpring < 0.07 ? T(' Expect king tides.') : '') : dist > 400000 ? T(' The moon is far ({km} km), taking a little off.', { km: km }) : '') : '';
    $('[data-tide-str]').innerHTML = '<b>' + kind + '</b><p>' + why + close + '</p><p>' + esc(T('Next spring tides {a} · next neap tides {b}.', { a: ns ? dd.format(new Date(ns)) : '…', b: nn ? dd.format(new Date(nn)) : '…' })) + '</p>';
  }
  function askPlace() {
    if (!navigator.geolocation) { toast('Location is not available on this device'); return; }
    var b = $('[data-sky-loc]'); b.textContent = 'FINDING YOU…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      // Rounded to about a kilometre: plenty for the sky, and it never leaves this phone.
      try { localStorage.setItem('moonPlace', JSON.stringify({ lat: Math.round(pos.coords.latitude * 100) / 100, lng: Math.round(pos.coords.longitude * 100) / 100 })); } catch (e) {}
      b.textContent = 'USE MY LOCATION'; drawPath(); buzz();
    }, function () { b.textContent = 'USE MY LOCATION'; toast('Allow location for Moon in Settings to see the sky'); }, { maximumAge: 3600000, timeout: 15000 });
  }

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
    $$('[data-view]').forEach(function (b) { b.onclick = function () { setView(b.getAttribute('data-view'), true); }; });
    $('[data-sky-loc]').onclick = askPlace;
    bindTideDrag();
    // Language picker: the globe in the top bar. Automatic follows the phone.
    var chosen = null; try { chosen = localStorage.getItem('moonLang'); } catch (e) {}
    var LANGS = [['auto', 'Automatic', T('PHONE SETTING')]].concat(((window.MoonI18n && MoonI18n.languages) || [['en', 'English']]).map(function (l) { return [l[0], l[1], l[0].toUpperCase()]; }));
    $('[data-lang-list]').innerHTML = LANGS.map(function (l) { var on = l[0] === 'auto' ? !chosen : chosen === l[0]; return '<button type="button" data-lang="' + l[0] + '" aria-current="' + on + '">' + esc(l[0] === 'auto' ? T('Automatic') : l[1]) + ' <span>' + esc(l[2]) + '</span></button>'; }).join('');
    $('[data-lang-open]').onclick = function () { $('[data-lang-sheet]').hidden = false; buzz(); };
    $('[data-lang-close]').onclick = function () { $('[data-lang-sheet]').hidden = true; };
    $('[data-lang-sheet]').addEventListener('click', function (e) {
      if (e.target === this) { this.hidden = true; return; }
      var b = e.target.closest('[data-lang]'); if (!b || !window.MoonI18n) return;
      MoonI18n.set(b.getAttribute('data-lang'));
    });
    $('[data-sky-zip]').addEventListener('submit', zipPlace);
    $('[data-sky-change]').onclick = function () { try { localStorage.removeItem('moonPlace'); } catch (e) {} if (skyBox) skyBox.stop(); drawPath(); };
    setView(view, false);
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
