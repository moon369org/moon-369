/* moon369.org/tideline: the live page. Every number here comes from Moon's public API:
     /v1/stats              items signed, tides sealed, this lune
     /v1/tideline           the open lune, when it seals, and the sealed tides
     /v1/tideline/<lune>    the items in the open lune, as they arrive
     /v1/tideline/proof     a receipt's proof, checked in this browser
     /v1/search             find an item by its fingerprint, a moment or a verified name
   The shore: the tide rises through the lune, and each sealed tide is a line laid above the last.
   ?preview shows sample data, built here in the browser. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var PREVIEW = /[?&]preview\b/.test(location.search);
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return document.querySelector(s); };
  var T = function (s, v) { if (window.MoonT) return window.MoonT(s, v); return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  var n = function (x) { return Number(x || 0).toLocaleString('en-US'); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var hexOf = function (b) { return Array.from(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };
  var sha = function (buf) { return crypto.subtle.digest('SHA-256', buf).then(hexOf); };
  var getJSON = function (path) { return fetch(API + path, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }); };

  // The Moon standard: one lune is a Moon day, about 25 hours.
  var EPOCH = -62165308562978.61, DAY = 86400000 * 1.0403730490216803;
  var p2 = function (x) { return String(x).padStart(2, '0'); };
  function luneAt(ms) {
    var da = Math.floor((ms - EPOCH) / DAY), y = Math.floor(da / 369), dy = da - y * 369, mi = Math.floor(dy * 13 / 369);
    return { label: y + '.' + p2(mi + 1) + '.' + p2(dy - Math.ceil(mi * 369 / 13) + 1), start: EPOCH + da * DAY, end: EPOCH + (da + 1) * DAY };
  }

  var S = { open: null, endMs: 0, tides: [], count: null, entries: [], seen: {}, stats: null, sealing: false };
  var LOW = 60, HIGH = 200, NEWEST = 420 - HIGH - 8, STEP = 32, KEEP = 7;

  // ---------- the tide level ----------
  var basin, sea, px = LOW, pxAnim = null;
  function setPx(v) { px = v; if (sea) sea.setAttribute('data-sea-px', v.toFixed(1)); if (basin) basin.style.setProperty('--px', v.toFixed(1) + 'px'); }
  function tideTo(target, ms) {
    return new Promise(function (done) {
      if (pxAnim) cancelAnimationFrame(pxAnim);
      var from = px, t0 = performance.now();
      if (reduce || !ms) { setPx(target); done(); return; }
      (function step(now) {
        var k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setPx(from + (target - from) * e);
        if (k < 1) pxAnim = requestAnimationFrame(step); else { pxAnim = null; done(); }
      })(t0);
    });
  }
  function luneLevel() {
    var end = S.endMs || luneAt(Date.now()).end, start = end - DAY;
    var k = Math.max(0, Math.min(1, (Date.now() - start) / DAY));
    return LOW + (HIGH - LOW) * k;
  }

  // ---------- the lines: one per sealed tide, newest just above high tide ----------
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function wave(lune) {
    var seed = 0; String(lune).replace(/\d/g, function (d) { seed = (seed * 31 + Number(d)) >>> 0; });
    var r = rng(seed || 7), parts = [];
    var w = [[0.006 + r() * 0.006, 2 + r() * 2.5, r() * 6.28], [0.015 + r() * 0.012, 1 + r() * 1.6, r() * 6.28], [0.04 + r() * 0.03, 0.4 + r() * 0.8, r() * 6.28]];
    for (var x = 0; x <= 1000; x += 10) {
      var y = 0; for (var i = 0; i < w.length; i++) y += w[i][1] * Math.sin(x * w[i][0] + w[i][2]);
      parts.push((x ? 'L' : 'M') + x + ' ' + y.toFixed(2));
    }
    return parts.join('');
  }
  var lines = [];   // [{ lune, size, g, lab }], newest first
  function place(L, k, instant) {
    var y = NEWEST - k * STEP, a = Math.max(0.25, 1 - k * 0.14);
    if (instant) { L.g.style.transition = 'none'; L.lab.style.transition = 'none'; }
    L.g.style.transform = 'translateY(' + y + 'px)'; L.g.style.opacity = k >= KEEP ? 0 : a;
    L.path.style.strokeWidth = k === 0 ? '2.5px' : '1.5px';
    L.lab.style.top = y + 'px'; L.lab.style.opacity = k >= KEEP ? 0 : Math.max(0.5, a); L.lab.classList.toggle('new', k === 0);
    if (instant) { L.g.getBoundingClientRect(); L.g.style.transition = ''; L.lab.style.transition = ''; }
  }
  function makeLine(t, draw) {
    var svg = $('[data-tl-lines]'), labs = $('[data-tl-labs]');
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', wave(t.lune)); path.setAttribute('pathLength', '1');
    if (draw && !reduce) path.classList.add('draw');
    g.appendChild(path); svg.appendChild(g);
    var lab = document.createElement('div'); lab.className = 'tl-lab';
    lab.textContent = T('Tide {l} · {n} items', { l: t.lune, n: n(t.size) }); if (t.size === 1) lab.textContent = T('Tide {l} · 1 item', { l: t.lune });
    labs.appendChild(lab);
    return { lune: t.lune, size: t.size, g: g, path: path, lab: lab };
  }
  function drawLines(tides) {
    var svg = $('[data-tl-lines]'), labs = $('[data-tl-labs]'); if (!svg) return;
    svg.innerHTML = ''; labs.innerHTML = ''; lines = [];
    tides.slice(0, KEEP).forEach(function (t, k) { var L = makeLine(t, false); lines.push(L); place(L, k, true); });
  }

  // ---------- items washing in ----------
  function fleck(x, fresh) {
    var box = $('[data-tl-flecks]'); if (!box) return;
    var f = document.createElement('i'); f.className = 'tl-fl' + (fresh && !reduce ? ' in' : '');
    f.style.left = (x * 100).toFixed(2) + '%';
    if (!reduce) f.style.animationDelay = fresh ? '0s, .9s' : (-Math.random() * 3.2).toFixed(2) + 's';
    box.appendChild(f);
    while (box.children.length > 60) box.removeChild(box.firstChild);
  }
  function splash(x) {
    if (!basin || !sea || reduce) return;
    var r = sea.getBoundingClientRect();
    try { basin.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + x * r.width, clientY: r.bottom - 6 })); } catch (e) {}
  }
  function xOf(leaf) { return 0.04 + (parseInt(String(leaf).slice(0, 6), 16) || Math.floor(Math.random() * 1e6)) % 1000 / 1000 * 0.72; }   // clear of the labels on the right
  function arrive(list, fresh) {
    list.forEach(function (e, i) {
      var go = function () { fleck(xOf(e.leaf), fresh); if (fresh) splash(xOf(e.leaf)); };
      if (fresh) setTimeout(go, i * 450); else go();
    });
  }
  function feed() {
    var ul = $('[data-tl-feed]'); if (!ul) return;
    var last = S.entries.slice(-2).reverse();
    ul.innerHTML = last.map(function (e) { return '<li><span>' + esc(T('An item washed in')) + ' · <span translate="no">' + esc(e.leaf.slice(0, 8)) + '…</span></span><span>#' + n(e.index + 1) + '</span></li>'; }).join('') ||
      '<li><span>' + esc(T('Nothing signed yet this lune.')) + '</span><span></span></li>';
  }
  function setCount(c) { S.count = c; var el = $('[data-tl-count]'); if (el) el.textContent = c == null ? '–' : n(c); stats(); }

  // ---------- the seal ----------
  function seal(newTide, preview) {
    if (S.sealing) return Promise.resolve(); S.sealing = true;
    var btn = $('[data-tl-preview]'); if (btn) btn.disabled = true;
    return tideTo(HIGH, 1400).then(function () {
      lines.forEach(function (L, k) { place(L, k + 1); });
      var L = makeLine(newTide, true); lines.unshift(L); place(L, 0, true);
      var fl = $('[data-tl-flecks]'); if (fl) fl.classList.add('gone');
      return new Promise(function (r) { setTimeout(r, reduce ? 0 : 1500); });
    }).then(function () {
      lines.slice(KEEP).forEach(function (L) { L.g.remove(); L.lab.remove(); }); lines = lines.slice(0, KEEP);
      var fl = $('[data-tl-flecks]'); if (fl) { fl.innerHTML = ''; fl.classList.remove('gone'); }
      setCount(0);
      if (!preview) { S.entries = []; S.seen = {}; feed(); }
      return tideTo(LOW, 2600);
    }).then(function () {
      if (preview) {
        // Only a preview: after a pause, the shore goes back to exactly what the record holds.
        return new Promise(function (r) { setTimeout(r, 2200); }).then(function () {
          drawLines(S.tides); setCount(S.entries.length || S.count0 || 0); arrive(S.entries.slice(-60), false); return tideTo(luneLevel(), 1600);
        });
      }
    }).then(function () { S.sealing = false; if (btn) btn.disabled = false; });
  }

  // ---------- the hero numbers ----------
  function stats() {
    var s = S.stats; if (!s) return;
    var set = function (k, v) { var el = $('[data-st="' + k + '"]'); if (el) el.textContent = v; };
    var lune = Math.max(Number(s.this_lune || 0), S.count || 0), extra = lune - Number(s.this_lune || 0);
    set('total', n(Number(s.total_receipts || 0) + Math.max(0, extra))); set('tides', n(s.tides_sealed)); set('lune', n(lune));
  }

  // ---------- the clock ----------
  function tick() {
    var el = $('[data-tl-turn]'); if (!el) return;
    var ms = Math.max(0, (S.endMs || luneAt(Date.now()).end) - Date.now());
    el.textContent = Math.floor(ms / 3600000) + 'h ' + p2(Math.floor(ms / 60000) % 60) + 'm ' + p2(Math.floor(ms / 1000) % 60) + 's';
    if (!S.sealing && !pxAnim) setPx(luneLevel());
  }

  // ---------- sealed tides table ----------
  var short = function (h) { return h ? h.slice(0, 10) + '…' + h.slice(-6) : T('none (first tide)'); };
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>';
  function table() {
    var tb = $('[data-tl-tbody]'), ab = $('[data-tl-audbody]'); if (!tb) return;
    if (!S.tides.length) {
      tb.innerHTML = '<tr><td colspan="4" class="tl-empty">' + esc(S.open ? T('The first tide seals when lune {l} ends.', { l: S.open }) : T('Loading…')) + '</td></tr>';
      ab.innerHTML = ''; return;
    }
    var day = function (t) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(Number(BigInt(t.sealed_unix_ns) / 1000000n))); } catch (e) { return ''; } };
    var btc = function (t) { return t.bitcoin && t.bitcoin.status === 'confirmed'; };
    tb.innerHTML = S.tides.map(function (t) {
      return '<tr><td><a href="/tide/' + esc(t.lune) + '" translate="no">' + esc(t.lune) + '</a></td><td>' + n(t.size) + '</td><td class="tl-hide">' + esc(t.sealed_unix_ns ? day(t) : '') + '</td>' +
        '<td><span class="tl-st">' + CHECK + '<span>' + esc(T('Sealed')) + '</span>' + (btc(t) ? '<span class="tl-btc">· ' + esc(T('on Bitcoin')) + '</span>' : '') + '</span></td></tr>';
    }).join('');
    ab.innerHTML = S.tides.map(function (t) {
      return '<tr><td translate="no">' + esc(t.lune) + '</td><td title="' + esc(t.root) + '">' + esc(short(t.root)) + '</td><td class="tl-hide">' + esc(short(t.prev)) + '</td><td class="tl-hide">' + (t.pq ? 'Ed25519 + ML-DSA-65' : 'Ed25519') + '</td>' +
        '<td>' + (btc(t) ? esc(T('block {b}', { b: n(t.bitcoin.block_height) })) + (t.bitcoin.ots ? ' · <a href="' + esc(API + t.bitcoin.ots) + '">.ots</a>' : '') : '–') + '</td></tr>';
    }).join('');
  }

  // ---------- loading the record ----------
  function load() {
    return getJSON('/v1/tideline').then(function (b) {
      var before = S.open, beforeTides = S.tides.length;
      S.tides = b.tides || []; S.endMs = Date.parse(b.seals_after_utc) || luneAt(Date.now()).end;
      var openEl = $('[data-tl-open]'); if (openEl) openEl.textContent = b.open_lune;
      S.open = b.open_lune; table();
      // A lune just sealed while the page was open: play it, with the real tide.
      if (before && b.open_lune !== before && S.tides[0] && S.tides.length > beforeTides) seal(S.tides[0], false);
      else if (!before) drawLines(S.tides);
      return getJSON('/v1/tideline/' + b.open_lune);
    }).then(function (o) {
      var list = o.entries || [], fresh = [];
      list.forEach(function (e) { if (!S.seen[e.leaf]) { S.seen[e.leaf] = 1; fresh.push(e); } });
      var first = S.count == null;
      S.entries = list; setCount(o.size != null ? o.size : list.length);
      if (!S.sealing) arrive(first ? list.slice(-60) : fresh, !first);
      feed();
      var fn = $('[data-tl-feednote]'); if (fn) fn.textContent = T('LIVE · UPDATES BY ITSELF');
    }).catch(function () { var fn = $('[data-tl-feednote]'); if (fn) fn.textContent = T('COULD NOT REACH MOON'); if (S.count == null) setCount(null); table(); });
  }
  function loadStats() { return getJSON('/v1/stats').then(function (s) { S.stats = s; stats(); }).catch(function () {}); }

  // ---------- preview: sample data, nothing real is touched ----------
  function previewData() {
    var now = Date.now(), open = luneAt(now), tides = [], prevRoot = null;
    var r = Math.random, rhex = function () { return hexOf(crypto.getRandomValues(new Uint8Array(32))); };
    for (var back = 1; back <= 8; back++) {
      var l = luneAt(open.start - (back - 0.5) * DAY), root = rhex();
      tides.push({ lune: l.label, size: 40 + Math.floor(r() * 160), root: root, prev: null, pq: { alg: 'ML-DSA-65' }, sealed_unix_ns: String(Math.floor(l.end + 600000)) + '000000', bitcoin: back > 1 ? { status: 'confirmed', block_height: 927800 - back * 144 } : { status: 'pending' } });
    }
    for (var i = tides.length - 1; i >= 0; i--) { tides[i].prev = prevRoot; prevRoot = tides[i].root; }
    var entries = []; for (var k = 0; k < 24; k++) entries.push({ index: k, leaf: rhex() });
    S.tides = tides; S.endMs = open.end; S.open = open.label; S.entries = entries; entries.forEach(function (e) { S.seen[e.leaf] = 1; });
    S.stats = { total_receipts: tides.reduce(function (a, t) { return a + t.size; }, 0) + entries.length, tides_sealed: tides.length, this_lune: entries.length };
    $('[data-tl-open]').textContent = open.label; table(); drawLines(tides); setCount(entries.length); arrive(entries, false); feed();
    $('[data-tl-feednote]').textContent = T('SAMPLE DATA');
    setInterval(function () {
      if (S.sealing || r() < 0.4) return;
      var e = { index: S.entries.length, leaf: rhex() }; S.entries.push(e); setCount(S.entries.length); arrive([e], true); feed();
    }, 2600);
  }

  // ---------- check an item ----------
  function result(kind, head, text, sign) {
    var box = $('[data-tl-res]'); if (!box) return;
    box.className = 'tl-res on ' + kind; $('[data-tl-res-h]').textContent = head; $('[data-tl-res-p]').textContent = text;
    $('[data-tl-res-b]').innerHTML = sign ? '<a class="tl-btn solid" href="/sign">' + esc(T('SIGN THIS ITEM')) + '</a>' : '';
  }
  function busy(text) { result('wait', T('CHECKING'), text, false); }
  function sealedLune(l) { return S.tides.some(function (t) { return t.lune === l; }); }
  function inclusion(leaf, index, size, path, root) {
    var hx = function (h) { return Uint8Array.from(h.match(/../g) || [], function (x) { return parseInt(x, 16); }); };
    var node = function (l, r) { var b = new Uint8Array(1 + l.length + r.length); b[0] = 1; b.set(l, 1); b.set(r, 1 + l.length); return crypto.subtle.digest('SHA-256', b).then(function (d) { return new Uint8Array(d); }); };
    if (index < 0 || index >= size) return Promise.resolve(false);
    var fn = index, sn = size - 1, r = hx(leaf), chain = Promise.resolve();
    (path || []).forEach(function (p) {
      chain = chain.then(function () {
        if (sn === 0) throw 0;
        var pb = hx(p);
        if (fn % 2 === 1 || fn === sn) return node(pb, r).then(function (x) { r = x; if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn >>= 1; sn >>= 1; } fn >>= 1; sn >>= 1; });
        return node(r, pb).then(function (x) { r = x; fn >>= 1; sn >>= 1; });
      });
    });
    return chain.then(function () { return sn === 0 && hexOf(r) === root; }).catch(function () { return false; });
  }
  var FOUND = 'FOUND AND SEALED', NOTYET = 'NOT IN THE RECORD YET';
  function foundSealed(l) { result('ok', T(FOUND), T('This exact item was signed in Lune {l} and sealed into that tide. It has not changed by a single byte since.', { l: l }), false); }
  function foundOpen(l) { result('wait', T('FOUND, SEALS SOON'), T('This exact item was signed in Lune {l}. It is sealed into that tide when the lune ends.', { l: l }), false); }
  function notFound() { result('warn', T(NOTYET), T("Not in the record yet. Sign it now and it joins this lune's tide."), true); }
  function receipt(rc) {
    busy(T('Asking the Tideline for its proof…'));
    return fetch(API + '/v1/tideline/proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: rc }) }).then(function (r) { return r.json(); }).then(function (p) {
      if (p.status === 'sealed') return inclusion(p.leaf, p.index, p.size, p.path, p.root).then(function (ok) { ok ? foundSealed(p.lune) : result('warn', T('DOES NOT MATCH'), T('The proof does not match the sealed tide. Do not rely on this receipt.'), false); });
      if (p.status === 'checkpointed' || p.status === 'pending') return foundOpen(p.lune);
      if (p.status === 'not_found') return notFound();
      result('warn', T('COULD NOT CHECK'), (p.error && p.error.message) || T('Could not check that receipt.'), false);
    });
  }
  function byHash(hex) {
    busy(T('Looking for its fingerprint in the record…'));
    return fetch(API + '/v1/search?q=' + hex).then(function (r) { return r.json(); }).then(function (j) {
      var rs = (j.results || []).filter(function (x) { return x.moonmark; });
      if (!rs.length) return notFound();
      var l = rs[0].moonmark.slice(0, 10);
      if (sealedLune(l) || (S.open && l < S.open)) foundSealed(l); else foundOpen(l);
    });
  }
  function asReceipt(t) { try { var j = JSON.parse(t); j = j && j.receipt && typeof j.receipt === 'object' ? j.receipt : j; return j && j.moonmark && (j.signature || j.sha256) ? j : null; } catch (e) { return null; } }
  function checkBytes(buf, name) {
    var t = null; if (buf.byteLength < 200000) { try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) {} }
    var rc = t && asReceipt(t);
    if (rc) return receipt(rc);
    busy(T('Fingerprinting {f} on your device…', { f: name || T('your item') }));
    return sha(buf).then(byHash);
  }
  function checkText(t) {
    if (!String(t || '').length) return result('warn', T('NOTHING TO CHECK'), T('Paste text or a receipt, or drop a file.'), false);
    var rc = asReceipt(t); if (rc) return receipt(rc);
    return sha(new TextEncoder().encode(t)).then(byHash);
  }
  function fail() { result('warn', T('COULD NOT REACH MOON'), T('Check your connection and try again.'), false); }

  // ---------- search ----------
  function search(term) {
    term = String(term || '').trim(); if (!term) return;
    var head = $('[data-tl-shead]'), list = $('[data-tl-slist]'), page = $('[data-tl-spage]');
    head.textContent = T('Searching…'); list.hidden = true; page.hidden = true;
    fetch(API + '/v1/search?q=' + encodeURIComponent(term)).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status); return j; }); }).then(function (j) {
      var c = j.count, k = j.kind, span = j.window && j.window.span, spans = { lune: 'lune', minute: 'minute', second: 'second', utc_day: 'UTC day' };
      head.textContent = k === 'file' ? (c ? (c === 1 ? T('This item is on Moon: signed 1 time.') : T('This item is on Moon: signed {n} times. The earliest is first.', { n: c })) : T('No item has this fingerprint.'))
        : k === 'entry' ? T('This is a Tideline entry: the fingerprint of the receipt below.')
        : k === 'label' ? (c ? T('{n} items signed under a verified name match “{q}”.', { n: c, q: term }) : T('No verified name or item matches “{q}”.', { q: term }))
        : k === 'time' ? (c ? T('{n} items signed in that {s}.', { n: c + (j.truncated ? '+' : ''), s: T(spans[span] || 'window') }) : T('Nothing was signed in that {s}.', { s: T(spans[span] || 'window') }))
        : k === 'registrant' ? (c ? T('{n} items signed by {r}, verified.', { n: c, r: j.registrant }) : T('No verified name matches “{q}”. Only names Moon has verified have a public list.', { q: term }))
        : T('Nothing found. Try a SHA-256, a Moonmark like 1928.05.06 10:43:17, a UTC date like 2026-11-16, or a verified name.');
      var rs = (j.results || []).slice(0, 500);
      list.innerHTML = rs.map(function (r) {
        var what = r.label || (r.sha256 ? r.sha256.slice(0, 16) + '…' : T('Signed Moonmark'));
        return '<li><span translate="no">' + esc(r.moonmark.slice(0, 19)) + '</span><span>' + esc(r.registrant + (r.registrant_verified ? ' · ' + T('verified') : '')) + '</span><span>' + (r.signed_url ? '<a href="' + esc(r.signed_url) + '" target="_blank" rel="noopener">' + esc(what) + ' ↗</a>' : esc(what)) + '</span></li>';
      }).join('');
      list.hidden = !rs.length;
      if (k === 'registrant' && c) { page.href = '/by/' + j.slug; page.textContent = T('EVERYTHING SIGNED BY {r} →', { r: String(j.registrant || '').toUpperCase() }); page.hidden = false; }
    }).catch(function (e) { head.textContent = (e && e.message) || T('Could not reach Moon.'); });
  }

  // ---------- start ----------
  function start() {
    basin = $('[data-tl-basin]'); sea = basin && basin.querySelector('canvas');
    // On phones the hero's sea is lower, so it shows on the first screen.
    var heroSea = $('#top canvas.tl-sea'); if (heroSea && window.matchMedia && matchMedia('(max-width: 720px)').matches) heroSea.setAttribute('data-sea-px', '130');
    setPx(luneLevel());
    var pv = $('[data-tl-preview]');
    if (pv) pv.addEventListener('click', function () {
      var L = luneAt(Date.now());
      seal({ lune: S.open || L.label, size: S.count || 0 }, true);
    });
    // check
    var drop = $('[data-tl-drop]'), text = $('[data-tl-text]'), file = $('[data-tl-file]');
    var takeFile = function (f) { if (!f) return; busy(T('Reading {f}…', { f: f.name })); f.arrayBuffer().then(function (b) { return checkBytes(b, f.name); }).catch(fail); };
    if (drop) {
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) return takeFile(f);
        var t = e.dataTransfer && e.dataTransfer.getData('text/plain'); if (t) { text.value = t; Promise.resolve(checkText(t)).catch(fail); }
      });
    }
    if (file) file.addEventListener('change', function () { var f = file.files && file.files[0]; file.value = ''; takeFile(f); });
    var ct = $('[data-tl-checktext]'); if (ct) ct.addEventListener('click', function () { Promise.resolve(checkText(text.value)).catch(fail); });
    // search
    var sf = $('[data-tl-sform]'), q = $('[data-tl-q]'), sfile = $('[data-tl-sfile]');
    if (sf) sf.addEventListener('submit', function (e) { e.preventDefault(); search(q.value); });
    if (sfile) sfile.addEventListener('change', function () {
      var f = sfile.files && sfile.files[0]; sfile.value = ''; if (!f) return;
      $('[data-tl-shead]').textContent = T('Fingerprinting {f} on your device…', { f: f.name });
      f.arrayBuffer().then(sha).then(function (h) { q.value = h; search(h); });
    });
    var q0 = new URLSearchParams(location.search).get('q'); if (q0 && q) { q.value = q0; search(q0); }
    setInterval(tick, 1000); tick();
    // Lines, labels and the feed are drawn by script: draw them again once the page's language arrives.
    window.addEventListener('moon:lang', function () {
      if (!S.sealing) drawLines(S.tides); feed(); table();
      var ta = $('[data-tl-text]'); if (ta) ta.placeholder = T('Paste text or a receipt');
    });
    if (PREVIEW) { var b = $('[data-tl-pv]'); if (b) b.hidden = false; previewData(); stats(); return; }
    load(); loadStats();
    setInterval(load, 15000); setInterval(loadStats, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
