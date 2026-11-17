/* moon369.org/tide/<lune>: one lune of the Tideline, every entry, checked in the browser.
   For a sealed tide this page recomputes the Merkle root from every entry, recomputes the tide's hash
   from its contents, checks Moon's Ed25519 signature over it, and can show any entry's proof. */
(function () {
  var API = 'https://api.moon369.org';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var firstDay = function (m) { return Math.ceil(m * 369 / 13); };
  function labelOf(i) { var y = Math.floor(i / 369), dy = i - y * 369, mi = Math.floor(dy * 13 / 369); return y + '.' + p2(mi + 1) + '.' + p2(dy - firstDay(mi) + 1); }
  function indexOf(label) { var m = /^(\d+)\.(\d{1,2})\.(\d{1,2})$/.exec(label); return m ? +m[1] * 369 + firstDay(+m[2] - 1) + +m[3] - 1 : null; }
  var m = /^\/tide\/([^/?#]+)/.exec(location.pathname), lune = m ? decodeURIComponent(m[1]) : (new URLSearchParams(location.search).get('lune') || '');

  // RFC 9162 Merkle tree, the same as the API: leaf hashes in, node = SHA-256(0x01 || left || right).
  var hexTo = function (h) { var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; };
  var toHex = function (b) { return Array.from(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };
  var sha = function (b) { return crypto.subtle.digest('SHA-256', b).then(function (d) { return new Uint8Array(d); }); };
  function node(l, r) { var b = new Uint8Array(65); b[0] = 1; b.set(l, 1); b.set(r, 33); return sha(b); }
  var split = function (n) { var k = 1; while (k * 2 < n) k *= 2; return k; };
  function root(ls) {
    if (ls.length === 0) return sha(new Uint8Array(0));
    if (ls.length === 1) return Promise.resolve(ls[0]);
    var k = split(ls.length);
    return Promise.all([root(ls.slice(0, k)), root(ls.slice(k))]).then(function (a) { return node(a[0], a[1]); });
  }
  function path(i, ls) {
    if (ls.length <= 1) return Promise.resolve([]);
    var k = split(ls.length);
    return i < k ? Promise.all([path(i, ls.slice(0, k)), root(ls.slice(k))]).then(function (a) { return a[0].concat([a[1]]); })
                 : Promise.all([path(i - k, ls.slice(k)), root(ls.slice(0, k))]).then(function (a) { return a[0].concat([a[1]]); });
  }
  function verifyPath(leaf, index, size, pth, want) {
    var fn = index, sn = size - 1, r = Promise.resolve(leaf), i = 0;
    function step(cur) {
      if (i >= pth.length) return Promise.resolve(sn === 0 && toHex(cur) === want);
      var p = pth[i++];
      if (sn === 0) return Promise.resolve(false);
      var next;
      if (fn % 2 === 1 || fn === sn) { next = node(p, cur); if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn >>= 1; sn >>= 1; } }
      else next = node(cur, p);
      fn >>= 1; sn >>= 1;
      return next.then(step);
    }
    return r.then(step);
  }
  var b64u = function (s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };

  function check(t) {
    var box = $('[data-td-checks]'), lines = [];
    var put = function (ok, text) { lines.push('<li class="' + (ok === true ? 'ok' : ok === false ? 'bad' : 'na') + '">' + (ok === true ? '✓ ' : ok === false ? '✕ ' : '· ') + text + '</li>'); box.innerHTML = lines.join(''); };
    var leaves = (t.entries || []).map(function (e) { return hexTo(e.leaf); });
    var bytes = new TextEncoder().encode(['tideline/1', 'lune:' + t.lune, 'index:' + t.lune_index, 'size:' + t.size, 'root:' + t.root, 'prev:' + (t.prev || 'none'), 'ends:' + t.ends_unix_ns, 'sealed:' + t.sealed_unix_ns].join('\n'));
    box.innerHTML = '<li class="na">Checking in your browser…</li>';
    var p = t.entries_truncated ? Promise.resolve(put(null, 'Too many entries to recompute here; use the API.'))
      : root(leaves).then(function (r) { put(toHex(r) === t.root, 'Merkle root recomputed from all ' + t.size.toLocaleString('en-US') + ' entries ' + (toHex(r) === t.root ? 'matches' : 'does not match')); });
    return p.then(function () { return sha(bytes); }).then(function (h) {
      put(toHex(h) === t.hash, 'Tide hash recomputed from its contents ' + (toHex(h) === t.hash ? 'matches' : 'does not match'));
      return fetch(API + '/v1/keys').then(function (r) { return r.json(); });
    }).then(function (k) {
      var key = (k.keys || []).find(function (x) { return x.key_id === t.key_id && x.alg === 'Ed25519'; });
      if (!key) { put(false, 'Signing key ' + t.key_id + ' is not among Moon’s published keys'); return; }
      return crypto.subtle.importKey('raw', b64u(key.public_key), { name: 'Ed25519' }, false, ['verify'])
        .then(function (ck) { return crypto.subtle.verify({ name: 'Ed25519' }, ck, b64u(t.signature), bytes); })
        .then(function (ok) { put(ok, 'Moon’s Ed25519 signature (key ' + t.key_id + ') ' + (ok ? 'checks out' : 'does not check out')); },
              function () { put(null, 'This browser cannot check Ed25519 signatures; the API can: POST /v1/tideline/proof'); });
    }).catch(function () { put(null, 'Could not finish the checks. Try again.'); });
  }


  // Plain words for a lune: what happened, when, and where its proof stands.
  var LUNE_NS = 89888231435473n;
  var ms = function (ns) { return Number(BigInt(ns) / 1000000n); };
  var utc = function (t) { return new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; };
  var local = function (t) { try { return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return utc(t); } };
  var n = function (x, one, many) { return Number(x).toLocaleString('en-US') + ' ' + (x === 1 ? one : many); };
  function times(t) {
    var end = t.ends_unix_ns ? ms(t.ends_unix_ns) : Date.parse(t.seals_after_utc);
    return { start: end - Number(LUNE_NS / 1000000n), end: end, sealed: t.sealed_unix_ns ? ms(t.sealed_unix_ns) : null };
  }
  function summary(t) {
    var w = times(t), files = n(t.size, 'file was', 'files were'), btc = t.bitcoin && t.bitcoin.status;
    if (t.status === 'sealed') return 'From ' + local(w.start) + ' to ' + local(w.end) + ', ' + files + ' signed on Moon. ' +
      'Moon sealed ' + (t.size === 1 ? 'it' : t.size ? 'all of them' : 'the empty lune, so the chain has no gap,') + ' into this tide on ' + local(w.sealed) + '. ' +
      (btc === 'confirmed' ? 'The seal is now fixed in Bitcoin, in block ' + Number(t.bitcoin.block_height).toLocaleString('en-US') + ', so not even Moon can change it.' :
       btc ? 'The seal has been sent to Bitcoin and is waiting for a block, usually a few hours.' : 'Its signatures and chain already lock it; nothing can be added or removed.');
    if (t.status === 'open') return 'This lune is still open: ' + files.replace('were', 'have been').replace('was', 'has been') + ' signed since ' + local(w.start) + '. When it ends at ' + local(w.end) + ', Moon seals every one of them into a tide.';
    return 'This lune ended at ' + local(w.end) + ' with ' + n(t.size, 'file', 'files') + ' signed. Moon seals it within minutes.';
  }
  function timeline(t) {
    var w = times(t), now = Date.now(), btc = t.bitcoin && t.bitcoin.status;
    var steps = [
      ['OPENED', utc(w.start), 'Receipts start landing here.', true],
      ['ENDED', utc(w.end), 'No more receipts can join.', now >= w.end],
      ['SEALED', w.sealed ? utc(w.sealed) : 'soon after it ends', 'One root over every entry, chained and signed.', !!w.sealed],
      ['IN BITCOIN', btc === 'confirmed' ? 'block ' + Number(t.bitcoin.block_height).toLocaleString('en-US') : btc ? 'waiting for a block' : 'after sealing', 'Fixed in a public record Moon doesn’t control.', btc === 'confirmed']
    ];
    var cur = steps.findIndex(function (x) { return !x[3]; });
    return steps.map(function (x, i) { return '<li class="' + (x[3] ? 'done' : i === cur ? 'now' : '') + '"><i></i><b>' + x[0] + '</b><span>' + esc(x[1]) + '</span><p>' + x[2] + '</p></li>'; }).join('');
  }

  function rows(t) {
    var r = function (k, v) { return '<div class="td-r"><span>' + k + '</span><b>' + v + '</b></div>'; };
    var out = r('RECEIPTS', t.size.toLocaleString('en-US'));
    if (t.status === 'sealed') {
      out += r('SEALED', new Date(Number(BigInt(t.sealed_unix_ns) / 1000000n)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC') +
        r('ROOT', '<span class="td-h">' + t.root + '</span>') + r('TIDE HASH', '<span class="td-h">' + t.hash + '</span>') +
        r('CHAINED TO', t.prev ? '<span class="td-h">' + t.prev + '</span>' : 'the first tide') +
        r('SIGNED WITH', 'Ed25519' + (t.pq ? ' + ML-DSA-65' : '') + ' · key ' + esc(t.key_id)) +
        (t.bitcoin && t.bitcoin.status ? r('BITCOIN', t.bitcoin.status === 'confirmed' ? 'block ' + Number(t.bitcoin.block_height).toLocaleString('en-US') : 'confirming') : '') +
        r('DOWNLOAD', '<a href="' + API + '/v1/tideline/' + esc(t.lune) + '.txt">tide-' + esc(t.lune) + '.txt</a> · <a href="' + API + '/v1/tideline/' + esc(t.lune) + '">JSON</a>');
    } else {
      out += r('SEALS AFTER', esc(String(t.seals_after_utc || '').replace('T', ' ').slice(0, 19)) + ' UTC');
    }
    return out;
  }

  function entries(t) {
    var list = $('[data-td-list]'), all = t.entries || [], sealed = t.status === 'sealed';
    var leaves = all.map(function (e) { return hexTo(e.leaf); });
    $('[data-td-count]').textContent = all.length ? all.length.toLocaleString('en-US') + (all.length === 1 ? ' entry' : ' entries') + (t.entries_truncated ? ' · first ' + all.length.toLocaleString('en-US') + ' listed' : '') : '';
    if (!all.length) { list.innerHTML = '<li class="td-empty">' + (sealed ? 'This tide sealed with no entries.' : 'Nothing signed in this lune yet.') + '</li>'; return; }
    list.innerHTML = all.slice(0, 2000).map(function (e) {
      return '<li id="e' + e.index + '"><span class="td-n">' + (e.index + 1) + '</span><a class="td-leaf" href="/tideline?q=' + e.leaf + '#search" title="Look this entry up">' + e.leaf + '</a>' +
        (sealed && !t.entries_truncated ? '<button type="button" data-td-proof="' + e.index + '">PROOF</button>' : '') + '<div class="td-proof" data-td-out="' + e.index + '"></div></li>';
    }).join('') + (all.length > 2000 ? '<li class="td-empty">Showing the first 2,000. All of them are in the JSON.</li>' : '');
    // A link to one entry (/tide/<lune>#e36): bring it into view and mark it.
    var hm = /^#e(\d+)$/.exec(location.hash);
    if (hm) { var li = document.getElementById('e' + hm[1]); if (li) { li.classList.add('td-here'); setTimeout(function () { li.scrollIntoView({ block: 'center' }); }, 50); } }
    list.onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-td-proof]'); if (!b) return;
      var i = +b.getAttribute('data-td-proof'), out = list.querySelector('[data-td-out="' + i + '"]');
      if (out.innerHTML) { out.innerHTML = ''; return; }
      out.textContent = 'Building the proof…';
      path(i, leaves).then(function (pth) {
        return verifyPath(leaves[i], i, leaves.length, pth, t.root).then(function (ok) {
          out.innerHTML = '<div class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ This entry is in the tide: ' + pth.length + ' hashes lead from it to the root.' : '✕ The proof does not lead to the root.') + '</div>' +
            '<ol>' + pth.map(function (h) { return '<li>' + toHex(h) + '</li>'; }).join('') + '</ol>';
        });
      });
    };
  }

  function nav(idx) {
    var prev = $('[data-td-prev]'), next = $('[data-td-next]');
    prev.href = '/tide/' + labelOf(idx - 1); prev.textContent = '← ' + labelOf(idx - 1);
    next.href = '/tide/' + labelOf(idx + 1); next.textContent = labelOf(idx + 1) + ' →';
  }

  function load() {
    var idx = indexOf(lune);
    if (idx === null) { $('[data-td-title]').textContent = 'NOT A LUNE'; $('[data-td-state]').textContent = 'Use a lune like 1928.05.06.'; return; }
    lune = labelOf(idx);
    $('[data-td-title]').textContent = 'TIDE ' + lune; document.title = 'Tide ' + lune + ' · Tideline · Moon'; nav(idx);
    fetch(API + '/v1/tideline/' + lune).then(function (r) { return r.json(); }).then(function (t) {
      if (t.error) throw new Error(t.error.message);
      var sealed = t.status === 'sealed';
      $('[data-td-state]').textContent = sealed ? 'SEALED · ' + t.size.toLocaleString('en-US') + (t.size === 1 ? ' RECEIPT' : ' RECEIPTS') : t.status === 'open' ? 'OPEN · STILL TAKING RECEIPTS' : 'ENDED · SEALING SOON';
      $('[data-td-state]').className = 'td-state' + (sealed ? ' sealed' : '');
      $('[data-td-summary]').textContent = summary(t);
      $('[data-td-time]').innerHTML = timeline(t);
      $('[data-td-rows]').innerHTML = rows(t);
      $('[data-td-checkwrap]').hidden = !sealed;
      if (sealed) check(t);
      entries(t);
    }).catch(function (e) { $('[data-td-state]').textContent = 'Could not reach Moon. ' + (e && e.message ? e.message : ''); });
  }
  var t = 0, iv = setInterval(function () {
    var el = $('[data-td-title]'), snap = document.querySelector('[data-dc-snapshot]');
    if ((el && !(snap && snap.contains(el))) || ++t > 200) { clearInterval(iv); if (el) load(); }
  }, 25);
})();
