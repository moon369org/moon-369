/*
 * The Seal: the moment a file is signed. A full-screen scene that shows what is really
 * happening, step by step, then hands the person something worth sharing.
 *
 * The homepage signing flow fires window events:
 *   moon:seal  { phase: 'start', name }
 *   moon:seal  { phase: 'hashed', sha }
 *   moon:seal  { phase: 'signed', receipt, url, href, file }
 *   moon:seal  { phase: 'error', message }
 * Everything shown is real: the fingerprint, the drand round, the signatures, the Moonmark.
 * Lives outside the page's re-rendered tree so nothing resets it mid-animation.
 */
(function () {
  var INK = '#E9E4D8', HEX = '0123456789abcdef';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var el, st = null, raf = 0, lastFocus = null;

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? Math.min(ms, 60) : ms); }); }

  function build() {
    el = h('div', 'sl');
    el.setAttribute('role', 'dialog'); el.tabIndex = -1; el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Signing your file');
    el.innerHTML =
      '<canvas class="sl-dust" aria-hidden="true"></canvas>' +
      '<div class="sl-in">' +
        '<div class="sl-top"><span class="sl-k">SIGNED MOONMARK</span><button type="button" class="sl-x" aria-label="Close">&times;</button></div>' +
        '<div class="sl-stage">' +
          '<div class="sl-moonwrap"><canvas class="hm-moonglow sl-moon" aria-hidden="true"></canvas><img class="sl-load" src="/assets/moon-loader-black.svg" alt="" aria-hidden="true"><div class="sl-ring"></div><div class="sl-ring sl-ring2"></div></div>' +
          '<div class="sl-status" role="status" aria-live="polite"></div>' +
          '<div class="sl-hex" aria-hidden="true"></div>' +
          '<div class="sl-mark" aria-live="polite"></div>' +
          '<div class="sl-stamp">SIGNED &middot; VERIFIED</div>' +
          '<ul class="sl-checks"></ul>' +
        '</div>' +
        '<div class="sl-share">' +
          '<div class="sl-sharek">TELL SOMEONE</div>' +
          '<div class="sl-btns">' +
            '<button type="button" class="sl-b sl-b1" data-a="share">SHARE</button>' +
            '<a class="sl-b" data-a="x" target="_blank" rel="noopener">POST ON X</a>' +
            '<button type="button" class="sl-b" data-a="copy">COPY LINK</button>' +
            '<button type="button" class="sl-b" data-a="img">SAVE IMAGE</button>' +
          '</div>' +
          '<div class="sl-btns sl-btns2">' +
            '<a class="sl-l" data-a="open">Open Moonmark &rarr;</a>' +
            '<a class="sl-l" data-a="receipt">Save receipt</a>' +
            '<a class="sl-l" href="/night">The moon on your birthday &rarr;</a>' +
            '<button type="button" class="sl-l" data-a="done">Done</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('.sl-x').addEventListener('click', close);
    el.addEventListener('click', onAct);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('on')) close(); });
  }

  function open(name) {
    if (!el) build();
    lastFocus = document.activeElement;
    st = { id: Math.random(), name: name, sha: null, signed: null, err: null, t0: performance.now() };
    el.className = 'sl on';
    el.querySelector('.sl-status').textContent = 'FINGERPRINTING ' + String(name || '').toUpperCase().slice(0, 36);
    el.querySelector('.sl-mark').innerHTML = '';
    el.querySelector('.sl-checks').innerHTML = '';
    var hx = el.querySelector('.sl-hex'); hx.innerHTML = '';
    for (var i = 0; i < 64; i++) { var s = h('span', null, HEX[(Math.random() * 16) | 0]); hx.appendChild(s); if (i === 31) hx.appendChild(h('br', 'sl-br')); }
    document.documentElement.classList.add('sl-lock');
    el.focus({ preventScroll: true });
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    run(st.id);
  }

  function close() {
    if (!el) return;
    el.classList.remove('on');
    document.documentElement.classList.remove('sl-lock');
    st = null; cancelAnimationFrame(raf);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  // Scrambling fingerprint while hashing; resolves left to right once the real one is in.
  var resolved = 0;
  function scramble() {
    var spans = el.querySelectorAll('.sl-hex span');
    for (var i = resolved; i < spans.length; i++) if (Math.random() < 0.5) spans[i].textContent = HEX[(Math.random() * 16) | 0];
  }

  // Space dust drifting toward the moon while it signs.
  var dust = [];
  function tick(now) {
    if (!st) return;
    if (!st.sha || resolved < 64) scramble();
    var cv = el.querySelector('.sl-dust'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var c = cv.getContext('2d'); c.clearRect(0, 0, W, H);
    var m = el.querySelector('.sl-moon').getBoundingClientRect();
    var mx = (m.left + m.width / 2) * dpr, my = (m.top + m.height / 2) * dpr, mr = m.width / 1.9 / 2 * dpr;
    var pull = st.signed ? 0 : 1;
    while (dust.length < 220) dust.push({ a: Math.random() * 6.283, d: mr * (1.4 + Math.random() * 5), s: 0.3 + Math.random() * 1.2, r: (0.4 + Math.random() * 0.9) * dpr, o: Math.random() });
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i];
      p.a += 0.0016 * p.s; p.d -= (0.25 + p.s * 0.5) * dpr * (pull ? 1 : -2.5);
      if (p.d < mr * 1.02 || p.d > Math.max(W, H)) { p.d = mr * (2.5 + Math.random() * 4); p.a = Math.random() * 6.283; }
      var x = mx + Math.cos(p.a) * p.d, y = my + Math.sin(p.a) * p.d;
      var lit = Math.max(0, 1 - (p.d - mr) / (mr * 5)); lit *= lit;
      c.globalAlpha = (0.08 + 0.85 * lit) * (0.6 + 0.4 * Math.sin(now / 700 + p.o * 9));
      c.fillStyle = INK; c.beginPath(); c.arc(x, y, p.r, 0, 6.283); c.fill();
    }
    raf = requestAnimationFrame(tick);
  }

  function check(text, sub) {
    var li = h('li', 'sl-c', '<span class="sl-ok" aria-hidden="true"></span><span>' + esc(text) + (sub ? ' <em>' + esc(sub) + '</em>' : '') + '</span>');
    el.querySelector('.sl-checks').appendChild(li);
    requestAnimationFrame(function () { li.classList.add('in'); });
  }

  function rollMark(target) {
    var box = el.querySelector('.sl-mark'); box.innerHTML = '';
    var spans = [];
    for (var i = 0; i < target.length; i++) {
      var ch = target[i], s = h('span', /[0-9]/.test(ch) ? 'd' : 'p', /[0-9]/.test(ch) ? String((Math.random() * 10) | 0) : esc(ch));
      box.appendChild(s); spans.push(s);
    }
    if (reduce) { spans.forEach(function (s, i) { s.textContent = target[i]; s.className += ' set'; }); return Promise.resolve(); }
    return new Promise(function (res) {
      var t0 = performance.now(), dur = 1400;
      (function f(now) {
        var k = Math.min(1, (now - t0) / dur), upto = Math.floor(k * spans.length);
        for (var i = 0; i < spans.length; i++) {
          if (!/[0-9]/.test(target[i])) continue;
          if (i < upto) { if (spans[i].className !== 'd set') { spans[i].textContent = target[i]; spans[i].className = 'd set'; } }
          else spans[i].textContent = String((Math.random() * 10) | 0);
        }
        if (k < 1) requestAnimationFrame(f); else res();
      })(t0);
    });
  }

  function run(id) {
    var alive = function () { return st && st.id === id; };
    // Wait for the fingerprint.
    var waitFor = function (key) { return new Promise(function (r) { (function p() { if (!alive()) return; if (st.err || st[key]) r(); else setTimeout(p, 40); })(); }); };
    waitFor('sha').then(function () {
      if (!alive()) return;
      if (st.err) return fail();
      // Resolve the real fingerprint left to right.
      var spans = el.querySelectorAll('.sl-hex span');
      return new Promise(function (res) {
        var t0 = performance.now(), dur = reduce ? 1 : 700;   // time-based, so a slow frame never stalls it
        (function step(now) {
          if (!alive()) return;
          var upto = Math.min(64, Math.ceil(((now || performance.now()) - t0) / dur * 64));
          for (; resolved < upto; resolved++) { spans[resolved].textContent = st.sha[resolved]; spans[resolved].className = 'set'; }
          if (resolved < 64) requestAnimationFrame(step); else res();
        })(t0);
      }).then(function () {
        if (!alive()) return;
        el.querySelector('.sl-status').textContent = 'SIGNING WITH MOON’S KEYS';
        el.classList.add('signing');
        return waitFor('signed');
      }).then(function () {
        if (!alive()) return;
        if (st.err) return fail();
        var minDur = 3000 - (performance.now() - st.t0);
        return wait(Math.max(0, minDur)).then(reveal);
      });
    });
  }

  function reveal() {
    if (!st) return;
    var s = st.signed, rc = s.receipt, id = st.id;
    var alive = function () { return st && st.id === id; };
    el.classList.remove('signing'); el.classList.add('flare');
    el.querySelector('.sl-status').textContent = 'SIGNED AT';
    var seq = Promise.resolve();
    seq = seq.then(function () { return rollMark(rc.moonmark); })
      .then(function () { if (!alive()) return; el.classList.add('stamped'); return wait(260); })
      .then(function () { if (alive()) check('Fingerprint', rc.sha256.slice(0, 10) + '…' + rc.sha256.slice(-6)); return wait(200); })
      .then(function () { if (alive() && rc.beacon) check('Not before', 'drand round ' + Number(rc.beacon.round).toLocaleString('en-US')); return wait(200); })
      .then(function () { if (alive()) check('Ed25519', 'key ' + rc.key_id); return wait(200); })
      .then(function () { if (alive() && rc.pq) check('ML-DSA-65', 'post-quantum'); return wait(200); })
      .then(function () { var tl = s.tideline; if (alive() && tl) check('Tideline', tl.checkpoint ? 'locked on the XRP Ledger within a minute' : 'in Moon\u2019s public log'); return wait(320); })
      .then(function () {
        if (!alive()) return;
        var x = el.querySelector('[data-a="x"]');
        x.href = 'https://x.com/intent/post?text=' + encodeURIComponent(shareText(rc)) + '&url=' + encodeURIComponent(s.url);
        el.querySelector('[data-a="open"]').href = s.url;
        var r = el.querySelector('[data-a="receipt"]'); r.href = s.href; r.setAttribute('download', s.file);
        if (!navigator.share) el.querySelector('[data-a="share"]').style.display = 'none';
        el.classList.add('done');
        var first = el.querySelector(navigator.share ? '[data-a="share"]' : '[data-a="x"]');
        if (first) first.focus({ preventScroll: true });
      });
  }

  function fail() {
    if (!st) return;
    el.classList.add('err');
    el.querySelector('.sl-status').textContent = st.err || 'Signing failed. Try again.';
    setTimeout(function () { if (st && st.err) close(); }, 2600);
  }

  function shareText(rc) { return 'I just locked a file to the moon. Signed at ' + rc.moonmark + ', provable forever.'; }

  function onAct(e) {
    var t = e.target.closest('[data-a]'); if (!t || !st || !st.signed) return;
    var a = t.getAttribute('data-a'), s = st.signed, rc = s.receipt;
    if (a === 'done') { close(); return; }
    if (a === 'share') {
      e.preventDefault();
      card(rc, s.url).then(function (blob) {
        var data = { title: 'Signed Moonmark', text: shareText(rc), url: s.url };
        var f = blob && new File([blob], 'moonmark.png', { type: 'image/png' });
        if (f && navigator.canShare && navigator.canShare({ files: [f] })) data.files = [f];
        return navigator.share(data);
      }).catch(function () {});
    }
    if (a === 'copy') {
      e.preventDefault();
      (navigator.clipboard ? navigator.clipboard.writeText(s.url) : Promise.reject()).then(function () { flash(t, 'COPIED'); }, function () { flash(t, 'COPY FAILED'); });
    }
    if (a === 'img') {
      e.preventDefault();
      card(rc, s.url).then(function (blob) {
        if (!blob) return;
        var u = URL.createObjectURL(blob), l = document.createElement('a');
        l.href = u; l.download = 'moonmark-' + rc.moonmark.replace(/[^0-9]+/g, '') + '.png'; document.body.appendChild(l); l.click(); l.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 4000); flash(t, 'SAVED');
      });
    }
  }
  function flash(b, txt) { var o = b.textContent; b.textContent = txt; setTimeout(function () { b.textContent = o; }, 1600); }

  // A portrait certificate, sized for phones and stories: moon, Moonmark, proofs, QR.
  function card(rc, url) {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.fillStyle = '#0B0B0D'; c.fillRect(0, 0, W, H);
    // stars
    for (var i = 0; i < 220; i++) { c.globalAlpha = Math.random() * 0.5; c.fillStyle = INK; c.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4); }
    c.globalAlpha = 1;
    // moon, drawn by the same code as the site's moons
    var mv = document.querySelector('.sl-moon');
    if (mv && mv.width) c.drawImage(mv, W / 2 - 330, 120, 660, 660);
    var font = function (w, s, f) { c.font = w + ' ' + s + 'px ' + f; };
    c.textAlign = 'center'; c.fillStyle = '#8A8B8F';
    font(400, 26, '"JetBrains Mono", monospace'); c.fillText('S I G N E D   M O O N M A R K', W / 2, 96);
    c.fillStyle = INK; font(400, 52, '"JetBrains Mono", monospace'); c.fillText(rc.moonmark, W / 2, 860);
    c.fillStyle = '#B9B6AE'; font(400, 26, '"JetBrains Mono", monospace');
    var algs = rc.pq ? 'Ed25519 + ML-DSA-65' : 'Ed25519';
    c.fillText('SHA-256 ' + rc.sha256.slice(0, 16) + '…', W / 2, 920);
    c.fillText(algs + (rc.beacon ? '  ·  drand ' + rc.beacon.round : ''), W / 2, 962);
    // QR
    try {
      if (window.qrcode) {
        var q = window.qrcode(0, 'L'); q.addData(url); q.make();
        var n = q.getModuleCount(), size = 230, cell = size / (n + 4), x0 = W / 2 - size / 2, y0 = 1010;
        c.fillStyle = INK; c.fillRect(x0, y0, size, size); c.fillStyle = '#0B0B0D';
        for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(x0 + (k + 2) * cell, y0 + (r + 2) * cell, Math.ceil(cell), Math.ceil(cell));
      }
    } catch (e) {}
    c.fillStyle = '#8A8B8F'; font(400, 24, '"JetBrains Mono", monospace'); c.fillText('Scan to verify  ·  moon369.org', W / 2, 1300);
    return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/png'); });
  }

  // Standalone signing, for pages without their own flow (the Moonmark page).
  function emit(d) { window.dispatchEvent(new CustomEvent('moon:seal', { detail: d })); }
  // 64-bit difference hash, the same one /embed/moon.js computes, so edited copies can be found later.
  function dhash(file) {
    if (!/^image\//.test(file.type) || !window.createImageBitmap) return Promise.resolve(null);
    return createImageBitmap(file).then(function (src) {
      var cv = document.createElement('canvas'); cv.width = 9; cv.height = 8;
      var x = cv.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, 9, 8);
      var d = x.getImageData(0, 0, 9, 8).data, bits = '', out = '';
      for (var y = 0; y < 8; y++) for (var i = 0; i < 8; i++) {
        var a = (y * 9 + i) * 4, b = a + 4;
        bits += (0.299 * d[a] + 0.587 * d[a + 1] + 0.114 * d[a + 2]) > (0.299 * d[b] + 0.587 * d[b + 1] + 0.114 * d[b + 2]) ? '1' : '0';
      }
      for (var k = 0; k < 64; k += 4) out += parseInt(bits.slice(k, k + 4), 2).toString(16);
      return out;
    }).catch(function () { return null; });
  }
  function sign(file) {
    if (!file) return;
    if (file.size > 1024 * 1024 * 1024) { emit({ phase: 'start', name: file.name }); emit({ phase: 'error', message: 'That file is over 1 GB. Fingerprint it yourself and send the SHA-256 to the API.' }); return; }
    emit({ phase: 'start', name: file.name });
    file.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (d) {
      var sha = Array.from(new Uint8Array(d), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      emit({ phase: 'hashed', sha: sha });
      return dhash(file).then(function (ph) { return fetch('https://api.moon369.org/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ph ? { sha256: sha, phash: ph } : { sha256: sha }) }); })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, b: b }; }); })
        .then(function (x) {
          if (!x.ok) throw new Error(x.status === 429 ? 'Too many requests right now. Try again in a minute.' : ((x.b && x.b.error && x.b.error.message) || 'Signing failed. Try again.'));
          var rc = x.b.receipt;
          var href = URL.createObjectURL(new Blob([JSON.stringify(rc, null, 2) + '\n'], { type: 'application/json' }));
          emit({ phase: 'signed', receipt: rc, tideline: x.b.tideline || null, url: x.b.signed_url, href: href, file: file.name.replace(/[^A-Za-z0-9._-]+/g, '_') + '.moonmark.json' });
        });
    }).catch(function (err) {
      emit({ phase: 'error', message: (err && err.message && !/fetch|network/i.test(err.message)) ? err.message : 'Could not reach Moon. Check your connection and try again.' });
    });
  }
  window.MoonSeal = { dhash: dhash, sign: sign };
  // Any file input marked data-seal-pick signs through the Seal. Delegated, so re-renders don't matter.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches('input[data-seal-pick]')) return;
    var f = t.files && t.files[0]; t.value = ''; sign(f);
  });

  window.addEventListener('moon:seal', function (e) {
    var d = e.detail || {};
    if (d.phase === 'start') { resolved = 0; dust = []; open(d.name); return; }
    if (!st) return;
    if (d.phase === 'hashed') st.sha = d.sha;
    if (d.phase === 'signed') st.signed = d;
    if (d.phase === 'error') st.err = d.message;
  });
})();
