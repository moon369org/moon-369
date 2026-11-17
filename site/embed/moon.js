/* Moon embed. One script:
 *   <moon-badge sha256="…"></moon-badge>   a small badge that shows who registered a file and when
 *   <moon-check></moon-check>              a drop zone: drop any file, see if it is on Moon
 *   <div data-moon-night="1969-07-20"></div>  the moon on any date as a card, linked to Your Moon (data-time="2017", data-for="born|met|wed|kid")
 *   <moon-moment mark="1928.05.12-15.00.00" name="Launch"></moon-moment>  a small moon + Moonmark that opens the full card, in the reader's own time
 *   <moon-clock size="56"></moon-clock>    the live moon beside ticking Moon time, linked to moon369.org
 *   <moon-live size="160"></moon-live>     Moon's live moon: today's phase and tilt, glowing and animated (at="<unix ms>" for another moment)
 * Files never leave the browser. Only the fingerprint (and, for images, a 64-bit look-alike hash) is sent.
 * <script src="https://moon369.org/embed/moon.js" defer></script>
 */
(function () {
  if (window.MoonEmbed) return;
  var API = (document.currentScript && document.currentScript.getAttribute('data-api')) || 'https://api.moon369.org';
  var C = { bg: '#0B0B0D', fg: '#E9E4D8', dim: '#8A8B8F', line: '#24262A', ok: '#7FBF8E', warn: '#D9A35F' };
  var FONT = "Inter, system-ui, sans-serif", MONO = "'JetBrains Mono', ui-monospace, monospace", HEAD = "Syncopate, Inter, sans-serif";

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function sha256(file) { return file.arrayBuffer().then(function (b) { return crypto.subtle.digest('SHA-256', b); }).then(hex); }

  /* 64-bit difference hash (dHash): 9x8 grayscale, each bit = pixel brighter than its right neighbour,
     rows top to bottom, most significant bit first. Survives resizing, recompression and small edits. */
  function dhashFromSource(src) {
    var cv = document.createElement('canvas'); cv.width = 9; cv.height = 8;
    var x = cv.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, 9, 8);
    var d = x.getImageData(0, 0, 9, 8).data, bits = '';
    for (var y = 0; y < 8; y++) for (var i = 0; i < 8; i++) {
      var a = (y * 9 + i) * 4, b = a + 4;
      var ga = 0.299 * d[a] + 0.587 * d[a + 1] + 0.114 * d[a + 2], gb = 0.299 * d[b] + 0.587 * d[b + 1] + 0.114 * d[b + 2];
      bits += ga > gb ? '1' : '0';
    }
    var out = ''; for (var k = 0; k < 64; k += 4) out += parseInt(bits.slice(k, k + 4), 2).toString(16);
    return out;
  }

  /* Moon's look-alike hash, v2: the same on every device. The picture is drawn on black at up to 1024 px,
     averaged over exact 9×8 blocks, and each bit says whether a block is brighter than its right neighbour. */
  function dhashBox(src) {
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight; if (!w || !h) return null;
    var s = Math.min(1, 1024 / Math.max(w, h)), W = Math.max(9, Math.round(w * s)), H = Math.max(8, Math.round(h * s));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var x = cv.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, W, H);
    var d = x.getImageData(0, 0, W, H).data, g = new Float64Array(72), n = new Float64Array(72);
    for (var yy = 0; yy < H; yy++) { var cy = Math.min(7, Math.floor(yy * 8 / H)); for (var xx = 0; xx < W; xx++) {
      var c = cy * 9 + Math.min(8, Math.floor(xx * 9 / W)), i = (yy * W + xx) * 4; g[c] += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n[c]++; } }
    var bits = '', out = '';
    for (var y = 0; y < 8; y++) for (var k = 0; k < 8; k++) bits += g[y * 9 + k] / n[y * 9 + k] > g[y * 9 + k + 1] / n[y * 9 + k + 1] ? '1' : '0';
    for (var q = 0; q < 64; q += 4) out += parseInt(bits.slice(q, q + 4), 2).toString(16);
    return out;
  }
  /** The look-alike hashes of an image: { v2, v1 }. v1 is the older, browser-dependent hash, still checked for earlier registrations. */
  // Video and audio look-alike hashes come from a separate script, loaded only when a clip is checked.
  var mediaReady = null;
  function mediaHash(file) {
    if (!mediaReady) mediaReady = window.MoonMediaHash ? Promise.resolve() : new Promise(function (ok, no) {
      var sc = document.createElement('script'); sc.src = 'https://moon369.org/js/media-hash.js'; sc.async = true; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc);
    });
    return mediaReady.then(function () { return window.MoonMediaHash.hash(file); }).then(function (h) { return h ? { v2: h, v1: null } : null; }).catch(function () { return null; });
  }
  function dhashes(file) {
    if (/^(video|audio)\//.test(file.type)) return mediaHash(file);
    if (!/^image\//.test(file.type)) return Promise.resolve(null);
    var load = window.createImageBitmap ? createImageBitmap(file) : new Promise(function (ok, no) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = URL.createObjectURL(file); });
    return load.then(function (src) { return { v2: dhashBox(src), v1: dhashFromSource(src) }; }).catch(function () { return null; });
  }
  function dhash(file) {
    if (!/^image\//.test(file.type)) return Promise.resolve(null);
    var load = window.createImageBitmap ? createImageBitmap(file) : new Promise(function (ok, no) {
      var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = URL.createObjectURL(file);
    });
    return load.then(dhashFromSource).catch(function () { return null; });
  }
  function getJson(path, body) {
    return fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(r.status === 429 ? 'Too many checks right now. Try again in a minute.' : ((j && j.error && j.error.message) || ('Error ' + r.status))); return j; }); });
  }
  function lookup(sha) { return getJson('/v1/lookup/' + sha); }
  function similar(ph) { return getJson('/v1/lookup/similar', { phash: ph }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function when(r) { return r.moonmark + '  ·  ' + r.utc.replace('T', ' ').replace(/\.\d+Z$/, ' UTC'); }
  function who(r) {
    var w = r.registrant_verified ? esc(r.registrant) + ' <span style="color:' + C.ok + '">verified</span>' : '<span style="color:' + C.dim + '">anonymous</span>';
    if (r.on_behalf_of) w += '<br><span style="color:' + C.dim + '">for</span> ' + esc(r.on_behalf_of) + ' <span style="color:' + C.dim + '">(as stated)</span>';
    return w;
  }
  function moonSvg(sz) {
    return '<svg viewBox="-12 -12 24 24" width="' + sz + '" height="' + sz + '" aria-hidden="true" style="display:block;flex:none"><circle r="10" fill="' + C.fg + '"/><path d="M0,-10 A10,10 0 0 0 0,10 A6,10 0 0 1 0,-10" fill="' + C.bg + '" opacity=".85"/></svg>';
  }
  function row(k, v) { return '<div style="display:grid;grid-template-columns:96px 1fr;gap:12px;padding:9px 0;border-top:1px solid ' + C.line + '"><div style="font:500 10px/1.6 ' + MONO + ';letter-spacing:.2em;color:' + C.dim + '">' + k + '</div><div style="font:400 12.5px/1.6 ' + MONO + ';word-break:break-word">' + v + '</div></div>'; }
  function regCard(r, extra) {
    return (extra || '') + row('MOONMARK', esc(when(r))) + row('REGISTERED BY', who(r)) + (/^Sky-checked:/.test(r.label || '') ? row('SKY', '<span style="color:' + C.ok + ';letter-spacing:.2em">SKY-CHECKED</span><br><span style="color:' + C.dim + '">' + esc(r.label.replace(/^Sky-checked:\s*/, '')) + (r.registrant_verified ? '' : ' (measured by Sky Check in the sealer\'s browser)') + '</span>') : r.label ? row('LABEL', esc(r.label)) : '') +
      row('PROOF', '<a href="' + esc(r.signed_url) + '" target="_blank" rel="noopener" style="color:' + C.fg + '">Open the signed Moonmark ↗</a>');
  }


  /* ---------- Content Credentials (C2PA), when the page loads /js/c2pa-read.js ---------- */
  var SRC = { 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture': 'a camera capture', 'http://cv.iptc.org/newscodes/digitalsourcetype/computationalCapture': 'a computational capture',
    'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia': 'AI-generated', 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia': 'edited with AI' };
  function readCredentials(file) { return window.MoonC2pa ? window.MoonC2pa.read(file).catch(function () { return null; }) : Promise.resolve(null); }
  function credInfo(store) {
    var m = store && store.manifests && store.manifests[store.active_manifest]; if (!m) return null;
    var res = (store.validation_results && store.validation_results.activeManifest) || {};
    var fails = (res.failure || []).map(function (f) { return f.code; }).filter(function (c) { return c !== 'signingCredential.untrusted'; });
    var ts = (res.success || []).filter(function (x) { return x.code === 'timeStamp.validated'; })[0];
    var acts = ((m.assertions || []).filter(function (a) { return /^c2pa\.actions/.test(a.label); })[0] || { data: { actions: [] } }).data.actions || [];
    var made = acts.filter(function (a) { return a.action === 'c2pa.created'; })[0];
    var moonA = ((m.assertions || []).filter(function (a) { return a.label === 'org.moon369.moonmark'; })[0] || {}).data || null;
    return { ok: fails.length === 0, fails: fails, app: (m.claim_generator_info && m.claim_generator_info[0] && m.claim_generator_info[0].name) || m.claim_generator || '',
      signer: (m.signature_info && m.signature_info.common_name) || '', issuer: (m.signature_info && m.signature_info.issuer) || '', when: (m.signature_info && m.signature_info.time) || '',
      how: made && made.digitalSourceType ? (SRC[made.digitalSourceType] || made.digitalSourceType.split('/').pop()) : '',
      tsa: ts ? ((/matched: (.+)$/.exec(ts.explanation || '') || [])[1] || '') : '', moon: moonA };
  }
  function credCard(c) {
    var head = c.ok ? '<div class="h" style="color:' + C.ok + '">' + moonSvg(16) + 'CONTENT CREDENTIALS CHECK OUT</div>'
      : '<div class="h" style="color:' + C.warn + '">' + moonSvg(16) + 'CONTENT CREDENTIALS DO NOT MATCH THIS FILE</div><div class="n">It was changed after it was signed, or the credentials are broken.</div>';
    var rows = (c.how ? row('MADE AS', esc(c.how)) : '') + (c.app ? row('MADE WITH', esc(c.app)) : '') +
      (c.signer ? row('SIGNED BY', esc(c.signer) + (c.issuer ? ' <span style="color:' + C.dim + '">· certificate from ' + esc(c.issuer) + '</span>' : '')) : '') +
      (c.tsa ? row('TIMESTAMP', esc(c.tsa) + (c.when ? ' <span style="color:' + C.dim + '">· ' + esc(c.when.replace('T', ' ').slice(0, 19)) + ' UTC</span>' : '')) : '');
    if (c.moon && c.moon.receipt) rows += row('ON MOON', '<span data-moon-capture>Signed at capture, ' + esc(c.moon.moonmark || '') + '. Checking the receipt…</span>');
    return head + '<div class="m">' + rows + '</div>';
  }
  function checkCapture(c, root) {
    if (!c || !c.moon || !c.moon.receipt) return;
    var el = function () { return root.querySelector('[data-moon-capture]'); };
    Promise.all([getJson('/v1/verify', { receipt: c.moon.receipt }), lookup(c.moon.receipt.sha256).catch(function () { return null; })]).then(function (a) {
      var v = a[0], lk = a[1], e = el(); if (!e) return;
      if (!v.valid) { e.innerHTML = '<span style="color:' + C.warn + '">The Moonmark inside does not verify (' + esc(v.reason || 'invalid') + ').</span>'; return; }
      var who = lk && lk.first ? who_(lk.first) : '';
      e.innerHTML = 'Signed at capture, ' + esc(c.moon.moonmark) + (who ? ', registered by ' + who : '') + '. ' + (c.moon.signed_url ? '<a href="' + esc(c.moon.signed_url) + '" target="_blank" rel="noopener">Open the signed Moonmark ↗</a>' : '');
    }).catch(function () { var e = el(); if (e) e.textContent = 'Signed at capture, ' + (c.moon.moonmark || '') + '. Could not reach Moon to check the receipt.'; });
  }
  function who_(r) { return r.registrant_verified ? esc(r.registrant) + ' <span style="color:' + C.ok + '">verified</span>' : '<span style="color:' + C.dim + '">' + (r.registrant === 'anonymous' ? 'anonymous' : 'an unverified name') + '</span>'; }

  /* ---------- <moon-badge sha256="…"> ---------- */
  class MoonBadge extends HTMLElement {
    static get observedAttributes() { return ['sha256']; }
    connectedCallback() { if (!this.shadowRoot) this.attachShadow({ mode: 'open' }); this.load(); }
    attributeChangedCallback() { if (this.shadowRoot) this.load(); }
    load() {
      var sha = (this.getAttribute('sha256') || '').toLowerCase(), root = this.shadowRoot, self = this;
      if (!/^[0-9a-f]{64}$/.test(sha)) { root.innerHTML = ''; return; }
      lookup(sha).then(function (j) {
        if (!j.registered) { root.innerHTML = self.hasAttribute('show-missing') ? self.pill('NOT ON MOON', C.dim) : ''; return; }
        var r = j.first;
        root.innerHTML = self.pill(r.registrant_verified ? 'ON MOON · ' + esc(r.registrant).toUpperCase() : 'ON MOON', C.fg) +
          '<div part="panel" class="p" role="dialog" aria-label="Moon registration" hidden><div style="font:700 11px/1 ' + HEAD + ';letter-spacing:.24em;margin-bottom:10px">REGISTERED ON MOON</div>' + regCard(r) +
          (j.count > 1 ? '<div style="font:12px/1.5 ' + FONT + ';color:' + C.dim + ';padding-top:10px">Registered ' + j.count + ' times. This is the earliest.</div>' : '') + '</div>';
        var b = root.querySelector('button'), p = root.querySelector('.p');
        b.onclick = function (e) { e.stopPropagation(); p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); };
        document.addEventListener('click', function (e) { if (!self.contains(e.target)) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); } });
      }).catch(function () { root.innerHTML = ''; });
    }
    pill(t, col) {
      return '<style>:host{display:inline-block;position:relative;font-family:' + FONT + '}button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;background:rgba(11,11,13,.86);color:' + col + ';border:1px solid ' + C.line + ';border-radius:999px;font:700 9.5px/1 ' + HEAD + ';letter-spacing:.2em;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}button:focus-visible{outline:2px solid ' + C.fg + ';outline-offset:2px}.p{position:absolute;z-index:2147483000;top:calc(100% + 8px);left:0;width:min(360px,86vw);box-sizing:border-box;padding:18px 18px 14px;background:' + C.bg + ';color:' + C.fg + ';border:1px solid ' + C.line + ';box-shadow:0 20px 50px rgba(0,0,0,.5)}.p[hidden]{display:none}</style>' +
        '<button part="badge" aria-expanded="false">' + moonSvg(14) + '<span>' + t + '</span></button>';
    }
  }

  /* ---------- <moon-check> ---------- */
  class MoonCheck extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      var root = this.attachShadow({ mode: 'open' }), self = this;
      root.innerHTML = '<style>:host{display:block;font-family:' + FONT + ';color:' + C.fg + '}' +
        '.z{position:relative;border:1px dashed #3A3B3F;padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;transition:border-color .2s,background .2s;cursor:pointer}' +
        '.z.on{border-color:' + C.fg + ';background:rgba(233,228,216,.04)}.z input{position:absolute;inset:0;opacity:0;cursor:pointer}' +
        '.t{font:700 13px/1.3 ' + HEAD + ';letter-spacing:.2em}.s{font-size:14px;line-height:1.6;color:#B9B6AE;max-width:440px}' +
        '.o{margin-top:22px}.h{font:700 12px/1.3 ' + HEAD + ';letter-spacing:.2em;display:flex;align-items:center;gap:10px;margin-bottom:12px}' +
        '.f{font:400 11.5px/1.6 ' + MONO + ';color:' + C.dim + ';word-break:break-all;margin-bottom:14px}.m{border:1px solid ' + C.line + ';padding:16px 18px 10px;margin-top:12px}' +
        '.n{font-size:13.5px;line-height:1.6;color:#B9B6AE}a{color:' + C.fg + '}</style>' +
        '<label class="z" part="zone"><input type="file" aria-label="Choose a file to check">' + moonSvg(30) +
        '<div class="t">DROP A FILE TO CHECK IT</div><div class="s">See if it is on Moon, who registered it and when. For photos, video and audio, Moon also finds edited and re-encoded copies. Your file stays on your device.</div></label>' +
        '<div class="o" part="result" aria-live="polite"></div>';
      var z = root.querySelector('.z'), inp = root.querySelector('input'), out = root.querySelector('.o');
      ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('on'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function () { z.classList.remove('on'); }); });
      z.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) self.check(f, out); });
      inp.addEventListener('change', function () { if (inp.files[0]) self.check(inp.files[0], out); inp.value = ''; });
    }
    check(file, out) {
      out.innerHTML = '<div class="h">CHECKING ' + esc(file.name).toUpperCase() + '…</div>';
      var sha, ph, cred, root = this.shadowRoot;
      Promise.all([sha256(file), dhashes(file), readCredentials(file)]).then(function (a) {
        sha = a[0]; var hs = a[1]; ph = hs ? hs.v2 : null; cred = credInfo(a[2]);
        var sims = hs ? [similar(hs.v2)].concat(hs.v1 && hs.v1 !== hs.v2 ? [similar(hs.v1)] : []) : [];
        return Promise.all([lookup(sha), Promise.all(sims).then(function (rs) {
          if (!rs.length) return null;
          var seen = {}, matches = [];
          rs.forEach(function (r) { (r.matches || []).forEach(function (m) { if (!seen[m.sha256] || seen[m.sha256].distance > m.distance) seen[m.sha256] = m; }); });
          Object.keys(seen).forEach(function (k) { matches.push(seen[k]); });
          matches.sort(function (x, y) { return x.distance - y.distance; });
          return { matches: matches };
        })]);
      }).then(function (a) {
        var ex = a[0], sim = a[1], fp = '<div class="f">SHA-256 ' + sha + (ph ? '<br>LOOK-ALIKE HASH ' + ph : '') + '</div>';
        var capSha = cred && cred.moon && cred.moon.captured ? cred.moon.captured.sha256 : null;
        // The capture itself (before its credentials were written in) is not an "edited copy" of this file.
        var others = sim ? sim.matches.filter(function (m) { return m.sha256 !== sha && m.sha256 !== capSha; }) : [];
        var html = cred ? credCard(cred) : '';
        if (cred && cred.moon && !ex.registered && !others.length) {
          html += fp;
        } else if (ex.registered) {
          html += '<div class="h" style="color:' + C.ok + '">' + moonSvg(16) + 'THIS EXACT FILE IS ON MOON</div>' + fp + '<div class="m">' + regCard(ex.first) + '</div>';
          if (ex.count > 1) html += '<div class="n" style="margin-top:10px">Registered ' + ex.count + ' times. The earliest is shown.</div>';
        } else if (others.length) {
          html += '<div class="h" style="color:' + C.warn + '">' + moonSvg(16) + 'AN EDITED COPY OF A FILE ON MOON</div>' + fp +
            '<div class="n">This exact file was never registered, but it ' + (/^v:/.test(ph || '') ? 'looks like ' + (others.length === 1 ? 'a video that was' : others.length + ' videos that were') : /^a:/.test(ph || '') ? 'sounds like ' + (others.length === 1 ? 'a recording that was' : others.length + ' recordings that were') : 'looks like ' + (others.length === 1 ? 'a picture that was' : others.length + ' pictures that were')) + '. The earliest registration is usually the original.</div>';
        } else {
          html += '<div class="h">NOT ON MOON</div>' + fp + '<div class="n">Nobody has registered this file' + (ph ? ' or anything that looks like it' : '') + '. <a href="https://moon369.org/#sign">Sign it now</a> to be the first.</div>';
        }
        others.slice(0, 5).forEach(function (m) {
          html += '<div class="m">' + regCard(m.first, row('MATCH', (64 - m.distance) + ' of 64 look-alike bits match')) + '</div>';
        });
        out.innerHTML = html;
        checkCapture(cred, root);
        out.dispatchEvent(new CustomEvent('moon:checked', { bubbles: true, composed: true, detail: { sha256: sha, phash: ph, exact: ex, similar: sim } }));
      }).catch(function (e) { out.innerHTML = '<div class="h" style="color:' + C.warn + '">COULD NOT CHECK</div><div class="n">' + esc(e.message || e) + '</div>'; });
    }
  }

  // <moon-live>: loaded only when a page uses it, from the same one-file script the moon369 npm package ships.
  var SITE = (document.currentScript && document.currentScript.getAttribute('data-site')) || API.replace('//api.', '//'), liveAsked = false;
  function wantLive() {
    if (liveAsked || customElements.get('moon-live') || !document.querySelector('moon-live,moon-clock')) return;
    liveAsked = true; var sc = document.createElement('script'); sc.src = SITE + '/js/moon-live.js'; sc.async = true; document.head.appendChild(sc);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wantLive); else wantLive();
  if (window.MutationObserver) { var mo = new MutationObserver(function () { wantLive(); if (liveAsked) mo.disconnect(); }); mo.observe(document.documentElement, { childList: true, subtree: true }); }
  // Powered by Moon: every widget links home, per Moon's attribution rules.
  function powered(color) { return '<a href="https://moon369.org" target="_blank" rel="noopener" style="font:500 10px/1 ' + MONO + ';letter-spacing:.22em;color:' + (color || C.dim) + ';text-decoration:none">POWERED BY MOON</a>'; }

  // <div data-moon-night="1969-07-20" data-time="2017" data-for="born">: that night's card, linked to the full explorer.
  function mountNight(el) {
    if (el.__moon) return; el.__moon = true;
    var d = el.getAttribute('data-moon-night') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { el.textContent = 'data-moon-night needs a date like 1969-07-20'; return; }
    var t = (el.getAttribute('data-time') || '').replace(':', ''), f = el.getAttribute('data-for') || 'day';
    var z = el.getAttribute('data-z') || (function () { var o = -new Date(d + 'T12:00:00').getTimezoneOffset(), a = Math.abs(o); return (o < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + String(a % 60).padStart(2, '0'); })();
    var rest = (/^\d{4}$/.test(t) ? 't=' + t + '&' : '') + 'z=' + encodeURIComponent(z) + '&for=' + (/^(day|born|met|wed|kid)$/.test(f) ? f : 'day');
    var w = Math.min(1200, parseInt(el.getAttribute('data-width'), 10) || 600);
    el.innerHTML = '<a href="https://moon369.org/night/' + d + '?' + rest + '" target="_blank" rel="noopener" style="display:block;max-width:' + w + 'px">' +
      '<img src="' + API + '/v1/night.png?d=' + d + '&' + rest + '&v=2" alt="The moon on ' + esc(d) + ', on Moon" width="' + w + '" height="' + Math.round(w * 0.525) + '" loading="lazy" style="display:block;width:100%;height:auto;border-radius:6px"></a>' +
      '<div style="margin-top:6px;text-align:right;max-width:' + w + 'px">' + powered() + '</div>';
  }
  function scanNights() { Array.prototype.forEach.call(document.querySelectorAll('[data-moon-night]'), mountNight); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanNights); else scanNights();
  if (window.MutationObserver) new MutationObserver(scanNights).observe(document.documentElement, { childList: true, subtree: true });

  // <moon-moment mark="1928.05.12-15.00.00" name="Launch party">: a small moon and the Moonmark inline; tap for the full card in your own time.
  var EP = -62165308562978.61, MSEC = 1000 * 1.0403730490216803, MREX = /^(-?\d+)\.(\d{1,2})\.(\d{1,2})(?:[- T](\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?/;
  class MoonMoment extends HTMLElement {
    connectedCallback() {
      if (this.built) return; this.built = true;
      var mark = (this.getAttribute('mark') || '').trim(), name = (this.getAttribute('name') || '').slice(0, 80), u = MREX.exec(mark);
      if (!u) { this.textContent = mark; return; }
      var p2 = function (n) { return String(n).padStart(2, '0'); }, fd = function (k) { return Math.ceil(k * 369 / 13); };
      var ms = EP + ((+u[1] * 369 + fd(+u[2] - 1) + (+u[3]) - 1) * 86400 + (+u[4] || 0) * 3600 + (+u[5] || 0) * 60 + (+u[6] || 0)) * MSEC;
      var text = u[1] + '.' + p2(u[2]) + '.' + p2(u[3]) + (u[4] ? ' ' + p2(u[4]) + ':' + u[5] + (u[6] ? ':' + u[6] : '') : '');
      var path = u[1] + '.' + p2(u[2]) + '.' + p2(u[3]) + '-' + p2(u[4] || 0) + '.' + (u[5] || '00') + '.' + (u[6] || '00');
      var url = 'https://moon369.org/m/' + path + (name ? '?e=' + encodeURIComponent(name).replace(/%20/g, '+') : '');
      var local = ''; try { local = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(ms); } catch (e) { local = new Date(ms).toString(); }
      var sh = this.attachShadow({ mode: 'open' });
      sh.innerHTML = '<style>:host{display:inline-block;position:relative;vertical-align:middle}button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:inherit}' +
        'button span{font-family:' + MONO + ';font-size:.92em;border-bottom:1px dotted currentColor}img.i{width:1.4em;height:1.4em;display:block}' +
        '.p{position:absolute;z-index:2147483000;left:0;top:calc(100% + 8px);width:min(420px,90vw);background:' + C.bg + ';color:' + C.fg + ';border:1px solid ' + C.line + ';padding:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);font:13px/1.5 ' + FONT + '}' +
        '.p[hidden]{display:none}.p img{width:100%;display:block}.l{margin:10px 0 8px}.r{display:flex;justify-content:space-between;align-items:center}.r a.o{color:' + C.fg + ';font:600 11px ' + MONO + ';letter-spacing:.16em;text-decoration:none}</style>' +
        '<button type="button" aria-expanded="false"><img class="i" alt="" src="' + API + '/v1/moon.svg?size=64&unix=' + Math.round(ms) + '"><span>' + esc(name ? name + ' · ' + text : text) + '</span></button>' +
        '<div class="p" hidden role="dialog" aria-label="' + esc(name || 'Moonmark ' + text) + '"><img alt="" loading="lazy" src="' + API + '/v1/card.png?moonmark=' + encodeURIComponent(path + '.000000000') + (name ? '&event=' + encodeURIComponent(name) : '&qr=1') + '&v=3">' +
        '<div class="l">In your time: ' + esc(local) + '</div><div class="r"><a class="o" href="' + url + '" target="_blank" rel="noopener">OPEN →</a>' + powered() + '</div></div>';
      var b = sh.querySelector('button'), pnl = sh.querySelector('.p');
      var set = function (on) { pnl.hidden = !on; b.setAttribute('aria-expanded', String(on)); };
      var hover = window.matchMedia && matchMedia('(hover:hover)').matches;
      b.addEventListener('click', function (e) { e.stopPropagation(); set(pnl.hidden); });
      if (hover) { this.addEventListener('mouseenter', function () { set(true); }); this.addEventListener('mouseleave', function () { set(false); }); }
      document.addEventListener('click', function () { set(false); });
    }
  }
  if (!customElements.get('moon-moment')) customElements.define('moon-moment', MoonMoment);

  if (!customElements.get('moon-badge')) customElements.define('moon-badge', MoonBadge);
  if (!customElements.get('moon-check')) customElements.define('moon-check', MoonCheck);
  window.MoonEmbed = { sha256: sha256, dhash: function (f) { return dhashes(f).then(function (h) { return h && h.v2; }); }, dhashes: dhashes, lookup: lookup, similar: similar, api: API };
})();
