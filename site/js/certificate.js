/* /certificate: certificates of authenticity for art and prints.
   1. The master file is fingerprinted on this device and signed (with its look-alike hash, so copies can be found).
   2. A short statement (artist, title, year, edition, master fingerprint) is signed too.
   3. Each certificate's QR opens the signed statement on moon369.org/m, which re-checks the statement against the
      signature and shows the artwork details, so a collector can scan it on a phone.
   Nothing but fingerprints leaves the device. */
(function () {
  var API = 'https://api.moon369.org';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var clean = function (v, n) { return String(v || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); };
  var hex = function (buf) { return Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); };
  var b64u = function (h) { var s = ''; for (var i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  function sha(text) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex); }
  function statement(c) { return ['moon-coa/1', 'artist:' + c.artist, 'title:' + c.title, 'year:' + c.year, 'edition:' + (c.edition || 'unique'), 'master:' + c.master].join('\n'); }
  function signSha(h, ph) {
    return fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ph ? { sha256: h, phash: ph } : { sha256: h }) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, b: b }; }); })
      .then(function (x) {
        if (!x.ok) throw new Error(x.status === 429 ? 'Too many signatures from here right now. Try again in a minute.' : ((x.b && x.b.error && x.b.error.message) || 'Signing failed. Try again.'));
        return x.b;
      });
  }
  function nsGroups(mark) { var m = /^(.*\d{2}:\d{2}:\d{2})\.(\d{9})$/.exec(mark); return m ? [m[1], '.' + m[2].slice(0, 3) + ' ' + m[2].slice(3, 6) + ' ' + m[2].slice(6)] : [mark, '']; }
  function utc(rc) { return new Date(Number(BigInt(rc.unix_ns) / 1000000n)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
  function qr(url) {
    try {
      var q = window.qrcode(0, 'L'); q.addData(url); q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace(/fill="white"/g, 'fill="#F4F1EA"').replace(/fill="black"/g, 'fill="#0B0B0D"').replace('<svg ', '<svg role="img" aria-label="QR code to check this certificate" ');
    } catch (e) { return ''; }
  }
  var LOGO = '<svg aria-hidden="true" viewBox="-10 -10 424 120" class="nc-logo"><path d="M4,100 V4 L48,64 L92,4 V100" fill="none" stroke="#0B0B0D" stroke-width="8" stroke-linejoin="bevel"/><circle cx="172" cy="50" r="46" fill="none" stroke="#0B0B0D" stroke-width="8"/><circle cx="232" cy="50" r="46" fill="none" stroke="#F4F1EA" stroke-width="18"/><circle cx="232" cy="50" r="46" fill="none" stroke="#0B0B0D" stroke-width="8"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#F4F1EA" stroke-width="18"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#0B0B0D" stroke-width="8"/><path d="M312,100 V4 L400,96 V0" fill="none" stroke="#0B0B0D" stroke-width="8" stroke-linejoin="bevel"/></svg>';

  function certificate(d, no) {
    var pr = d.prints ? d.prints[no - 1] : null, link = d.url + (pr ? '&cp=' + pr.print + '&cs=' + pr.id : '');
    var c = d.coa, mk = nsGroups(d.master.receipt.moonmark), sk = nsGroups(d.cert.receipt.moonmark);
    var ed = c.edition ? 'No. ' + no + ' of ' + c.edition : 'Unique work';
    var rows = [
      ['ARTIST', esc(c.artist) + ' <span class="nc-dim">· as stated</span>'],
      ['TITLE', esc(c.title)],
      ['YEAR', esc(c.year)],
      c.medium ? ['MEDIUM', esc(c.medium)] : null,
      c.size ? ['SIZE', esc(c.size)] : null,
      ['EDITION', '<b class="nc-ed">' + ed + '</b>' + (c.edition ? ' <span class="nc-dim">· edition of ' + c.edition + '</span>' : '')],
      pr ? ['PRINT ID', pr.id + ' <span class="nc-dim">· registered on Moon</span>'] : null,
      ['MASTER FILE', '<span class="nc-hash">' + c.master + '</span>'],
      ['MASTER SIGNED', esc(mk[0]) + '<span class="nc-dim">' + mk[1] + '</span> <span class="nc-dim">· ' + utc(d.master.receipt) + '</span>'],
      ['CERTIFICATE SIGNED', esc(sk[0]) + '<span class="nc-dim">' + sk[1] + '</span> <span class="nc-dim">· ' + utc(d.cert.receipt) + '</span>'],
      ['SIGNED BY', 'Moon · Ed25519 key ' + d.cert.receipt.key_id + (d.cert.receipt.pq ? ' + ML-DSA-65' : '')],
    ].filter(Boolean);
    return '<article class="nc nc-coa" data-ca-cert>' +
      '<div class="nc-top">' + LOGO + '<div class="nc-kind">CERTIFICATE OF AUTHENTICITY</div></div>' +
      '<div class="ca-head">' + (d.thumb ? '<img class="ca-thumb" src="' + d.thumb + '" alt="">' : '') +
      '<div><h2 class="nc-title">' + esc(c.title) + '</h2><p class="ca-by">' + esc(c.artist) + ', ' + esc(c.year) + '</p><p class="ca-ed">' + ed + '</p></div></div>' +
      '<div class="nc-body"><dl class="nc-rows">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="nc-qr">' + qr(link) + '<div>Scan to check this certificate</div></div></div>' +
      '<div class="ca-sign"><div><span></span>Artist signature</div><div><span></span>Date</div></div>' +
      '<div class="nc-how"><b>HOW TO CHECK</b> Scan the code: Moon re-checks the artist, title, year and edition against its signature' + (pr ? ', confirms this print number, and shows how often this certificate has been checked' : '') + '. To check the artwork file itself, open moon369.org/check and drop it in.</div>' +
      '<div class="nc-foot">Moon proves the master file and this certificate&#39;s details existed at the moments shown and have not been changed since. The artist&#39;s name is as stated; Moon does not verify it.' + (pr ? ' Each print has its own ID on Moon, so a print number cannot be invented or changed.' : '') + '</div>' +
      '</article>';
  }

  function show(d) {
    var out = $('[data-ca-out]'), n = d.coa.edition ? Number(d.coa.edition) : 1;
    var href = URL.createObjectURL(new Blob([JSON.stringify({ master: d.master.receipt, certificate: d.cert.receipt, statement: d.statement, prints: d.prints || undefined }, null, 2) + '\n'], { type: 'application/json' }));
    out.innerHTML = '<div class="nt-done"><div class="nt-ok">SIGNED · ' + (n > 1 ? n + ' CERTIFICATES ARE READY, ONE PER PRINT' : 'YOUR CERTIFICATE IS READY') + '</div>' +
      '<div class="nt-btns"><button type="button" class="nt-p" data-ca-print>PRINT OR SAVE AS PDF</button>' +
      '<a href="' + href + '" download="' + esc(d.coa.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'artwork') + '.moon-coa.json">SAVE RECEIPTS</a>' +
      '<a href="' + esc(d.url + (d.prints ? '&cp=1&cs=' + d.prints[0].id : '')) + '" target="_blank" rel="noopener">OPEN WHAT COLLECTORS SEE</a>' +
      '<button type="button" data-ca-again>ANOTHER ARTWORK</button></div>' +
      '<p class="nt-tip">Keep the receipts with your master file. ' + (n > 1 ? 'Below is certificate No. 1; printing gives you all ' + n + '.' : '') + '</p></div>' +
      '<div class="nt-paper">' + certificate(d, 1) + '</div>';
    var pr = document.getElementById('nt-print');
    if (!pr) { pr = document.createElement('div'); pr.id = 'nt-print'; document.body.appendChild(pr); }
    var pages = ''; for (var i = 1; i <= n; i++) pages += certificate(d, i);
    pr.innerHTML = pages;
    $('[data-ca-print]', out).onclick = function () { window.print(); };
    $('[data-ca-again]', out).onclick = function () { out.innerHTML = ''; pr.innerHTML = ''; $('[data-ca-drop]').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.moonTrack) window.moonTrack('Art certificate', { prints: n });
  }

  function status(t, bad) { var s = $('[data-ca-status]'); s.textContent = t; s.className = 'nt-status' + (bad ? ' bad' : ''); }
  var picked = null;

  function thumb(file) {
    if (!/^image\//.test(file.type)) return Promise.resolve('');
    return createImageBitmap(file).then(function (im) {
      var s = Math.min(1, 600 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.85);
    }).catch(function () { return ''; });
  }

  function run() {
    var f = picked;
    var c = { artist: clean($('[data-ca-artist]').value, 80), title: clean($('[data-ca-title]').value, 120), year: clean($('[data-ca-year]').value, 12),
      medium: clean($('[data-ca-medium]').value, 120), size: clean($('[data-ca-size]').value, 60), edition: '' };
    var kind = $('[data-ca-kind]:checked').value, num = parseInt($('[data-ca-n]').value, 10);
    if (!f) { status('Choose the master file of the artwork first.', true); return; }
    if (!c.artist || !c.title || !c.year) { status('Fill in the artist, title and year.', true); return; }
    if (kind === 'edition') { if (!(num >= 2 && num <= 100)) { status('An edition is 2 to 100 prints.', true); return; } c.edition = String(num); }
    if (f.size > 1024 * 1024 * 1024) { status('That file is over 1 GB.', true); return; }
    $('[data-ca-out]').innerHTML = '';
    var d = { coa: c };
    status('Fingerprinting ' + f.name + ' on this device…');
    f.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (dg) {
      c.master = hex(dg);
      return Promise.all([window.MoonSeal ? window.MoonSeal.dhash(f) : null, thumb(f)]);
    }).then(function (a) {
      d.thumb = a[1];
      status('Moon is signing the master file…');
      return signSha(c.master, a[0]);
    }).then(function (m) {
      d.master = m; d.statement = statement(c);
      status('Moon is signing the certificate…');
      return sha(d.statement).then(function (h) { return signSha(h); });
    }).then(function (s) {
      d.cert = s;
      var q = '&ca=' + encodeURIComponent(c.artist) + '&ct=' + encodeURIComponent(c.title) + '&cy=' + encodeURIComponent(c.year) + (c.edition ? '&ce=' + c.edition : '') + '&cm=' + b64u(c.master);
      d.url = s.signed_url + q;
      if (!c.edition) { status(''); show(d); return; }
      status('Registering each print on Moon…');
      return fetch(API + '/v1/editions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statement: d.statement, receipt: s.receipt }) })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
        .then(function (x) {
          if (!x.ok || !x.b.prints) throw new Error((x.b && x.b.error && x.b.error.message) || 'Could not register the prints. Try again.');
          d.prints = x.b.prints; status(''); show(d);
        });
    }).catch(function (e) {
      status(e && e.message && !/fetch|network/i.test(e.message) ? e.message : 'Could not reach Moon. Check your connection and try again.', true);
    });
  }

  function boot() {
    var drop = $('[data-ca-drop]'); if (!drop || drop.dataset.on) return !!drop;
    var snap = document.querySelector('[data-dc-snapshot]'); if (snap && snap.contains(drop)) return false;
    drop.dataset.on = '1';
    var inp = $('input[type=file]', drop), name = $('[data-ca-file]', drop);
    var take = function (f) { if (!f) return; picked = f; name.textContent = f.name; drop.classList.add('has'); };
    inp.onchange = function () { take(inp.files && inp.files[0]); inp.value = ''; };
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    var n = $('[data-ca-n]');
    document.querySelectorAll('[data-ca-kind]').forEach(function (r) { r.onchange = function () { n.disabled = $('[data-ca-kind]:checked').value !== 'edition'; }; });
    $('[data-ca-form]').onsubmit = function (e) { e.preventDefault(); run(); };
    return true;
  }
  var t = 0, iv = setInterval(function () { if (boot() || ++t > 200) clearInterval(iv); }, 50);
})();
