/* moon369.org/sky-check: take a photo of the Moon and check Moon time against the real sky.
   Everything runs here in the browser; the photo is never uploaded. The math is in sky-check-core.js. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var INK = [233, 228, 216], loc = null, last = null;
  var p2 = function (n) { return String(n).padStart(2, '0'); };

  // Moon time for display (seconds are plenty here): same constants as api/src/moon.ts.
  var LUN = 2551442876.8992, EPOCH = 947182440000 - 24736 * LUN, MOON_PER_MS = 31881600000000000 / 33168757399689600;
  function moonmark(ms) {
    var mms = (ms - EPOCH) * MOON_PER_MS, day = Math.floor(mms / 86400000), year = Math.floor(day / 369), doy = day - year * 369;
    var mo = Math.floor(doy * 13 / 369), lune = doy - Math.ceil(mo * 369 / 13) + 1, s = Math.floor((mms - day * 86400000) / 1000);
    var date = year + '.' + p2(mo + 1) + '.' + p2(lune), time = p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60);
    return { text: date + ' ' + time, path: date + '-' + time.replace(/:/g, '.') };
  }
  var when = function (ms) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ms); } catch (e) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; } };
  var deg = function (d) { return Math.round(d) + '°'; };
  var clockWord = function (d) {   // 0 = up, clockwise
    var names = ['up', 'up and right', 'right', 'down and right', 'down', 'down and left', 'left', 'up and left'];
    return names[Math.round(((d % 360) + 360) % 360 / 45) % 8];
  };

  // The Moon drawn like the site's living moon: shaded like a sphere, turned so its lit side points
  // `dir` degrees clockwise from up.
  function drawMoon(cv, f, dir, px, rf) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round((px || cv.clientWidth || 160) * dpr);
    cv.width = cv.height = W;
    var c = cv.getContext('2d'), R = W * (rf || 0.42), cx = W / 2, img = c.createImageData(W, W), d = img.data;
    var e = 2 * Math.PI * f, sx = Math.sin(e), sz = -Math.cos(e);
    var rot = (dir == null ? 0 : dir - (f < 0.5 ? 90 : 270)) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
    for (var y = 0; y < W; y++) for (var x = 0; x < W; x++) {
      var X = (x + 0.5 - cx) / R, Y = (y + 0.5 - cx) / R, rr = X * X + Y * Y;
      var edge = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * R + 0.5));
      if (edge <= 0) continue;
      var nx = X * cr + Y * sr, nz = Math.sqrt(Math.max(0, 1 - rr)), dot = nx * sx + nz * sz;   // undo the turn
      var A = -0.03 - 0.22 * nz, B = 0.03 + 0.42 * nz, t = Math.min(1, Math.max(0, (dot - A) / (B - A))), a = t * t * (3 - 2 * t);
      var o = (y * W + x) * 4;
      d[o] = Math.round(36 + (INK[0] - 36) * a); d[o + 1] = Math.round(38 + (INK[1] - 38) * a); d[o + 2] = Math.round(42 + (INK[2] - 42) * a); d[o + 3] = Math.round(255 * edge);
    }
    c.putImageData(img, 0, 0);
  }

  function nowPanel() {
    var ms = Date.now(), S = window.MoonSkyCheck, ex = S.expected(ms, loc && loc.lat, loc && loc.lng);
    var dir = ex.dir != null ? ex.dir : (window.MoonPhase.tilt(ms) + (ex.fraction < 0.5 ? 90 : 270));
    var cv = $('[data-sc-nowcv]'); if (cv) cv.setAttribute('data-tilt', ex.dir != null ? String(ex.dir - (ex.fraction < 0.5 ? 90 : 270)) : '');
    var t = ex.name + ' · ' + (ex.lit * 100).toFixed(0) + '% lit · Moonmark ' + moonmark(ms).text + '<br>';
    if (ex.dir == null) t += 'Add your location to see which way it tilts where you are.';
    else t += 'Lit side points ' + clockWord(ex.dir) + ' (' + deg(ex.dir) + ' from straight up)' + (ex.alt < 0 ? '. It is below your horizon right now.' : '.');
    $('[data-sc-nowt]').innerHTML = t;
    $('[data-sc-nowh]').textContent = loc ? 'THE MOON RIGHT NOW, FROM WHERE YOU ARE' : 'THE MOON RIGHT NOW';
  }

  // Location: from the phone, or a city typed in (for when the phone won't share it).
  function placeMsg(t) { document.querySelectorAll('[data-sc-plmsg]').forEach(function (el) { el.textContent = t || ''; }); }
  function setPlace(p) { loc = p; placeMsg(''); nowPanel(); withPlace(); renderPlaceBlocks(); }
  function askLocation(then, quiet) {
    if (!navigator.geolocation) { if (!quiet) placeMsg('This browser can\'t share your location. Type your city instead.'); if (then) then(); return; }
    if (!quiet) placeMsg('Finding you…');
    navigator.geolocation.getCurrentPosition(function (p) {
      setPlace({ lat: p.coords.latitude, lng: p.coords.longitude, from: 'your location' }); if (then) then();
    }, function (err) {
      if (!quiet) placeMsg(err && err.code === 1
        ? 'Location is blocked for this site. On iPhone: Settings, Privacy & Security, Location Services, Safari Websites, While Using. Or type your city.'
        : 'Couldn\'t get your location. Type your city instead.');
      if (then) then();
    }, { maximumAge: 600000, timeout: 10000 });
  }
  function placeBlock() {
    if (loc) return '';
    return '<div class="sc-pl"><div class="sc-pl-row"><button type="button" data-sc-loc>USE MY LOCATION</button></div>' +
      '<input type="text" data-sc-city placeholder="or type your city" autocomplete="off" aria-label="Your city"><div class="sc-pl-list" data-sc-cities role="listbox"></div>' +
      '<span class="sc-pl-msg" data-sc-plmsg role="status"></span></div>';
  }
  function renderPlaceBlocks() {
    document.querySelectorAll('[data-sc-place]').forEach(function (el) { el.innerHTML = placeBlock(); bindPlace(el); });
  }
  function bindPlace(el) {
    var b = el.querySelector('[data-sc-loc]'); if (b) b.onclick = function () { askLocation(); };
    var inp = el.querySelector('[data-sc-city]'), list = el.querySelector('[data-sc-cities]'), P = window.MoonPlaces;
    if (!inp || !P) return;
    var found = [];
    inp.onfocus = function () { P.load(); };
    inp.oninput = function () {
      P.load().then(function () {
        found = P.search(inp.value).slice(0, 6);
        list.innerHTML = found.map(function (c, i) { return '<button type="button" data-i="' + i + '">' + esc(P.label(c)) + '</button>'; }).join('');
        list.querySelectorAll('button').forEach(function (bt) { bt.onclick = function () { var c = found[+bt.dataset.i]; setPlace({ lat: c.lat, lng: c.lng, from: P.label(c) }); }; });
      });
    };
  }

  var photo = null, sealed = null, sealing = false;
  function readPhoto(file) {
    var v = $('[data-sc-v]'), res = $('[data-sc-res]');
    res.hidden = false; v.className = 'sc-v'; v.innerHTML = '<b>READING YOUR PHOTO…</b>'; $('[data-sc-rows]').innerHTML = '';
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var exifP = file.arrayBuffer().then(function (b) { return window.MoonSkyCheck.exif(b); }).catch(function () { return null; });
    var bmpP = (window.createImageBitmap ? createImageBitmap(file) : Promise.reject()).catch(function () {
      return new Promise(function (ok, no) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = URL.createObjectURL(file); });
    });
    Promise.all([exifP, bmpP]).then(function (a) { photo = file; sealed = null; analyse(a[0], a[1]); }).catch(function () {
      v.className = 'sc-v off'; v.innerHTML = '<b>COULD NOT OPEN THAT PHOTO</b><span>Try a JPEG or PNG, or take a new photo.</span>';
    });
  }

  function analyse(ex, bmp) {
    var S = window.MoonSkyCheck, iw = bmp.width, ih = bmp.height, k = Math.min(1, 900 / Math.max(iw, ih));
    var w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
    var work = document.createElement('canvas'); work.width = w; work.height = h;
    var wc = work.getContext('2d', { willReadFrequently: true }); wc.drawImage(bmp, 0, 0, w, h);
    var px = wc.getImageData(0, 0, w, h).data, lum = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) lum[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    var m = S.measure(lum, w, h);
    var v = $('[data-sc-v]');
    if (!m.ok) {
      v.className = 'sc-v off';
      v.innerHTML = m.reason === 'dark' ? '<b>NO MOON FOUND</b><span>Nothing in this photo is bright enough. Try one where the Moon is clearly visible.</span>'
        : '<b>NO MOON FOUND</b><span>Something bright is there, but it isn\'t Moon-shaped. Zoom in on the Moon, make sure it is not behind clouds, and try again.</span>';
      $('[data-sc-photo]').getContext('2d').clearRect(0, 0, 9999, 9999); drawMoon($('[data-sc-pred]'), 0, null);
      return;
    }
    var now = Date.now(), useExif = ex && ex.ms && ex.ms < now + 120000 && ex.ms > now - 3650 * 864e5;
    var ms = useExif ? ex.ms : now;
    var place = ex && ex.lat != null ? { lat: ex.lat, lng: ex.lng, from: 'the photo' } : loc;
    var e = S.expected(ms, place && place.lat, place && place.lng), c = S.compare(m, e);
    last = { m: m, e: e, c: c, ms: ms, place: place, useExif: useExif, bmp: bmp, k: k };
    paint();
  }

  function cropPhoto(cv, size) {
    var m = last.m, k = last.k, W = size || 600; cv.width = cv.height = W;
    var c = cv.getContext('2d'), half = m.r * 1.6 / k;   // in the original photo's pixels
    c.fillStyle = '#0B0B0D'; c.fillRect(0, 0, W, W);
    // Safari draws nothing if the source box runs off the photo, so clip the box to the photo first.
    var iw = last.bmp.width, ih = last.bmp.height, sx0 = m.cx / k - half, sy0 = m.cy / k - half, scl = W / (half * 2);
    var ax = Math.max(0, sx0), ay = Math.max(0, sy0), bx = Math.min(iw, sx0 + half * 2), by = Math.min(ih, sy0 + half * 2);
    if (bx > ax && by > ay) c.drawImage(last.bmp, ax, ay, bx - ax, by - ay, (ax - sx0) * scl, (ay - sy0) * scl, (bx - ax) * scl, (by - ay) * scl);
    // the circle Moon found, and the way the lit side points
    var s = W / (half * 2), R = m.r / k * s;
    c.strokeStyle = 'rgba(233,228,216,.55)'; c.lineWidth = Math.max(1, W / 300); c.setLineDash([W / 90, W / 120]);
    c.beginPath(); c.arc(W / 2, W / 2, R, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    if (m.dir != null) arrow(c, W / 2, W / 2, R, m.dir, W);
  }
  function arrow(c, x, y, R, dir, W) {
    var a = (dir - 90) * Math.PI / 180, x0 = x + Math.cos(a) * R * 1.12, y0 = y + Math.sin(a) * R * 1.12, x1 = x + Math.cos(a) * R * 1.42, y1 = y + Math.sin(a) * R * 1.42;
    c.strokeStyle = c.fillStyle = '#E9E4D8'; c.lineWidth = Math.max(1.5, W / 220);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    var h = W / 40, b = a + Math.PI;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 + Math.cos(b + 0.45) * h, y1 + Math.sin(b + 0.45) * h); c.lineTo(x1 + Math.cos(b - 0.45) * h, y1 + Math.sin(b - 0.45) * h); c.closePath(); c.fill();
  }
  function predDir() {
    var e = last ? last.e : null; if (!e) return null;
    return e.dir != null ? e.dir : (window.MoonPhase.tilt(last.ms) + (e.fraction < 0.5 ? 90 : 270));
  }

  // Location arrived after the photo was read: check the tilt now.
  function withPlace() {
    if (!loc || !last || last.place) return;
    last.place = loc; last.e = window.MoonSkyCheck.expected(last.ms, loc.lat, loc.lng); last.c = window.MoonSkyCheck.compare(last.m, last.e); paint();
  }

  function paint() {
    var m = last.m, e = last.e, c = last.c, mk = moonmark(last.ms);
    var v = $('[data-sc-v]');
    var head = { match: 'THE SKY AGREES WITH MOON TIME', close: 'CLOSE TO MOON TIME', off: 'THIS DOESN\'T MATCH MOON TIME' }[c.verdict];
    var why = c.verdict === 'match' ? 'Your photo shows the Moon that Moon time predicts' + (c.tilt === 'skip' ? '.' : ', lit the same amount and tilted the same way.')
      : c.verdict === 'close' ? 'Near enough to be the same Moon. Haze, a bright exposure or a slightly tilted phone can shift the reading a little.'
      : 'The photo and Moon time disagree. Was it taken at another time or place, with the phone tilted, or through clouds?';
    if (e.alt != null && e.alt < -1) why += ' At that time the Moon was below the horizon where you are.';
    v.className = 'sc-v ' + c.verdict; v.innerHTML = '<b>' + head + '</b><span>' + why + '</span>';
    cropPhoto($('[data-sc-photo]'));
    // Same scale as the photo crop (the Moon at 1/1.6 of half the frame), with room for the arrow.
    var pc = $('[data-sc-pred]'); drawMoon(pc, e.fraction, predDir(), 300, 0.5 / 1.6);
    if (e.dir != null && e.lit < 0.94) arrow(pc.getContext('2d'), pc.width / 2, pc.width / 2, pc.width * 0.5 / 1.6, e.dir, pc.width);
    var mark = function (state) { return state === 'match' ? '<b class="sc-ok">✓</b> ' : state === 'close' ? '<b class="sc-warn">≈</b> ' : state === 'off' ? '<b class="sc-bad">✕</b> ' : ''; };
    var rows = '';
    rows += '<div><span>LIT</span><b>' + mark(c.phase) + 'Photo ' + (m.lit * 100).toFixed(0) + '% · Moon time ' + (e.lit * 100).toFixed(0) + '%</b><em>' + esc(e.name) + '</em></div>';
    var tiltTxt = c.tilt === 'skip'
      ? (e.dir == null ? 'Add your location below to check the tilt.' : e.lit >= 0.94 ? 'A full Moon has no tilt to check.'
        : m.dir == null ? 'The photo shows a full Moon, so there is no tilt to compare.' : 'Too thin a crescent to read the tilt.')
      : mark(c.tilt) + 'Photo ' + deg(m.dir) + ' · Moon time ' + deg(e.dir);
    rows += '<div><span>LIT SIDE POINTS</span><b>' + tiltTxt + '</b><em>Degrees clockwise from straight up</em></div>';
    rows += '<div><span>WHEN</span><b>' + esc(when(last.ms)) + '</b><em>' + (last.useExif ? 'When the photo was taken' : 'Now (the photo didn\'t say when it was taken)') + ' · <a href="/m/' + mk.path + '">' + mk.text + '</a></em></div>';
    rows += '<div><span>WHERE</span><b>' + (last.place ? last.place.lat.toFixed(2) + ', ' + last.place.lng.toFixed(2) : 'Not shared') + '</b><em>' + (last.place ? 'From ' + esc(last.place.from) + '. Used only on this page.' : 'Needed to check the tilt.') + '</em>' + (last.place ? '' : '<div data-sc-place></div>') + '</div>';
    $('[data-sc-rows]').innerHTML = rows;
    renderPlaceBlocks();
    sealUi();
    try { window.moonTrack && window.moonTrack('sky_check', { verdict: c.verdict }); } catch (er) {}
  }


  // Seal this sky: register the exact photo on Moon, labelled with what Sky Check measured. Only for a match.
  function sealUi() {
    var b = $('[data-sc-seal]'), out = $('[data-sc-sealed]'); if (!b || !out) return;
    var ok = last && last.c.verdict === 'match' && photo;
    b.hidden = !ok || !!sealed; b.disabled = sealing; b.textContent = sealing ? 'SEALING…' : 'SEAL THIS SKY';
    if (sealed) {
      out.hidden = false;
      out.innerHTML = '<div class="sc-badge">SKY-CHECKED</div><p>Sealed at <a href="' + esc(sealed.url) + '" target="_blank" rel="noopener">' + esc(sealed.mk) + '</a>. Anyone can drop this exact photo on <a href="/verify">Verify</a> to see it was registered, and that its Moon matched Moon time.</p>' +
        '<a class="sc-btn" href="' + sealed.href + '" download="' + esc(sealed.file) + '">DOWNLOAD RECEIPT</a>';
    } else if (out.dataset.err) { out.hidden = false; out.innerHTML = '<p class="sc-err">' + esc(out.dataset.err) + '</p>'; }
    else out.hidden = true;
  }
  function skyLabel() {
    var m = last.m, c = last.c;
    var t = 'Sky-checked: photo Moon ' + Math.round(m.lit * 100) + '% lit' + (c.tilt === 'match' ? ', lit side ' + Math.round(m.dir) + '°' : '') + ', matches Moon time';
    return t + (last.useExif ? ' at ' + new Date(last.ms).toISOString().slice(0, 16) + 'Z' : ' when sealed');
  }
  var sealJs = null;
  function lookAlike(file) {
    if (!sealJs) sealJs = window.MoonSeal ? Promise.resolve() : new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = '/js/seal.js'; sc.async = true; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    return sealJs.then(function () { return window.MoonSeal.dhash(file); }).catch(function () { return null; });
  }
  function sealSky() {
    if (!photo || !last || last.c.verdict !== 'match' || sealing) return;
    var out = $('[data-sc-sealed]'); delete out.dataset.err; sealing = true; sealUi();
    var file = photo, label = skyLabel();
    file.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (d) {
      var sha = Array.from(new Uint8Array(d), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      return lookAlike(file).then(function (ph) {
        var body = { sha256: sha, label: label }; if (ph) body.phash = ph;
        return fetch('https://api.moon369.org/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      });
    }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, b: b }; }); }).then(function (x) {
      if (!x.ok) throw new Error(x.status === 429 ? 'Too many requests right now. Try again in a minute.' : ((x.b && x.b.error && x.b.error.message) || 'Sealing failed. Try again.'));
      var rc = x.b.receipt;
      sealed = { mk: rc.moonmark.slice(0, 19), url: x.b.signed_url, file: (file.name || 'moon-photo').replace(/[^A-Za-z0-9._-]+/g, '_') + '.moonmark.json',
        href: URL.createObjectURL(new Blob([JSON.stringify(rc, null, 2) + '\n'], { type: 'application/json' })) };
      try { window.moonTrack && window.moonTrack('sky_sealed', {}); } catch (er) {}
    }).catch(function (err) {
      out.dataset.err = (err && err.message && !/fetch|network/i.test(err.message)) ? err.message : 'Could not reach Moon. Check your connection and try again.';
    }).then(function () { sealing = false; sealUi(); });
  }

  // A shareable picture: your photo beside Moon's, the verdict and the Moonmark.
  function shareImage() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), e = last.e, cmp = last.c, mk = moonmark(last.ms);
    c.fillStyle = '#0B0B0D'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#8A8B8F'; c.font = '26px "JetBrains Mono", monospace'; c.textAlign = 'left';
    var sp = function (t) { return t.split('').join(String.fromCharCode(8202)); };
    c.fillText(sp('SKY CHECK'), 80, 120);
    c.fillStyle = cmp.verdict === 'match' ? '#4CC38A' : cmp.verdict === 'close' ? '#F2C14E' : '#F0645C';
    c.font = '700 44px Syncopate, sans-serif';
    var lines = { match: ['THE SKY AGREES', 'WITH MOON TIME'], close: ['CLOSE TO', 'MOON TIME'], off: ['DOESN\'T MATCH', 'MOON TIME'] }[cmp.verdict];
    c.fillText(lines[0], 80, 200); c.fillText(lines[1], 80, 258);
    var a = document.createElement('canvas'), b = document.createElement('canvas');
    cropPhoto(a, 440); drawMoon(b, e.fraction, predDir(), 440, 0.5 / 1.6);
    if (e.dir != null && e.lit < 0.94) arrow(b.getContext('2d'), b.width / 2, b.width / 2, b.width * 0.5 / 1.6, e.dir, b.width);
    c.save(); c.beginPath(); c.rect(80, 340, 440, 440); c.clip(); c.drawImage(a, 80, 340); c.restore();
    c.drawImage(b, 0, 0, b.width, b.height, 560, 340, 440, 440);
    c.strokeStyle = '#24262A'; c.lineWidth = 2; c.strokeRect(80, 340, 440, 440); c.strokeRect(560, 340, 440, 440);
    c.fillStyle = '#8A8B8F'; c.font = '22px "JetBrains Mono", monospace';
    c.fillText(sp('YOUR PHOTO'), 80, 830); c.fillText(sp('MOON TIME SAYS'), 560, 830);
    c.fillStyle = '#E9E4D8'; c.font = '34px "JetBrains Mono", monospace';
    c.fillText((last.m.lit * 100).toFixed(0) + '% lit' + (last.m.dir != null && cmp.tilt !== 'skip' ? ' · ' + Math.round(last.m.dir) + '°' : ''), 80, 890);
    c.fillText((e.lit * 100).toFixed(0) + '% lit' + (e.dir != null && cmp.tilt !== 'skip' ? ' · ' + Math.round(e.dir) + '°' : ''), 560, 890);
    c.fillStyle = sealed ? '#4CC38A' : '#8A8B8F'; c.font = '22px "JetBrains Mono", monospace'; c.fillText(sp(sealed ? 'SKY-CHECKED · SEALED ON MOON ' + sealed.mk : 'MOONMARK'), 80, 1010);
    c.fillStyle = '#E9E4D8'; c.font = '54px "JetBrains Mono", monospace'; c.fillText(mk.text, 80, 1080);
    c.fillStyle = '#8A8B8F'; c.font = '24px "JetBrains Mono", monospace'; c.fillText(when(last.ms), 80, 1130);
    c.fillStyle = '#24262A'; c.fillRect(80, 1200, W - 160, 2);
    c.fillStyle = '#E9E4D8'; c.font = '700 26px Syncopate, sans-serif'; c.fillText('MOON', 80, 1270);
    c.fillStyle = '#8A8B8F'; c.font = '24px "JetBrains Mono", monospace'; c.textAlign = 'right'; c.fillText('moon369.org/sky-check', W - 80, 1268);
    return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
  }
  function save() {
    if (!last) return;
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(shareImage).then(function (blob) {
      var file = new File([blob], 'moon-sky-check.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: 'Sky Check · Moon', text: 'I checked Moon time against the sky. moon369.org/sky-check' }).catch(function () {});
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'moon-sky-check.png'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  function start() {
    nowPanel(); setInterval(nowPanel, 60000);
    renderPlaceBlocks();
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'geolocation' }).then(function (p) { if (p.state === 'granted') askLocation(null, true); }).catch(function () {});
    [$('[data-sc-file]'), $('[data-sc-file2]')].forEach(function (inp) {
      if (!inp) return;
      inp.onchange = function () { var f = inp.files && inp.files[0]; if (f) { if (!loc) askLocation(null, true); readPhoto(f); } inp.value = ''; };
    });
    $('[data-sc-save]').onclick = save;
    var sb = $('[data-sc-seal]'); if (sb) sb.onclick = sealSky;
  }
  var t = 0, iv = setInterval(function () {
    var el = $('[data-sc-file]'), snap = document.querySelector('[data-dc-snapshot]');
    if ((el && !(snap && snap.contains(el)) && window.MoonSkyCheck && window.MoonPhase) || ++t > 200) { clearInterval(iv); if (el) start(); }
  }, 25);
})();
