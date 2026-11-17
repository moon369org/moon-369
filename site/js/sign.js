/* /sign: one click from any file or text to a signed Moonmark, with its link, QR code and a verification card.
   Nothing leaves the device but the SHA-256 (and, for images, Moon's 64-bit look-alike hash).
   Pages can deep-link a mode: /sign#text. Other sites can hand over text with /sign#text=<url-encoded>. */
(function () {
  var API = 'https://api.moon369.org';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var hex = function (buf) { return Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); };
  function size(n) { return n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function local(ms) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(ms); } catch (e) { return new Date(ms).toISOString(); } }
  function safeName(n) { return String(n || 'moon').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80); }

  var mode = 'file', busy = false, last = null;

  function setMode(m) {
    mode = m;
    document.querySelectorAll('[data-sg-tab]').forEach(function (b) { var on = b.dataset.sgTab === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('[data-sg-pane]').forEach(function (p) { p.hidden = p.dataset.sgPane !== m; });
  }

  function status(t, bad) { var s = $('[data-sg-status]'); if (s) { s.textContent = t || ''; s.className = 'sg-status' + (bad ? ' bad' : ''); } }

  // Images also get Moon's look-alike hash so edited copies can be found; seal.js computes it.
  function lookAlike(file) {
    if (!file || !/^(image|video|audio)\//.test(file.type) || !window.MoonSeal) return Promise.resolve(null);
    return window.MoonSeal.dhash(file).catch(function () { return null; });
  }

  function sign(item) {
    if (busy) return;
    var lb = $('[data-sg-label]'); item.label = lb ? lb.value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    busy = true; status(item.kind === 'text' ? 'Fingerprinting your text…' : 'Fingerprinting ' + item.name + '…');
    $('[data-sg-out]').hidden = true;
    var bytesP = item.file ? item.file.arrayBuffer() : Promise.resolve(new TextEncoder().encode(item.text).buffer);
    bytesP.then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (d) {
      var sha = hex(d);
      status('Moon is signing it…');
      return lookAlike(item.file).then(function (ph) {
        var body = { sha256: sha }; if (ph) body.phash = ph;
        return fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, b: b }; }); }).then(function (x) {
        if (!x.ok) throw new Error(x.status === 429 ? 'Too many requests right now. Try again in a minute.' : ((x.b && x.b.error && x.b.error.message) || 'Signing failed. Try again.'));
        last = { item: item, sha: sha, rc: x.b.receipt, url: x.b.signed_url, base: x.b.signed_url, page: x.b.moonmark_url };
        status(''); show();
        try { window.moonTrack && window.moonTrack('sign_page', { kind: item.kind }); } catch (e) {}
      });
    }).catch(function (e) {
      status(e && e.message && !/fetch|network/i.test(e.message) ? e.message : 'Could not reach Moon. Check your connection and try again.', true);
    }).then(function () { busy = false; });
  }

  function show() {
    var L = last, rc = L.rc, ms = Number(BigInt(rc.unix_ns) / 1000000n), out = $('[data-sg-out]');
    var f = window.MoonPhase ? window.MoonPhase.fraction(ms) : 0.25;
    var qr = ''; try { qr = window.MoonQR.svg(L.url, f); } catch (e) {}
    var what = (L.item.label ? esc(L.item.label) + ' · ' : '') + (L.item.kind === 'text' ? 'Text · ' + size(new TextEncoder().encode(L.item.text).length) : esc(L.item.name) + ' · ' + size(L.item.size));
    out.innerHTML =
      '<div class="sg-card">' +
        '<div class="sg-cardl">' +
          '<div class="sg-k">SIGNED ON MOON</div>' +
          '<div class="sg-mark">' + esc(rc.moonmark.slice(0, 19)) + '<span>' + esc(rc.moonmark.slice(19)) + '</span></div>' +
          '<div class="sg-when">' + esc(local(ms)) + '</div>' +
          '<dl class="sg-dl"><div><dt>WHAT</dt><dd>' + what + '</dd></div><div><dt>FINGERPRINT</dt><dd class="sg-mono">' + L.sha + '</dd></div></dl>' +
          '<div class="sg-link"><input type="text" readonly value="' + esc(L.url) + '" aria-label="Signed Moonmark link"><button type="button" class="sg-btn p" data-sg-a="copy">COPY LINK</button></div>' +
          '<div class="sg-acts">' +
            (navigator.share ? '<button type="button" class="sg-btn" data-sg-a="share">SHARE</button>' : '') +
            '<a class="sg-btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + encodeURIComponent((L.item.label ? L.item.label + ': ' : '') + 'Signed on Moon at ' + L.rc.moonmark.slice(0, 19) + '. Anyone can check it.') + '&amp;url=' + encodeURIComponent(L.url) + '">POST TO X</a>' +
            '<button type="button" class="sg-btn" data-sg-a="card">SAVE CARD</button>' +
            '<button type="button" class="sg-btn" data-sg-a="receipt">SAVE RECEIPT</button>' +
            (L.item.kind === 'text' ? '<button type="button" class="sg-btn" data-sg-a="text">SAVE TEXT</button>' : '') +
            (/^photo-\d{8}-\d{6}\./.test(L.item.name || '') ? '<button type="button" class="sg-btn" data-sg-a="photo">SAVE PHOTO</button>' : '') +
            '<a class="sg-btn" href="' + esc(L.url) + '" target="_blank" rel="noopener">OPEN →</a>' +
          '</div>' +
          (L.item.kind === 'file' ? '<div class="sg-where"><label for="sg-where">WHERE IS IT ONLINE? <span>Optional. Link your original on your own site and it shows on the Moonmark in a viewer. Image hosts and social sites are marked as origin not proven.</span></label>' +
            '<div class="sg-link"><input id="sg-where" type="url" inputmode="url" placeholder="https://your-site.com/work/original.png" value="' + esc(L.fileUrl || '') + '" data-sg-where><button type="button" class="sg-btn" data-sg-a="where">' + (L.fileUrl ? 'UPDATE' : 'ADD TO LINK') + '</button></div>' +
            '<div class="sg-where-m" data-sg-where-m>' + (L.whereMsg || '') + '</div></div>' : '') +
          '<p class="sg-note">' + (L.item.kind === 'text'
            ? 'To check it later, drop the saved text file on <a href="/verify">Verify</a>. It must match exactly, down to every space and line break.'
            : 'Anyone can drop this exact file on <a href="/verify">Verify</a> to see it was signed, and when.') + ' The receipt proves it on its own, even without Moon.</p>' +
        '</div>' +
        '<div class="sg-qr">' + qr + '<span>SCAN TO CHECK</span></div>' +
      '</div>';
    out.hidden = false;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function img(src, cors) {
    return new Promise(function (ok, no) { var i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = function () { ok(i); }; i.onerror = no; i.src = src; });
  }

  // The verification card: a picture of the proof, to post or attach. The link and QR carry the real thing.
  function card() {
    var L = last, rc = L.rc, ms = Number(BigInt(rc.unix_ns) / 1000000n), W = 1200, H = 1500;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
    var sp = function (t) { return t.split('').join(String.fromCharCode(8202)); };
    var f = window.MoonPhase ? window.MoonPhase.fraction(ms) : 0.25;
    var qrSvg = ''; try { qrSvg = window.MoonQR.svg(L.url, f); } catch (e) {}
    var moonP = img(API + '/v1/moon.png?size=640&unix_ns=' + rc.unix_ns, true).catch(function () { return null; });
    var qrP = qrSvg ? img(URL.createObjectURL(new Blob([qrSvg], { type: 'image/svg+xml' }))).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([moonP, qrP, document.fonts ? document.fonts.ready : null]).then(function (a) {
      c.fillStyle = '#0B0B0D'; c.fillRect(0, 0, W, H);
      if (a[0]) c.drawImage(a[0], W - 640 + 60, -60, 640, 640);
      c.textAlign = 'left';
      c.fillStyle = '#8A8B8F'; c.font = '26px "JetBrains Mono", monospace'; c.fillText(sp('SIGNED ON MOON'), 80, 140);
      c.fillStyle = '#E9E4D8'; c.font = '700 54px Syncopate, sans-serif';
      var title = L.item.kind === 'text' ? 'TEXT' : (L.item.name || 'FILE').toUpperCase();
      if (title.length > 22) title = title.slice(0, 21) + '…';
      c.fillText(title, 80, 230);
      if (L.item.label) { c.fillStyle = '#A2A3A7'; c.font = '34px Inter, sans-serif'; c.fillText(L.item.label.length > 40 ? L.item.label.slice(0, 39) + '…' : L.item.label, 80, 290); }
      c.fillStyle = '#8A8B8F'; c.font = '24px "JetBrains Mono", monospace'; c.fillText(sp('MOONMARK'), 80, 470);
      c.fillStyle = '#E9E4D8'; c.font = '64px "JetBrains Mono", monospace'; c.fillText(rc.moonmark.slice(0, 19), 80, 550);
      c.fillStyle = '#8A8B8F'; c.font = '34px "JetBrains Mono", monospace'; c.fillText(rc.moonmark.slice(19), 80, 600);
      c.font = '28px Inter, sans-serif'; c.fillText(local(ms), 80, 660);
      c.fillStyle = '#8A8B8F'; c.font = '24px "JetBrains Mono", monospace'; c.fillText(sp('FINGERPRINT · SHA-256'), 80, 760);
      c.fillStyle = '#E9E4D8'; c.font = '28px "JetBrains Mono", monospace'; c.fillText(L.sha.slice(0, 32), 80, 810); c.fillText(L.sha.slice(32), 80, 852);
      if (a[1]) { c.drawImage(a[1], 80, 930, 400, 400); }
      c.fillStyle = '#E9E4D8'; c.font = '700 26px Syncopate, sans-serif'; c.fillText('SCAN TO CHECK', 540, 990);
      c.fillStyle = '#A2A3A7'; c.font = '28px Inter, sans-serif';
      ['The QR opens the signed Moonmark.', 'Drop the ' + (L.item.kind === 'text' ? 'saved text' : 'file') + ' on', 'moon369.org/verify to match it', 'exactly.'].forEach(function (t, i) { c.fillText(t, 540, 1050 + i * 42); });
      c.fillStyle = '#24262A'; c.fillRect(80, 1390, W - 160, 2);
      c.fillStyle = '#E9E4D8'; c.font = '700 28px Syncopate, sans-serif'; c.fillText('MOON', 80, 1452);
      c.fillStyle = '#8A8B8F'; c.font = '26px "JetBrains Mono", monospace'; c.textAlign = 'right'; c.fillText('moon369.org', W - 80, 1450);
      return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
    });
  }

  function act(a) {
    var L = last; if (!L) return;
    if (a === 'where') {
      var v = ($('[data-sg-where]').value || '').trim(), m = $('[data-sg-where-m]');
      if (!v) { L.fileUrl = ''; L.url = L.base; L.whereMsg = ''; show(); return; }
      if (!/^https:\/\/[^\s]+$/i.test(v) || v.length > 1500) { m.className = 'sg-where-m bad'; m.textContent = 'Use the full https link to the file itself.'; return; }
      m.className = 'sg-where-m'; m.textContent = 'Checking the file at that link…';
      var mine = function (h) { return h === L.sha; };
      // Try the file straight from this browser first; if the site doesn't allow that, Moon checks it.
      fetch(v, { mode: 'cors' }).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (b) { return crypto.subtle.digest('SHA-256', b); })
        .then(function (d) { return { match: mine(hex(d)) }; })
        .catch(function () { return fetch(API + '/v1/file-check?url=' + encodeURIComponent(v) + '&sha256=' + L.sha).then(function (r) { return r.json(); }); })
        .then(function (c) {
          if (c && c.match) {
            L.fileUrl = v; L.url = L.base + '&f=' + encodeURIComponent(v);
            // Same clues the Moonmark uses: a public library, or dates more than 30 days before signing.
            return fetch(API + '/v1/file-check?url=' + encodeURIComponent(v) + '&sha256=' + L.sha).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (k) {
              var pv = k.provenance || {}, cut = Number(BigInt(L.rc.unix_ns) / 1000000n) - 30 * 864e5, why = [];
              var hc = pv.host || (pv.library ? { kind: 'library', name: pv.library } : null);
              if (hc) why.push(hc.kind === 'library' ? 'it is hosted on ' + hc.name + ', a public image library' : hc.kind === 'anonymous' ? 'it is on ' + hc.name + ', an image host anyone can use without a name' : 'it is on ' + hc.name + ', where anyone can post anything');
              if (pv.created && Date.parse(pv.created.date) < cut) why.push('the date inside the file is ' + pv.created.date.slice(0, 10));
              if (pv.last_modified && Date.parse(pv.last_modified) < cut) why.push('the site has had it since ' + pv.last_modified.slice(0, 10));
              L.whereMsg = why.length ? '<span class="warn">Added, but the Moonmark will say ORIGIN NOT PROVEN: ' + esc(why.join(', and ')) + '. Moon proves when a file existed, not who made it.</span>'
                : '<span class="ok">✓ That is the exact file. The Moonmark now shows it, marked as existing by this moment. For the strongest proof, link your own site.</span>';
              show();
            });
          }
          m.className = 'sg-where-m bad';
          m.textContent = c && c.error ? c.error.message + '.' : 'The file at that link is not the exact file you signed. Sites like Instagram and X re-compress images, so link the original (your site, Dropbox, IPFS).';
        }).catch(function () { m.className = 'sg-where-m bad'; m.textContent = 'Could not check that link. Try again.'; });
      return;
    }
    var base = L.item.kind === 'text' ? 'moon-text-' + L.rc.moonmark.slice(0, 10) : safeName(L.item.name);
    if (a === 'copy') {
      var inp = $('.sg-link input'); inp.select();
      (navigator.clipboard ? navigator.clipboard.writeText(L.url) : Promise.reject()).catch(function () { document.execCommand('copy'); })
        .then(function () { var b = $('[data-sg-a="copy"]'); b.textContent = 'COPIED'; setTimeout(function () { b.textContent = 'COPY LINK'; }, 1600); });
    } else if (a === 'share') {
      navigator.share({ title: 'Signed on Moon', text: (L.item.label ? L.item.label + ': ' : '') + 'Signed on Moon at ' + L.rc.moonmark.slice(0, 19) + '. Check it:', url: L.url }).catch(function () {});
    } else if (a === 'receipt') {
      download(new Blob([JSON.stringify(L.rc, null, 2) + '\n'], { type: 'application/json' }), base + '.moonmark.json');
    } else if (a === 'photo') {
      download(L.item.file, L.item.name);
    } else if (a === 'text') {
      download(new Blob([L.item.text], { type: 'text/plain;charset=utf-8' }), base + '.txt');
    } else if (a === 'card') {
      card().then(function (b) {
        var file = new File([b], base + '-moon-card.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) return navigator.share({ files: [file], title: 'Signed on Moon' }).catch(function () {});
        download(b, file.name);
      });
    }
  }

  function start() {
    document.querySelectorAll('[data-sg-tab]').forEach(function (b) { b.onclick = function () { setMode(b.dataset.sgTab); }; });
    var fi = $('[data-sg-file]'), zone = $('[data-sg-zone]'), ta = $('[data-sg-text]');
    var pick = function (f) { if (!f) return; if (f.size > 1024 * 1024 * 1024) { status('That file is over 1 GB. Fingerprint it yourself and send the SHA-256 to the API.', true); return; } sign({ kind: 'file', file: f, name: f.name, size: f.size }); };
    fi.onchange = function () { pick(fi.files && fi.files[0]); fi.value = ''; };
    // Phones: take a photo and sign it on the spot. Named by the moment it was taken, since cameras hand over generic names.
    var cam = $('[data-sg-cam]');
    if (cam) cam.onchange = function () {
      var f = cam.files && cam.files[0]; cam.value = ''; if (!f) return;
      var d = new Date(), p2 = function (n) { return String(n).padStart(2, '0'); }, ext = (/\.(\w+)$/.exec(f.name) || [, 'jpg'])[1];
      sign({ kind: 'file', file: f, name: 'photo-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + '.' + ext, size: f.size });
    };
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { pick(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    // Paste a screenshot or a copied image or file anywhere on the page to sign it. Text pastes into fields as usual.
    document.addEventListener('paste', function (e) {
      var t = e.target, typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
      var items = (e.clipboardData && e.clipboardData.items) || [], f = null;
      for (var i = 0; i < items.length && !f; i++) if (items[i].kind === 'file') f = items[i].getAsFile();
      if (!f || (typing && !/^image\//.test(f.type))) return;
      e.preventDefault(); setMode('file');
      var d = new Date(), p2 = function (n) { return String(n).padStart(2, '0'); }, ext = (/\/(\w+)/.exec(f.type) || [, 'png'])[1].replace('jpeg', 'jpg');
      var name = f.name && f.name !== 'image.png' ? f.name : 'pasted-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + '.' + ext;
      pick(new File([f], name, { type: f.type }));
    });
    $('[data-sg-signtext]').onclick = function () {
      var t = ta.value; if (!t.trim()) { status('Paste or type the text to sign first.', true); ta.focus(); return; }
      sign({ kind: 'text', text: t });
    };
    ta.oninput = function () { $('[data-sg-count]').textContent = ta.value ? size(new TextEncoder().encode(ta.value).length) : ''; };
    var lbl = $('[data-sg-label]');
    document.querySelectorAll('[data-sg-chip]').forEach(function (b) { b.onclick = function () { lbl.value = lbl.value === b.textContent ? '' : b.textContent; document.querySelectorAll('[data-sg-chip]').forEach(function (x) { x.classList.toggle('on', x.textContent === lbl.value); }); }; });
    lbl.oninput = function () { document.querySelectorAll('[data-sg-chip]').forEach(function (x) { x.classList.toggle('on', x.textContent === lbl.value); }); };
    $('[data-sg-out]').addEventListener('click', function (e) { var b = e.target.closest('[data-sg-a]'); if (b) act(b.dataset.sgA); });
    $('[data-sg-out]').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('[data-sg-where]')) { e.preventDefault(); act('where'); } });
    // Deep links: #text opens the text tab; #text=... prefills it (for tools that hand over AI output or a page's text).
    var h = location.hash;
    if (/^#text/.test(h)) { setMode('text'); var m = /^#text=(.*)$/.exec(h); if (m) { try { ta.value = decodeURIComponent(m[1]); ta.oninput(); } catch (e) {} } }
  }
  var t = 0, iv = setInterval(function () {
    var el = $('[data-sg-file]'), snap = document.querySelector('[data-dc-snapshot]');
    if ((el && !(snap && snap.contains(el))) || ++t > 200) { clearInterval(iv); if (el) start(); }
  }, 25);
})();
