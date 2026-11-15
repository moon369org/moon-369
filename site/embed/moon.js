/* Moon embed. One script, two tags:
 *   <moon-badge sha256="…"></moon-badge>   a small badge that shows who registered a file and when
 *   <moon-check></moon-check>              a drop zone: drop any file, see if it is on Moon
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
    return (extra || '') + row('MOONMARK', esc(when(r))) + row('REGISTERED BY', who(r)) + (r.label ? row('LABEL', esc(r.label)) : '') +
      row('PROOF', '<a href="' + esc(r.signed_url) + '" target="_blank" rel="noopener" style="color:' + C.fg + '">Open the signed Moonmark ↗</a>');
  }

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
        '<div class="t">DROP A FILE TO CHECK IT</div><div class="s">See if it is on Moon, who registered it and when. For photos, Moon also finds edited and resized copies. Your file stays on your device.</div></label>' +
        '<div class="o" part="result" aria-live="polite"></div>';
      var z = root.querySelector('.z'), inp = root.querySelector('input'), out = root.querySelector('.o');
      ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('on'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function () { z.classList.remove('on'); }); });
      z.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) self.check(f, out); });
      inp.addEventListener('change', function () { if (inp.files[0]) self.check(inp.files[0], out); inp.value = ''; });
    }
    check(file, out) {
      out.innerHTML = '<div class="h">CHECKING ' + esc(file.name).toUpperCase() + '…</div>';
      var sha, ph;
      Promise.all([sha256(file), dhash(file)]).then(function (a) {
        sha = a[0]; ph = a[1];
        return Promise.all([lookup(sha), ph ? similar(ph) : Promise.resolve(null)]);
      }).then(function (a) {
        var ex = a[0], sim = a[1], fp = '<div class="f">SHA-256 ' + sha + (ph ? '<br>LOOK-ALIKE HASH ' + ph : '') + '</div>';
        var others = sim ? sim.matches.filter(function (m) { return m.sha256 !== sha; }) : [];
        var html = '';
        if (ex.registered) {
          html += '<div class="h" style="color:' + C.ok + '">' + moonSvg(16) + 'THIS EXACT FILE IS ON MOON</div>' + fp + '<div class="m">' + regCard(ex.first) + '</div>';
          if (ex.count > 1) html += '<div class="n" style="margin-top:10px">Registered ' + ex.count + ' times. The earliest is shown.</div>';
        } else if (others.length) {
          html += '<div class="h" style="color:' + C.warn + '">' + moonSvg(16) + 'AN EDITED COPY OF A FILE ON MOON</div>' + fp +
            '<div class="n">This exact file was never registered, but it looks like ' + (others.length === 1 ? 'a picture' : others.length + ' pictures') + ' that were. The earliest registration is usually the original.</div>';
        } else {
          html += '<div class="h">NOT ON MOON</div>' + fp + '<div class="n">Nobody has registered this file' + (ph ? ' or anything that looks like it' : '') + '. <a href="https://moon369.org/#sign">Sign it now</a> to be the first.</div>';
        }
        others.slice(0, 5).forEach(function (m) {
          html += '<div class="m">' + regCard(m.first, row('MATCH', (64 - m.distance) + ' of 64 look-alike bits match')) + '</div>';
        });
        out.innerHTML = html;
        out.dispatchEvent(new CustomEvent('moon:checked', { bubbles: true, composed: true, detail: { sha256: sha, phash: ph, exact: ex, similar: sim } }));
      }).catch(function (e) { out.innerHTML = '<div class="h" style="color:' + C.warn + '">COULD NOT CHECK</div><div class="n">' + esc(e.message || e) + '</div>'; });
    }
  }

  if (!customElements.get('moon-badge')) customElements.define('moon-badge', MoonBadge);
  if (!customElements.get('moon-check')) customElements.define('moon-check', MoonCheck);
  window.MoonEmbed = { sha256: sha256, dhash: dhash, lookup: lookup, similar: similar, api: API };
})();
