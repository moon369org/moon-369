/*
 * Evidence pack. The visitor gives a saved receipt (and, if they have it, the original file).
 * The browser fingerprints the file itself, asks Moon for a signed evidence statement, re-checks the
 * Tideline proof locally, then shows a printable report and offers a bundle of every file needed to
 * check it independently.
 */
(function () {
  var API = 'https://api.moon369.org';
  var enc = new TextEncoder();
  var state = { receipt: null, receiptName: '', file: null, sha: null, busy: false, result: null, error: '' };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var hex = function (b) { return Array.from(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };
  var unhex = function (h) { return Uint8Array.from((h || '').match(/../g) || [], function (x) { return parseInt(x, 16); }); };
  var sha = function (u8) { return crypto.subtle.digest('SHA-256', u8).then(function (d) { return new Uint8Array(d); }); };
  function cat() { var a = Array.prototype.slice.call(arguments), n = a.reduce(function (s, x) { return s + x.length; }, 0), o = new Uint8Array(n), i = 0; a.forEach(function (x) { o.set(x, i); i += x.length; }); return o; }

  // The receipt's leaf in the Tideline: SHA-256 of 0x00 and its signed bytes (same rules as the API).
  function signedLines(r) {
    var lines = [r.receipt, 'sha256:' + r.sha256, r.moonmark, r.unix_ns, r.key_id];
    if (r.beacon && (r.receipt === 'moonmark-receipt/2' || r.receipt === 'moonmark-receipt/3')) lines.push(r.beacon.network + ':' + r.beacon.round + ':' + r.beacon.signature);
    if (r.receipt === 'moonmark-receipt/3' && r.pq) lines.push('ml-dsa-65:' + r.pq.key_id);
    return lines.join('\n');
  }
  function leafOf(r) { return sha(cat(new Uint8Array([0]), enc.encode(signedLines(r)))).then(hex); }
  function inclusion(leaf, index, size, path, root) {
    if (!(index >= 0 && index < size)) return Promise.resolve(false);
    var fn = index, sn = size - 1, r = unhex(leaf), i = 0;
    function next() {
      if (i >= path.length) return Promise.resolve(sn === 0 && hex(r) === root);
      if (sn === 0) return Promise.resolve(false);
      var pb = unhex(path[i++]), left;
      if (fn % 2 === 1 || fn === sn) { left = true; } else left = false;
      return sha(cat(new Uint8Array([1]), left ? pb : r, left ? r : pb)).then(function (h) {
        r = h;
        if (left && fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
        fn >>= 1; sn >>= 1;
        return next();
      });
    }
    return next();
  }

  function pickerHtml() {
    return '<div class="ev-noprint" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:24px">' +
      '<div class="ev-card"><div class="ev-k">1 · THE RECEIPT</div><p style="margin:0;font-size:15px;line-height:1.6;color:#A2A3A7">The <code>.moonmark.json</code> file you saved when you signed. Required.</p>' +
      '<label class="ev-btn" style="align-self:flex-start">CHOOSE RECEIPT<input type="file" accept=".json,application/json" data-ev-receipt></label>' +
      (state.receiptName ? '<div class="ev-pick">' + esc(state.receiptName) + (state.receipt ? ' · ' + esc(state.receipt.moonmark) : '') + '</div>' : '') + '</div>' +
      '<div class="ev-card"><div class="ev-k">2 · THE ORIGINAL FILE</div><p style="margin:0;font-size:15px;line-height:1.6;color:#A2A3A7">Optional, but it makes the evidence stronger: proves this exact file is the one Moon signed. It never leaves your device.</p>' +
      '<label class="ev-btn" style="align-self:flex-start">CHOOSE FILE<input type="file" data-ev-file></label>' +
      (state.file ? '<div class="ev-pick">' + esc(state.file.name) + (state.sha ? ' · ' + state.sha.slice(0, 12) + '…' : ' · fingerprinting…') + '</div>' : '') + '</div>' +
      '</div>' +
      '<div class="ev-noprint" style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-top:24px">' +
      '<button type="button" class="ev-btn p" data-ev-go' + (state.receipt && !state.busy && !(state.file && !state.sha) ? '' : ' disabled') + '>' + (state.busy ? 'CHECKING…' : 'BUILD EVIDENCE PACK') + '</button>' +
      (state.error ? '<span style="font-size:14px;color:#E0A49C">' + esc(state.error) + '</span>' : '') + '</div>';
  }

  function row(k, v) { return '<tr><td>' + esc(k) + '</td><td>' + v + '</td></tr>'; }
  var ok = function (t) { return '<span class="ev-ok">✓ ' + esc(t) + '</span>'; };
  var no = function (t) { return '<span class="ev-no">✕ ' + esc(t) + '</span>'; };
  var REASONS = { bad_signature: 'the signature does not match', bad_pq_signature: 'the post-quantum signature does not match', unknown_key: 'it was not signed by a Moon key', content_mismatch: 'the file is not the one Moon signed', moonmark_mismatch: 'the Moonmark does not match the signed moment', bad_beacon: 'the drand beacon is not genuine', beacon_after_moment: 'the beacon is later than the moment', malformed: 'the receipt is incomplete', unknown_version: 'unknown receipt version', not_a_receipt: 'not a Moon receipt' };

  function reportHtml() {
    var R = state.result, st = R.statement, c = st.checks, t = st.tideline, rc = R.receipt;
    var valid = c.valid && (c.content_match !== false);
    var local = new Date(Number(BigInt(rc.unix_ns) / 1000000n));
    var h = '<div class="ev-report" id="ev-report">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap"><div><h2>MOON EVIDENCE REPORT</h2><div class="ev-small" style="margin-top:8px">Issued ' + esc(st.issued.utc.replace('T', ' ').slice(0, 19)) + ' UTC · Moonmark ' + esc(st.issued.moonmark) + '</div></div>' +
      '<svg viewBox="-10 -10 424 120" style="width:120px;height:auto" aria-label="Moon"><path d="M4,100 V4 L48,64 L92,4 V100" style="fill:none;stroke:#141413;stroke-width:8;stroke-linejoin:bevel"/><circle cx="172" cy="50" r="46" style="fill:none;stroke:#141413;stroke-width:8"/><circle cx="232" cy="50" r="46" style="fill:none;stroke:#F4F1EA;stroke-width:18"/><circle cx="232" cy="50" r="46" style="fill:none;stroke:#141413;stroke-width:8"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" style="fill:none;stroke:#F4F1EA;stroke-width:18"/><path d="M211.91,72.87 A46,46 0 0 1 188.65,92.88" style="fill:none;stroke:#141413;stroke-width:8"/><path d="M312,100 V4 L400,96 V0" style="fill:none;stroke:#141413;stroke-width:8;stroke-linejoin:bevel"/></svg></div>';
    h += '<div class="ev-verdict' + (valid ? '' : ' bad') + '"><b>' + (valid ? 'VERIFIED' : 'NOT VERIFIED') + '</b><span style="font-size:14px;line-height:1.5">' +
      (valid ? 'This file' + (state.file ? ' (' + esc(state.file.name) + ')' : '') + ' existed by ' + esc(local.toISOString().replace('T', ' ').slice(0, 19)) + ' UTC, as signed by Moon.' : 'Do not rely on this receipt: ' + esc(REASONS[c.reason] || c.reason || 'it failed a check') + '.') + '</span></div>';
    h += '<div><h3>THE FILE</h3><table>' +
      row('SHA-256 fingerprint', esc(rc.sha256)) +
      row('Original file', state.file ? esc(state.file.name) + ' · ' + state.file.size.toLocaleString('en-US') + ' bytes · ' + (c.content_match ? ok('fingerprint matches') : no('fingerprint does not match')) : '<span class="ev-small">Not provided. The receipt proves the fingerprint; give the file to prove the contents.</span>') +
      '</table></div>';
    h += '<div><h3>THE MOMENT</h3><table>' +
      row('Moonmark', esc(rc.moonmark)) + row('UTC', esc(local.toISOString().replace('T', ' ').replace('Z', '')) + ' (from ' + esc(rc.unix_ns) + ' ns)') +
      (c.not_before ? row('Not before', esc(c.not_before.utc.replace('T', ' ').slice(0, 19)) + ' UTC · drand quicknet round ' + Number(c.not_before.round).toLocaleString('en-US') + ' · ' + ok('beacon genuine')) : row('Not before', '<span class="ev-small">No drand beacon in this receipt</span>')) +
      '</table></div>';
    h += '<div><h3>SIGNATURES</h3><table>' +
      row('Receipt version', esc(rc.receipt)) +
      row('Ed25519', c.valid || c.reason !== 'bad_signature' ? (c.valid ? ok('valid') : esc('-')) + ' · key ' + esc(rc.key_id) : no('invalid')) +
      (rc.pq ? row('ML-DSA-65 (post-quantum)', c.post_quantum ? ok('valid') + ' · key ' + esc(rc.pq.key_id) : (c.valid ? '<span class="ev-small">Not in this copy of the receipt (short links omit it)</span>' : no('not verified'))) : '') +
      (c.valid ? '' : row('Result', no(REASONS[c.reason] || c.reason))) +
      '</table></div>';
    var tl = '';
    if (t.status === 'sealed') tl = row('Status', ok('sealed into a tide')) + row('Tide', esc(t.lune) + ' · receipt ' + (t.index + 1) + ' of ' + t.size) + row('Merkle root', esc(t.root)) + row('Inclusion proof', state.inclusion ? ok('checked in this browser') : no('did not check')) + row('Tide fingerprint', esc(t.tide_hash)) + row('Chained to', esc(t.prev || 'none (first tide)')) +
      row('XRP Ledger', t.xrpl ? 'transaction ' + esc(t.xrpl.tx) + (t.xrpl.ledger_index ? ' · ledger ' + Number(t.xrpl.ledger_index).toLocaleString('en-US') : '') : '<span class="ev-small">Not anchored</span>') +
      row('Bitcoin', t.bitcoin ? (t.bitcoin.status === 'confirmed' ? ok('block ' + Number(t.bitcoin.block_height).toLocaleString('en-US')) : 'confirming (OpenTimestamps)') : '<span class="ev-small">Not anchored</span>');
    else if (t.status === 'checkpointed') tl = row('Status', ok('locked in a checkpoint')) + row('Lune', esc(t.lune) + ' · receipt ' + (t.index + 1) + ' of ' + t.size) + row('Merkle root', esc(t.root)) + row('Inclusion proof', state.inclusion ? ok('checked in this browser') : no('did not check')) + row('Checkpoint', esc(t.checkpoint_utc.replace('T', ' ').slice(0, 19)) + ' UTC · ' + esc(t.checkpoint_hash)) +
      row('XRP Ledger', t.xrpl ? 'transaction ' + esc(t.xrpl.tx) : '<span class="ev-small">Not anchored</span>') + row('Tide', 'seals after ' + esc((t.seals_after_utc || '').replace('T', ' ').slice(0, 16)) + ' UTC. Build the pack again then for the full record.');
    else if (t.status === 'pending') tl = row('Status', 'recorded, waiting for its first checkpoint') + row('Lune', esc(t.lune));
    else if (t.status === 'not_found') tl = row('Status', '<span class="ev-small">Not in the Tideline (signed before it started, or changed)</span>');
    else tl = row('Status', '<span class="ev-small">The Tideline is not available on this deployment yet</span>');
    h += '<div><h3>PUBLIC RECORD (THE TIDELINE)</h3><table>' + tl + '</table></div>';
    h += '<div><h3>MOON&#39;S SIGNED STATEMENT</h3><table>' +
      row('Statement', 'moon-evidence/1 · issued ' + esc(st.issued.utc.replace('T', ' ').slice(0, 19)) + ' UTC') +
      row('Ed25519', esc(R.signature.key_id) + ' · ' + esc(R.signature.signature.slice(0, 32)) + '…') +
      (R.signature.pq ? row('ML-DSA-65', esc(R.signature.pq.key_id) + ' · ' + esc(R.signature.pq.signature.slice(0, 32)) + '…') : '') +
      row('Keys', 'api.moon369.org/v1/keys') + '</table></div>';
    h += '<div><h3>CHECK IT WITHOUT MOON</h3><ol class="ev-small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">' +
      '<li>Fingerprint the original file with SHA-256 (<code>shasum -a 256 file</code>) and compare it to the receipt.</li>' +
      '<li>Check the receipt&#39;s signatures with Moon&#39;s public keys, offline: <code>npm install moon369</code>, then <code>verify(receipt)</code>.</li>' +
      '<li>Check the inclusion proof (<code>proof.json</code>) against the tide&#39;s Merkle root (RFC 9162).</li>' +
      '<li>Look up the tide fingerprint in the XRP Ledger transaction, and check the Bitcoin proof with OpenTimestamps: <code>ots verify -f tide.txt tide.txt.ots</code>.</li>' +
      '<li>Check this statement: its signed bytes are <code>moon-evidence/1</code>, a newline, then <code>statement</code> as JSON with keys sorted.</li></ol></div>';
    h += '<div class="ev-small" style="border-top:1px solid #D9D4C8;padding-top:14px">Moon is an open standard for time (moon369.org). This report describes cryptographic records; it is not legal advice. Every fact above can be checked from the files in the evidence bundle, without trusting Moon.</div>';
    h += '</div>';
    h += '<div class="ev-noprint" style="display:flex;flex-wrap:wrap;gap:14px;margin-top:24px"><button type="button" class="ev-btn p" data-ev-print>PRINT OR SAVE AS PDF</button><button type="button" class="ev-btn" data-ev-zip>DOWNLOAD EVIDENCE BUNDLE</button><button type="button" class="ev-btn" data-ev-reset style="border-color:#2E3035;color:#A2A3A7">START OVER</button></div>';
    return h;
  }

  function render() {
    var root = document.querySelector('[data-ev-root]'); if (!root) return;
    root.innerHTML = state.result ? reportHtml() : pickerHtml();
    var q = function (s) { return root.querySelector(s); };
    if (q('[data-ev-receipt]')) q('[data-ev-receipt]').onchange = function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      f.text().then(function (t) {
        var j; try { j = JSON.parse(t); j = j.receipt && typeof j.receipt === 'object' ? j.receipt : j; } catch (x) { j = null; }
        if (!j || !j.receipt || !j.sha256) { state.receipt = null; state.receiptName = ''; state.error = 'That file is not a Moon receipt.'; }
        else { state.receipt = j; state.receiptName = f.name; state.error = ''; }
        render();
      });
    };
    if (q('[data-ev-file]')) q('[data-ev-file]').onchange = function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      state.file = f; state.sha = null; render();
      f.arrayBuffer().then(function (b) { return crypto.subtle.digest('SHA-256', b); }).then(function (d) { state.sha = hex(d); render(); });
    };
    if (q('[data-ev-go]')) q('[data-ev-go]').onclick = build;
    if (q('[data-ev-print]')) q('[data-ev-print]').onclick = function () { window.print(); };
    if (q('[data-ev-zip]')) q('[data-ev-zip]').onclick = bundle;
    if (q('[data-ev-reset]')) q('[data-ev-reset]').onclick = function () { state = { receipt: null, receiptName: '', file: null, sha: null, busy: false, result: null, error: '' }; render(); };
  }

  function build() {
    state.busy = true; state.error = ''; render();
    var body = { receipt: state.receipt }; if (state.sha) body.sha256 = state.sha;
    fetch(API + '/v1/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Moon could not build the evidence.'); return j; }); })
      .then(function (R) {
        state.result = R; state.inclusion = false;
        var p = R.proof;
        if (p && (p.status === 'sealed' || p.status === 'checkpointed')) {
          return leafOf(R.receipt).then(function (leaf) {
            if (leaf !== p.leaf) return false;
            return inclusion(p.leaf, p.index, p.size, p.path, p.root);
          }).then(function (okIncl) { state.inclusion = okIncl; });
        }
      })
      .then(function () { state.busy = false; render(); var el = document.getElementById('ev-report'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); })
      .catch(function (e) { state.busy = false; state.error = (e && e.message && !/fetch|network/i.test(e.message)) ? e.message : 'Could not reach Moon. Try again.'; render(); });
  }

  function bundle() {
    var R = state.result, st = R.statement, t = st.tideline, name = 'moon-evidence-' + R.receipt.moonmark.replace(/[^0-9.]+/g, '_');
    var files = {
      'receipt.json': JSON.stringify(R.receipt, null, 2) + '\n',
      'evidence.json': JSON.stringify({ statement: R.statement, signature: R.signature, signed_bytes: R.signed_bytes }, null, 2) + '\n',
      'proof.json': JSON.stringify(R.proof, null, 2) + '\n',
      'README.txt': [
        'MOON EVIDENCE BUNDLE', '',
        'receipt.json   The signed Moonmark: this fingerprint existed at this moment, signed by Moon.',
        'evidence.json  Moon\'s signed statement of every check it ran when this bundle was made.',
        'proof.json     The receipt\'s place in the Tideline, Moon\'s public log (Merkle inclusion proof, RFC 9162).',
        'tide.txt       The sealed tide, exactly as Moon signed it (when sealed).',
        'tide.txt.ots   Its Bitcoin proof (OpenTimestamps), when available.', '',
        'Check it without Moon:',
        '1. shasum -a 256 <your file>  must equal receipt.json "sha256".',
        '2. npm install moon369, then verify(receipt) checks both signatures and the drand beacon offline.',
        '3. Hash the receipt leaf up proof.json "path"; it must equal the tide\'s "root".',
        '4. ots verify -f tide.txt tide.txt.ots   (Bitcoin), and look up the tide fingerprint in the XRP Ledger transaction.',
        '5. evidence.json is signed over: "moon-evidence/1", a newline, then "statement" as JSON with keys sorted.', '',
        'Moon\'s public keys: https://api.moon369.org/v1/keys', 'Moon: https://moon369.org'
      ].join('\n') + '\n'
    };
    var extras = [];
    if (t && t.downloads) {
      if (t.downloads.tide_txt) extras.push(fetch(API + t.downloads.tide_txt).then(function (r) { return r.ok ? r.text() : null; }).then(function (x) { if (x) files['tide.txt'] = x; }).catch(function () {}));
      if (t.downloads.tide_ots) extras.push(fetch(API + t.downloads.tide_ots).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (x) { if (x) files['tide.txt.ots'] = new Uint8Array(x); }).catch(function () {}));
    }
    Promise.all(extras).then(function () {
      if (window.JSZip) {
        var z = new window.JSZip(), dir = z.folder(name);
        Object.keys(files).forEach(function (k) { dir.file(k, files[k]); });
        return z.generateAsync({ type: 'blob' }).then(function (blob) { save(blob, name + '.zip'); });
      }
      Object.keys(files).forEach(function (k) { save(new Blob([files[k]]), k); });   // no zip library: one file at a time
    });
  }
  function save(blob, filename) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  var tries = 0, iv = setInterval(function () { if (document.querySelector('[data-ev-root]')) { clearInterval(iv); render(); } else if (++tries > 100) clearInterval(iv); }, 100);
})();
