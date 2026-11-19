/* moon369.org/status: is Moon working right now? Live checks from your browser, every tide seal, and the dates that matter. */
(function () {
  var API = 'https://api.moon369.org';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmt = function (iso, withDate) {
    try { return new Intl.DateTimeFormat(undefined, withDate === false ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(iso).replace(/(\.\d{3})\d+Z$/, '$1Z'))); } catch (e) { return String(iso).slice(0, 16).replace('T', ' ') + ' UTC'; }
  };
  var dateOnly = function (iso) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 10); } };
  var timed = function (url, opt) { var t = performance.now(); return fetch(url, Object.assign({ cache: 'no-store' }, opt || {})).then(function (r) { var ms = Math.round(performance.now() - t); return r.json().then(function (b) { return { ok: r.ok, ms: ms, b: b }; }); }); };

  // The revocation list's next update, read from its DER: CertificateList ::= SEQUENCE { tbs SEQUENCE { [version], sigAlg, issuer, thisUpdate, nextUpdate, ... } }
  function crlNextUpdate(buf) {
    var b = new Uint8Array(buf), p = 0;
    var tlv = function () { var tag = b[p++], len = b[p++]; if (len & 0x80) { var n = len & 0x7f; len = 0; while (n--) len = len * 256 + b[p++]; } return { tag: tag, len: len, start: p }; };
    tlv(); var tbs = tlv(); var end = tbs.start + tbs.len, items = [];
    while (p < end && items.length < 6) { var t = tlv(); items.push({ tag: t.tag, v: b.slice(t.start, t.start + t.len) }); p = t.start + t.len; }
    if (items[0].tag === 0x02) items.shift();
    var tm = items[3]; if (!tm) return null;
    var s = new TextDecoder().decode(tm.v);
    if (tm.tag === 0x17) s = (+s.slice(0, 2) < 50 ? '20' : '19') + s;
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + 'T' + s.slice(8, 10) + ':' + s.slice(10, 12) + ':' + s.slice(12, 14) + 'Z';
  }

  function dot(state) { return '<span class="st-dot ' + state + '" aria-hidden="true"></span>'; }
  function card(state, name, value, note) {
    return '<div class="st-c"><div class="st-ch">' + dot(state) + '<span>' + name + '</span><b class="st-' + state + '">' + (state === 'ok' ? 'WORKING' : state === 'warn' ? 'CHECK' : state === 'off' ? 'OFF' : 'DOWN') + '</b></div>' +
      '<div class="st-cv">' + value + '</div>' + (note ? '<div class="st-cn">' + note + '</div>' : '') + '</div>';
  }

  function render(health, st, tl, crl) {
    var s = st && st.b, problems = [];
    var cards = [];
    cards.push(card(health && health.ok ? 'ok' : 'bad', 'API', health ? health.ms + ' ms' : 'No answer', 'api.moon369.org, from your browser'));
    if (s) {
      cards.push(card(s.signing.ok ? 'ok' : 'bad', 'SIGNING', s.signing.ok ? (s.signing.mode === 'hybrid' ? 'Ed25519 + ML-DSA-65' : 'Ed25519') : esc(s.signing.error), s.signing.ok ? s.signing.keys.map(function (k) { return k.alg + ' ' + k.key_id; }).join(' · ') : ''));
      cards.push(card(s.beacon.ok ? (s.beacon.age_s > 30 ? 'warn' : 'ok') : 'bad', 'DRAND BEACON', s.beacon.ok ? 'Round ' + Number(s.beacon.round).toLocaleString('en-US') : esc(s.beacon.error), s.beacon.ok ? s.beacon.age_s + ' s old · proves nothing is signed in advance' : ''));
      cards.push(card(s.timestamps.ok ? 'ok' : 'bad', 'TIMESTAMPS', s.timestamps.ok ? 'RFC 3161' : esc(s.timestamps.error), s.timestamps.ok ? 'For PDFs, code signing and Content Credentials' : ''));
      var t = s.tideline;
      cards.push(card(!t.ok ? 'bad' : t.overdue ? 'warn' : 'ok', 'TIDELINE', t.ok ? 'Lune ' + esc(t.open_lune) + ' open' : esc(t.error), t.ok ? (t.overdue ? t.waiting_to_seal + ' lunes waiting to seal' : 'Seals after ' + fmt(t.seals_after_utc)) : ''));
      if (!s.signing.ok) problems.push('Signing is down');
      if (!s.beacon.ok) problems.push('The drand beacon is not answering');
      if (!s.timestamps.ok) problems.push('Timestamps are down');
      if (!t.ok) problems.push('The Tideline is down'); else if (t.overdue) problems.push('The Tideline is behind on sealing');
    } else problems.push('Moon could not run its checks');
    if (!health || !health.ok) problems.unshift('The API is not answering');

    var banner = $('[data-st-banner]'), down = problems.filter(function (x) { return !/behind/.test(x); }).length, level = down ? 'bad' : problems.length ? 'warn' : 'ok';
    banner.className = 'st-banner ' + level;
    banner.innerHTML = dot(level) + '<div><b>' + (problems.length ? esc(problems.join(' · ')) : 'ALL SYSTEMS WORKING') + '</b><span>Checked ' + fmt(new Date().toISOString(), false) + ' · updates every minute</span></div>';
    $('[data-st-cards]').innerHTML = cards.join('');

    // Nightly record
    var tides = (tl && tl.b && tl.b.tides) || [], rows = $('[data-st-tides]');
    if (!tides.length) {
      var after = s && s.tideline && s.tideline.ok ? s.tideline.seals_after_utc : (tl && tl.b && tl.b.seals_after_utc);
      rows.innerHTML = '<tr><td colspan="3" class="st-empty">No tide has sealed yet. The first one seals after ' + (after ? fmt(after) : 'the current lune ends') + '.</td></tr>';
    } else rows.innerHTML = tides.map(function (x) {
      return '<tr><td><a href="/tide/' + esc(x.lune) + '">' + esc(x.lune) + '</a></td><td>' + Number(x.size).toLocaleString('en-US') + '</td><td>' + fmt(new Date(Number(BigInt(x.sealed_unix_ns) / 1000000n)).toISOString()) + '</td></tr>';
    }).join('');

    // Dates that matter
    var dates = [];
    var row = function (name, iso, warnDays, note) {
      var left = iso ? Math.floor((Date.parse(iso) - Date.now()) / 864e5) : null, state = left === null ? 'off' : left < 0 ? 'bad' : left < warnDays ? 'warn' : 'ok';
      dates.push('<tr><td>' + dot(state) + name + '</td><td>' + (iso ? dateOnly(iso) : '<span class="st-mut">unknown</span>') + '</td><td>' + (left === null ? '' : left < 0 ? 'expired' : left.toLocaleString('en-US') + ' days') + '</td><td class="st-mut">' + note + '</td></tr>');
    };
    if (s && s.timestamps.ok) {
      row('Timestamp certificate', s.timestamps.certificate.not_after_utc, 60, '<a href="/pki/moon-tsa.pem">moon-tsa.pem</a>');
      row('Root certificate', s.timestamps.root.not_after_utc, 365, '<a href="/pki/moon-root.cer">moon-root.cer</a>');
    }
    row('Revocation list', crl, 60, 'Renewed yearly · <a href="/pki/moon-root.crl">moon-root.crl</a>');
    dates.push('<tr><td>' + dot('ok') + 'Signing keys</td><td>Never expire</td><td></td><td class="st-mut">Retired only as <a href="/trust#keys-promise">the key promise</a> says</td></tr>');
    $('[data-st-dates]').innerHTML = dates.join('');
  }

  function load() {
    Promise.all([
      timed(API + '/health').catch(function () { return null; }),
      timed(API + '/v1/status').catch(function () { return null; }),
      timed(API + '/v1/tideline').catch(function () { return null; }),
      fetch('/pki/moon-root.crl', { cache: 'no-store' }).then(function (r) { return r.arrayBuffer(); }).then(crlNextUpdate).catch(function () { return null; }),
    ]).then(function (a) { render(a[0], a[1], a[2], a[3]); });
  }
  var t = 0, iv = setInterval(function () {
    var el = $('[data-st-banner]'), snap = document.querySelector('[data-dc-snapshot]');
    if ((el && !(snap && snap.contains(el))) || ++t > 200) { clearInterval(iv); if (el) { load(); setInterval(load, 60000); } }
  }, 25);
})();
