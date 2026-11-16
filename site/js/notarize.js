/* /notarize: drop a document, Moon signs its fingerprint, print a certificate with a QR code to the signed Moonmark.
   The document never leaves the device: only its SHA-256 goes to Moon. */
(function () {
  var API = 'https://api.moon369.org';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  function size(n) { return n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function nsGroups(mark) { var m = /^(.*\d{2}:\d{2}:\d{2})\.(\d{9})$/.exec(mark); return m ? [m[1], '.' + m[2].slice(0, 3) + ' ' + m[2].slice(3, 6) + ' ' + m[2].slice(6)] : [mark, '']; }
  function roundUtc(n) { return new Date((1692803367 + (n - 1) * 3) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
  function localTime(ms) {
    try {
      var z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return new Intl.DateTimeFormat('en-US', { timeZone: z, dateStyle: 'full', timeStyle: 'long' }).format(ms);
    } catch (e) { return new Date(ms).toString(); }
  }
  // Plain square modules at the lowest density: the signed link is long, and a printed certificate must scan first time.
  function qr(url) {
    try {
      var q = window.qrcode(0, 'L'); q.addData(url); q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace(/fill="white"/g, 'fill="#F4F1EA"').replace(/fill="black"/g, 'fill="#0B0B0D"').replace('<svg ', '<svg role="img" aria-label="QR code for the signed Moonmark" ');
    } catch (e) { return ''; }
  }
  var LOGO = '<svg aria-hidden="true" viewBox="-10 -10 424 120" class="nc-logo"><path d="M4,100 V4 L48,64 L92,4 V100" fill="none" stroke="#0B0B0D" stroke-width="8" stroke-linejoin="bevel"/><circle cx="172" cy="50" r="46" fill="none" stroke="#0B0B0D" stroke-width="8"/><circle cx="232" cy="50" r="46" fill="none" stroke="#F4F1EA" stroke-width="18"/><circle cx="232" cy="50" r="46" fill="none" stroke="#0B0B0D" stroke-width="8"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#F4F1EA" stroke-width="18"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" fill="none" stroke="#0B0B0D" stroke-width="8"/><path d="M312,100 V4 L400,96 V0" fill="none" stroke="#0B0B0D" stroke-width="8" stroke-linejoin="bevel"/></svg>';

  function certificate(d) {
    var rc = d.receipt, ms = Number(BigInt(rc.unix_ns) / 1000000n), mk = nsGroups(rc.moonmark);
    var rows = [
      ['DOCUMENT', esc(d.name) + ' <span class="nc-dim">· ' + size(d.size) + '</span>'],
      d.by ? ['PREPARED BY', esc(d.by) + ' <span class="nc-dim">· as stated, not verified by Moon</span>'] : null,
      ['SHA-256 FINGERPRINT', '<span class="nc-hash">' + rc.sha256 + '</span>'],
      ['UTC', new Date(ms).toISOString().replace('T', ' ').replace('Z', '') + ' UTC'],
      ['LOCAL TIME', esc(localTime(ms))],
      rc.beacon ? ['NOT BEFORE', roundUtc(rc.beacon.round) + ' <span class="nc-dim">· drand round ' + Number(rc.beacon.round).toLocaleString('en-US') + '</span>'] : null,
      ['SIGNED BY', 'Moon · Ed25519 key ' + rc.key_id + (rc.pq ? ' + ML-DSA-65 (post-quantum) key ' + rc.pq.key_id : '')],
      d.tideline ? ['PUBLIC LOG', 'Moon Tideline · lune ' + esc(d.tideline.lune) + ', entry ' + d.tideline.index] : null,
    ].filter(Boolean);
    return '<article class="nc" data-nt-cert>' +
      '<div class="nc-top">' + LOGO + '<div class="nc-kind">CERTIFICATE OF TIMESTAMP</div></div>' +
      '<h2 class="nc-title">' + esc(d.title || d.name) + '</h2>' +
      '<p class="nc-lead">This document existed, exactly as it is, at this moment. Moon signed its fingerprint at</p>' +
      '<div class="nc-mark">' + esc(mk[0]) + '<span>' + mk[1] + '</span></div>' +
      '<div class="nc-body"><dl class="nc-rows">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="nc-qr">' + qr(d.url) + '<div>Scan to check the signature</div></div></div>' +
      '<div class="nc-how"><b>HOW TO CHECK</b> Scan the code, or open moon369.org/check and drop in the document. If even one byte has changed, it will not match. The signature can also be checked offline with Moon&#39;s public keys at moon369.org/trust.</div>' +
      '<div class="nc-foot">A cryptographic timestamp: it proves this exact document existed at this moment. It does not identify who wrote it or certify any signature in it, and it is not the act of a notary public.</div>' +
      '</article>';
  }

  function show(d) {
    var out = $('[data-nt-out]');
    var href = URL.createObjectURL(new Blob([JSON.stringify(d.receipt, null, 2) + '\n'], { type: 'application/json' }));
    out.innerHTML = '<div class="nt-done"><div class="nt-ok">SIGNED · YOUR CERTIFICATE IS READY</div>' +
      '<div class="nt-btns"><button type="button" class="nt-p" data-nt-print>PRINT OR SAVE AS PDF</button>' +
      '<a href="' + href + '" download="' + esc(d.name.replace(/[^A-Za-z0-9._-]+/g, '_')) + '.moonmark.json">SAVE RECEIPT</a>' +
      '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">OPEN SIGNED MOONMARK</a>' +
      '<button type="button" data-nt-again>ANOTHER DOCUMENT</button></div>' +
      '<p class="nt-tip">Keep the receipt with the document. With both, anyone can check it, even if Moon is offline.</p></div>' +
      '<div class="nt-paper">' + certificate(d) + '</div>';
    // A copy of the certificate sits directly under <body> for printing; everything else is hidden on paper.
    var pr = document.getElementById('nt-print');
    if (!pr) { pr = document.createElement('div'); pr.id = 'nt-print'; document.body.appendChild(pr); }
    pr.innerHTML = certificate(d);
    $('[data-nt-print]', out).onclick = function () { window.print(); };
    $('[data-nt-again]', out).onclick = function () { out.innerHTML = ''; var pr2 = document.getElementById('nt-print'); if (pr2) pr2.innerHTML = ''; $('[data-nt-drop]').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.moonTrack) window.moonTrack('Notarized', {});
  }

  function status(t, bad) { var s = $('[data-nt-status]'); s.textContent = t; s.className = 'nt-status' + (bad ? ' bad' : ''); }

  function run(file) {
    if (!file) return;
    if (file.size > 1024 * 1024 * 1024) { status('That file is over 1 GB. Fingerprint it yourself and send the SHA-256 to the API.', true); return; }
    var title = ($('[data-nt-title]').value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    var by = ($('[data-nt-by]').value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    $('[data-nt-out]').innerHTML = '';
    status('Fingerprinting ' + file.name + ' on this device…');
    file.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (dg) {
      var sha = Array.from(new Uint8Array(dg), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      status('Moon is signing the fingerprint…');
      return fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha256: sha }) })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, b: b }; }); });
    }).then(function (x) {
      if (!x.ok) throw new Error(x.status === 429 ? 'Too many requests right now. Try again in a minute.' : ((x.b && x.b.error && x.b.error.message) || 'Signing failed. Try again.'));
      status('');
      show({ receipt: x.b.receipt, url: x.b.signed_url, tideline: x.b.tideline || null, name: file.name, size: file.size, title: title, by: by });
    }).catch(function (e) {
      status(e && e.message && !/fetch|network/i.test(e.message) ? e.message : 'Could not reach Moon. Check your connection and try again.', true);
    });
  }

  function boot() {
    var drop = $('[data-nt-drop]'); if (!drop || drop.dataset.on) return !!drop;
    var snap = document.querySelector('[data-dc-snapshot]'); if (snap && snap.contains(drop)) return false;
    drop.dataset.on = '1';
    var inp = $('input[type=file]', drop);
    inp.onchange = function () { var f = inp.files && inp.files[0]; inp.value = ''; run(f); };
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; run(f); });
    return true;
  }
  var n = 0, iv = setInterval(function () { if (boot() || ++n > 200) clearInterval(iv); }, 50);
})();
