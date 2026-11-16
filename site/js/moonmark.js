/* Moonmark page: open, show and share one exact moment on the Moon engine. */
(function () {
  var EPOCH = -62165308562978.61, K = 1.0403730490216803, SEC = 1000 * K;
  var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
  var firstDay = function (m) { return Math.ceil(m * 369 / 13); };
  function fromMs(ms, nsExtra) {
    var t = ms - EPOCH, s = t / SEC, whole = Math.floor(s), frac = s - whole;
    var da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - firstDay(mi) + 1, sd = whole - da * 86400;
    var ns = nsExtra != null ? nsExtra : Math.floor(frac * 1e9);
    return { y: y, m: mi + 1, d: d, h: Math.floor(sd / 3600), mi: Math.floor(sd % 3600 / 60), s: sd % 60, ns: ns };
  }
  function parse(str) {
    str = decodeURIComponent(str || '').trim();
    var u = /^(-?\d+)\.(\d{1,2})\.(\d{1,2})(?:[- T](\d{1,2})[.:](\d{2})(?:[.:](\d{2})(?:\.(\d{1,9}))?)?)?$/.exec(str);
    if (!u) return null;
    var mk = { y: +u[1], m: +u[2], d: +u[3], h: +(u[4] || 0), mi: +(u[5] || 0), s: +(u[6] || 0), ns: u[7] ? +u[7].padEnd(9, '0') : 0 };
    if (mk.m < 1 || mk.m > 13 || mk.d < 1 || mk.d > firstDay(mk.m) - firstDay(mk.m - 1) || mk.h > 23 || mk.mi > 59 || mk.s > 59) return null;
    return mk;
  }
  function toMs(mk) {
    var days = mk.y * 369 + firstDay(mk.m - 1) + mk.d - 1;
    return EPOCH + (days * 86400 + mk.h * 3600 + mk.mi * 60 + mk.s + mk.ns / 1e9) * SEC;
  }
  var text = function (mk) { return mk.y + '.' + p(mk.m) + '.' + p(mk.d) + ' ' + p(mk.h) + ':' + p(mk.mi) + ':' + p(mk.s); };
  var path = function (mk) { return mk.y + '.' + p(mk.m) + '.' + p(mk.d) + '-' + p(mk.h) + '.' + p(mk.mi) + '.' + p(mk.s) + '.' + p(mk.ns, 9); };
  var nsGroups = function (ns) { var d = p(ns, 9); return '.' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6); };

  // A signed link carries the receipt: ?s=<sha256>&u=<unix_ns>&k=<key_id>&g=<signature>
  function receiptFrom(mk) {
    var q = new URLSearchParams(location.search);
    var s = (q.get('s') || '').toLowerCase(), u = q.get('u'), k = q.get('k'), g = q.get('g'), rd = q.get('r'), bs = (q.get('b') || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(s) || !/^-?\d+$/.test(u || '') || !/^[0-9a-f]{16}$/.test(k || '') || !/^[A-Za-z0-9_-]{40,120}$/.test(g || '')) return null;
    var rc = { receipt: 'moonmark-receipt/1', sha256: s, moonmark: text(mk) + '.' + p(mk.ns, 9), unix_ns: u, key_id: k };
    var hasB = /^\d{1,12}$/.test(rd || '') && /^[0-9a-f]{96}$/.test(bs), pqk = (q.get('q') || '').toLowerCase();
    if (hasB) { rc.receipt = 'moonmark-receipt/2'; rc.beacon = { network: 'drand-quicknet', round: Number(rd), signature: bs }; }
    if (/^[0-9a-f]{16}$/.test(pqk)) { rc.receipt = 'moonmark-receipt/3'; rc.pq = { alg: 'ML-DSA-65', key_id: pqk }; }
    rc.signature = g;
    return rc;
  }
  // An event link carries a name: /m/<moonmark>?e=Launch%20party
  function eventName() {
    var e = new URLSearchParams(location.search).get('e') || '';
    e = e.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return e ? e.slice(0, 80) : '';
  }
  function icsStamp(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); }
  function icsText(x) { return String(x).replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n'); }
  function ics(name, ms, url, mark) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moon//moon369.org//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + mark.replace(/[^0-9]/g, '') + '-' + Math.abs(name.split('').reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7)) + '@moon369.org',
      'DTSTAMP:' + icsStamp(Date.now()), 'DTSTART:' + icsStamp(ms), 'DURATION:PT1H',
      'SUMMARY:' + icsText(name), 'DESCRIPTION:' + icsText('Moonmark ' + mark + '\n' + url), 'URL:' + url,
      'END:VEVENT', 'END:VCALENDAR'];
    return lines.join('\r\n') + '\r\n';
  }
  function gcal(name, ms, url, mark) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(name) + '&dates=' + icsStamp(ms) + '/' + icsStamp(ms + 3600000) +
      '&details=' + encodeURIComponent('Moonmark ' + mark + '\n' + url);
  }
  // Countdown to (or time since) the event, updated every second.
  function span(ms) {
    var t = Math.abs(ms), d = Math.floor(t / 864e5), h = Math.floor(t % 864e5 / 36e5), m = Math.floor(t % 36e5 / 6e4), s2 = Math.floor(t % 6e4 / 1e3);
    return [['DAYS', String(d)], ['HOURS', p(h)], ['MIN', p(m)], ['SEC', p(s2)]];
  }
  var cdTimer = 0;
  function countdown(root, ms) {
    var box = root.querySelector('[data-mk-cd]'); if (!box) return;
    clearInterval(cdTimer);
    var tick = function () {
      var left = ms - Date.now(), past = left <= 0, live = past && left > -3600000;
      box.querySelector('[data-mk-cd-l]').textContent = live ? 'HAPPENING NOW · STARTED' : past ? 'THIS EVENT STARTED' : 'STARTS IN';
      box.querySelector('[data-mk-cd-c]').innerHTML = span(left).map(function (x) { return '<div><b>' + x[1] + '</b><i>' + x[0] + '</i></div>'; }).join('') + (past ? '<div class="mk-cd-ago"><i>AGO</i></div>' : '');
    };
    tick(); cdTimer = setInterval(tick, 1000);
  }
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // Start checking the signature as soon as the script runs, before anything else waits.
  var verifyCache = {};
  function verifyEarly(rc) {
    var k = rc.signature;
    if (!verifyCache[k]) verifyCache[k] = fetch('https://api.moon369.org/v1/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: rc }) }).then(function (r) { return r.json(); });
    return verifyCache[k];
  }
  // drand quicknet: round n was published at genesis + (n - 1) * 3 seconds, so this needs no network.
  function roundUtc(n) { return new Date((1692803367 + (n - 1) * 3) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
  // A certificate of authenticity link carries its details: &ca=artist&ct=title&cy=year&ce=edition&cm=<master sha256, base64url>.
  // They are trusted only if their SHA-256, as a moon-coa/1 statement, is exactly the fingerprint Moon signed.
  function coaFrom() {
    var q = new URLSearchParams(location.search), cm = q.get('cm');
    if (!q.get('ca') || !q.get('ct') || !q.get('cy') || !/^[A-Za-z0-9_-]{43}$/.test(cm || '')) return null;
    var bin = atob(cm.replace(/-/g, '+').replace(/_/g, '/') + '='), master = '';
    for (var i = 0; i < bin.length; i++) master += bin.charCodeAt(i).toString(16).padStart(2, '0');
    var ce = q.get('ce') || '';
    var cp = q.get('cp') || '', cs = q.get('cs') || '';
    return { artist: q.get('ca'), title: q.get('ct'), year: q.get('cy'), edition: /^\d{1,3}$/.test(ce) ? ce : '', master: master,
      print: /^\d{1,3}$/.test(cp) && /^[A-Za-z0-9_-]{6,40}$/.test(cs) ? { n: +cp, id: cs } : null };
  }
  function coaStatement(c) { return ['moon-coa/1', 'artist:' + c.artist, 'title:' + c.title, 'year:' + c.year, 'edition:' + (c.edition || 'unique'), 'master:' + c.master].join('\n'); }
  function coaBox(root, rc, c) {
    var box = root.querySelector('[data-mk-coa]'); if (!box) return;
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(coaStatement(c))).then(function (d) {
      var h = Array.from(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
      if (h !== rc.sha256) { box.className = 'mk-coa mk-coa-bad'; box.innerHTML = '<div class="mk-sig-h">THESE DETAILS DO NOT MATCH THE SIGNATURE</div><div class="mk-sig-p">The artwork details in this link were changed after Moon signed them. Do not rely on them.</div>'; return; }
      window.__moonCoaMaster = c.master;
      var h1 = document.querySelector('h1'), ey = document.querySelector('.mk-ey');
      if (h1) { h1.textContent = 'CERTIFICATE OF AUTHENTICITY'; h1.classList.add('mk-h1-s'); }
      if (ey) ey.innerHTML = '<span>ART</span><span class="mk-sep"> · </span><span>SIGNED ON MOON</span>';
      document.title = c.title + ' by ' + c.artist + ' · Certificate · Moon';
      box.className = 'mk-coa';
      box.innerHTML = '<div class="mk-coa-t">' + esc(c.title) + '</div><div class="mk-coa-a">' + esc(c.artist) + ', ' + esc(c.year) + '</div>' +
        '<div class="mk-coa-e">' + (c.edition ? (c.print ? 'PRINT ' + c.print.n + ' OF ' + esc(c.edition) : 'EDITION OF ' + esc(c.edition)) : 'UNIQUE WORK') + '</div>' +
        (c.edition && c.print ? '<div class="mk-coa-p" data-mk-print>Checking this print on Moon…</div>' : '') +
        '<div class="mk-sig-r"><span>MASTER FILE</span><b title="' + c.master + '">' + c.master.slice(0, 12) + '…' + c.master.slice(-8) + '</b></div>' +
        '<div class="mk-sig-p">These details match the fingerprint Moon signed, so they have not been changed since. The artist&#39;s name is as stated; Moon does not verify it. Use CHECK A FILE below with the artwork&#39;s master file to match it exactly.</div>';
      var pb = box.querySelector('[data-mk-print]');
      if (pb) fetch('https://api.moon369.org/v1/editions/' + rc.sha256 + '/' + c.print.n + '?id=' + encodeURIComponent(c.print.id)).then(function (r) { return r.json(); }).then(function (b) {
        if (!b.valid) { pb.className = 'mk-coa-p bad'; pb.textContent = '✕ ' + (b.registered ? 'This print number does not check out: ' + (b.reason || '') + '.' : 'This edition is not registered on Moon, so the print number cannot be confirmed.'); return; }
        var first = new Date(b.first_check).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        pb.className = 'mk-coa-p ok';
        pb.textContent = '✓ Print ' + b.print + ' of ' + b.edition + ' is registered on Moon. ' + (b.checks === 1 ? 'This is the first time this certificate has been checked.' : 'This certificate has been checked ' + b.checks + ' times since ' + first + '.');
      }).catch(function () { pb.textContent = 'Could not reach Moon to check the print number.'; });
    });
  }
  var TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  // The permanent record: where this Moonmark sits in the Tideline, how long it has existed, and its history.
  var ageTimer = 0;
  function ageText(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    var y = Math.floor(d / 365.2425), dd = Math.floor(d - y * 365.2425);
    var parts = [];
    if (y) parts.push(y + (y === 1 ? ' year' : ' years'));
    if (y || dd) parts.push(dd + (dd === 1 ? ' day' : ' days'));
    parts.push(h + (h === 1 ? ' hour' : ' hours'), p(m) + ' min', p(x) + ' sec');
    return parts.join(', ');
  }
  function when(ns) {
    var ms = Number(BigInt(ns) / 1000000n), mk = fromMs(ms);
    var loc = ''; try { loc = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ms); } catch (e) { loc = new Date(ms).toUTCString(); }
    return text(mk) + ' · ' + loc;
  }
  function recordBox(root, rc) {
    var box = root.querySelector('[data-mk-rec]'); if (!box) return;
    var born = Number(BigInt(rc.unix_ns) / 1000000n);
    var step = function (done, title, detail) { return '<li class="' + (done ? 'done' : 'next') + '"><span aria-hidden="true"></span><div><b>' + title + '</b>' + (detail ? '<i>' + detail + '</i>' : '') + '</div></li>'; };
    var draw = function (pr) {
      var steps = [];
      if (rc.beacon) steps.push(step(true, 'Could not have existed earlier', 'Public drand beacon, round ' + Number(rc.beacon.round).toLocaleString('en-US') + ' · ' + roundUtc(rc.beacon.round)));
      steps.push(step(true, 'Signed by Moon', when(rc.unix_ns) + (rc.pq ? ' · Ed25519 + ML-DSA-65' : ' · Ed25519')));
      var head = '';
      if (pr && pr.status && pr.status !== 'not_found') {
        var lune = pr.lune, n = pr.index + 1;
        head = '<a class="mk-rec-n" href="/tide/' + lune + '#e' + pr.index + '"><span>TIDE ' + lune + '</span><span>ENTRY ' + n.toLocaleString('en-US') + '</span></a>';
        steps.push(step(true, 'Written into the Tideline', 'Tide ' + lune + ', entry ' + n.toLocaleString('en-US') + ' · Moon&#39;s public log'));
        if (pr.status === 'sealed' && pr.tide) {
          steps.push(step(true, 'Sealed into tide ' + lune, when(pr.tide.sealed_unix_ns) + ' · one Merkle root over ' + pr.tide.size.toLocaleString('en-US') + ' entries'));
          var b = pr.tide.bitcoin;
          if (b && b.status === 'confirmed') steps.push(step(true, 'Anchored in Bitcoin', 'Block ' + Number(b.block_height).toLocaleString('en-US') + ' · through OpenTimestamps'));
          else if (b) steps.push(step(false, 'Anchoring in Bitcoin', 'Waiting for the next Bitcoin blocks, usually a few hours'));
        } else {
          steps.push(step(false, 'Sealed into tide ' + lune, 'When the lune ends: ' + String(pr.seals_after_utc || '').replace('T', ' ').slice(0, 16) + ' UTC'));
          steps.push(step(false, 'Anchored in Bitcoin', 'After the tide seals'));
        }
      }
      box.innerHTML = '<div class="mk-rec-k">IN THE PERMANENT RECORD</div>' + head +
        '<div class="mk-rec-age"><span>HAS EXISTED FOR</span><b data-mk-age>' + ageText(Date.now() - born) + '</b></div>' +
        '<ol class="mk-hist">' + steps.join('') + '</ol>' +
        '<p class="mk-rec-p">This record cannot be changed or backdated. Its receipt checks out offline with Moon&#39;s public keys, even if Moon is ever gone.</p>';
      clearInterval(ageTimer);
      ageTimer = setInterval(function () { var a = box.querySelector('[data-mk-age]'); if (!a) return clearInterval(ageTimer); a.textContent = ageText(Date.now() - born); }, 1000);
    };
    draw(null);
    fetch('https://api.moon369.org/v1/tideline/proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: rc }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (pr) { if (pr) draw(pr); }).catch(function () {});
  }
  function sigBox(root, rc) {
    var box = root.querySelector('[data-mk-sig]'); if (!box) return;
    var short = rc.sha256.slice(0, 12) + '…' + rc.sha256.slice(-8);
    var href = URL.createObjectURL(new Blob([JSON.stringify(rc, null, 2) + '\n'], { type: 'application/json' }));
    var nb = rc.beacon ? rc.beacon.round : null;
    // Everything the link already carries is shown at once; only the verdict waits for Moon.
    box.className = 'mk-sig mk-sig-wait';
    box.innerHTML =
      '<div class="mk-sig-h" data-mk-h>CHECKING SIGNATURE…</div>' +
      '<div class="mk-sig-p" data-mk-p>Moon signed this file fingerprint at this exact moment' + (nb ? ', after a public drand beacon that proves it couldn&#39;t have been signed any&nbsp;earlier' : '') + '. Checking the signature now.</div>' +
      '<div class="mk-sig-r"><span>SHA-256</span><b title="' + rc.sha256 + '">' + short + '</b></div>' +
      '<div class="mk-sig-r"><span>KEY</span><b>' + rc.key_id + ' · Ed25519</b></div>' +
      (rc.pq ? '<div class="mk-sig-r"><span>POST-QUANTUM</span><b>ML-DSA-65 · in the saved receipt</b></div>' : '') +
      (nb ? '<div class="mk-sig-r"><span style="display:inline-flex;align-items:center">NOT BEFORE<span class="mi"><button type="button" class="mi-b" aria-label="What NOT BEFORE means" aria-expanded="false" aria-describedby="mi-nb">i</button><span role="tooltip" id="mi-nb" class="mi-t">drand is public randomness from the League of Entropy, independent organizations including Cloudflare. A new value every 3 seconds that no one can predict. This receipt includes one, so it couldn&#39;t have been signed before that value existed.</span></span></span><b title="drand quicknet round ' + nb + '">' + roundUtc(nb) + '</b></div>' : '') +
      '<label class="mk-sig-btn">CHECK A FILE<input type="file" data-mk-file></label>' +
      '<a class="mk-sig-btn" href="' + href + '" download="' + rc.moonmark.replace(/[^0-9.]+/g, '_') + '.moonmark.json">SAVE RECEIPT</a>' +
      '<div class="mk-sig-m" data-mk-match></div>';
    var inp = box.querySelector('[data-mk-file]'), out = box.querySelector('[data-mk-match]');
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      out.textContent = 'Fingerprinting ' + f.name + '…';
      f.arrayBuffer().then(function (b2) { return crypto.subtle.digest('SHA-256', b2); }).then(function (d) {
        var h = Array.from(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
        var mst = window.__moonCoaMaster, ok = h === rc.sha256 || h === mst;
        out.className = 'mk-sig-m ' + (ok ? 'yes' : 'no');
        out.textContent = h === mst ? '✓ ' + f.name + ' is the exact master file of this artwork.' : ok ? '✓ ' + f.name + ' is the exact file Moon signed.' : '✕ ' + f.name + ' is not the file Moon signed' + (mst ? ' or the master file.' : '.');
      }).catch(function () { out.textContent = 'Could not read that file.'; });
    };
    var hEl = box.querySelector('[data-mk-h]'), pEl = box.querySelector('[data-mk-p]');
    verifyEarly(rc).then(function (b) {
      if (!b || !b.valid) {
        box.className = 'mk-sig mk-sig-bad';
        hEl.textContent = 'SIGNATURE DOES NOT CHECK OUT';
        pEl.innerHTML = 'This link&#39;s receipt is not valid' + (b && b.reason ? ' (' + esc(b.reason) + ')' : '') + '. Do not rely on it.';
        return;
      }
      box.className = 'mk-sig mk-sig-ok';
      hEl.innerHTML = TICK + 'SIGNED · VERIFIED';
      pEl.innerHTML = 'Moon signed this file fingerprint at this exact moment. The signature checks out' + (b.not_before ? ', and a public drand beacon proves it couldn&#39;t have been signed any&nbsp;earlier' : '') + '.';
    }).catch(function () {
      hEl.textContent = 'COULD NOT REACH MOON TO CHECK THE SIGNATURE';
      pEl.textContent = 'The details below come from the link. Try again in a moment.';
    });
  }
  function render(root, mk, fresh, rc, ev) {
    var ms = toMs(mk), coa = rc ? coaFrom() : null;
    if (ev) ms = Math.round(ms / 1000) * 1000;   // events are set to the second; drop float dust below it
    var url = 'https://moon369.org/m/' + path(mk) + (rc ? location.search : ev ? '?e=' + encodeURIComponent(ev).replace(/%20/g, '+') : '');
    var f = window.MoonPhase ? window.MoonPhase.fraction(ms) : 0;
    var il = window.MoonPhase ? (window.MoonPhase.illumination(ms) * 100).toFixed(1) : '0.0';
    var nm = window.MoonPhase ? window.MoonPhase.name(f) : '';
    var zone = 'UTC', local = '', abbr = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
    try {
      local = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(ms);
      var tp = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(ms);
      tp.forEach(function (x) { if (x.type === 'timeZoneName') abbr = x.value; });
    } catch (e) {}
    var qr = '';
    try {
      if (window.MoonQR) qr = window.MoonQR.svg(url, f);
      else {
        var q = window.qrcode(0, 'H'); q.addData(url); q.make();
        qr = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true }).replace(/fill="white"/g, 'fill="#E9E4D8"').replace(/fill="black"/g, 'fill="#0B0B0D"');
      }
    } catch (e) {}
    var ph = window.MoonPhase ? window.MoonPhase.path(f, 10) : '';
    root.innerHTML =
      '<div class="mk-grid">' +
      '<div class="mk-main">' +
      (fresh ? '<div class="mk-l">JUST MARKED</div>' : '') +
      (ev ? '<div class="mk-cd" data-mk-cd><div class="mk-l" data-mk-cd-l>STARTS IN</div><div class="mk-cd-c" data-mk-cd-c></div></div>' +
        '<div class="mk-when"><span>YOUR LOCAL TIME</span><b>' + esc(local) + ' ' + esc(abbr) + '</b></div>' : '') +
      (rc && coa ? '<div data-mk-coa></div>' : '') +
      (rc ? '<div data-mk-sig></div><div class="mk-rec" data-mk-rec></div>' : '') +
      '<div class="mk-date"><svg viewBox="-11 -11 22 22" class="mk-ph" role="img" aria-label="' + nm + '"><defs><clipPath id="mk-disc"><circle r="10"/></clipPath><filter id="mk-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.8"/></filter></defs><circle r="10" fill="#24262A"/><g clip-path="url(#mk-disc)"><path d="' + ph + '" fill="#E9E4D8" filter="url(#mk-soft)"/></g></svg>' +
      '<div class="mk-cells"><div><i>CYCLE</i><b>' + mk.y + '</b></div><div><i>MOON</i><b>' + p(mk.m) + '</b></div><div><i>LUNE</i><b>' + p(mk.d) + '</b></div></div></div>' +
      '<div class="mk-mark" aria-label="Moonmark ' + text(mk) + '.' + p(mk.ns, 9) + '"><span>' + mk.y + '.' + p(mk.m) + '.' + p(mk.d) + '</span> <span>' + p(mk.h) + ':' + p(mk.mi) + ':' + p(mk.s) + '<span class="mk-ns">' + nsGroups(mk.ns) + '</span></span></div>' +
      '<div class="mk-rows">' +
      (ev ? '' : '<div><span>YOUR LOCAL CLOCK</span><b>' + local + ' ' + abbr + '</b></div>') +
      '<div><span>THE MOON THAT NIGHT</span><b>' + nm + ' · ' + il + '% lit<span class="mi"><button type="button" class="mi-b" aria-label="What the lit percentage means" aria-expanded="false" aria-describedby="mi-t3">i</button><span role="tooltip" id="mi-t3" class="mi-t">Share of the moon&#39;s face lit by the sun at this moment, as seen from Earth. Moon calculates it from the moon&#39;s real position (Meeus, Astronomical Algorithms) and checks it against PyEphem, a standard astronomy library: they agree within 0.05 percentage&nbsp;points.</span></span></b></div>' +
      '<div><span>UTC</span><b>' + new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + '</b></div>' +
      '</div>' +
      (ev
        ? '<div class="mk-btns"><a class="mk-p" data-mk-ics href="#" download="">ADD TO CALENDAR</a><a href="' + esc(gcal(ev, ms, url, text(mk))) + '" target="_blank" rel="noopener">GOOGLE CALENDAR</a><button type="button" data-mk-copy>COPY LINK</button><button type="button" data-mk-embed>COPY EMBED CODE</button></div>'
        : '<div class="mk-btns"><button type="button" data-mk-copy>COPY LINK</button><button type="button" data-mk-now class="mk-p">MARK THIS MOMENT</button></div>') +
      '</div>' +
      '<div class="mk-side"><div class="mk-qr">' + qr + '</div><div class="mk-cap">Scan to open this ' + (ev ? 'event' : 'Moonmark') + ' in your own local time.</div>' +
      (rc || ev ? '' : '<div class="mk-note">This Moonmark is unsigned. A signed Moonmark from Moon proves when something happened.</div>') + '</div>' +
      '</div>';
    if (rc) { sigBox(root, rc); recordBox(root, rc); }
    if (rc && coa) coaBox(root, rc, coa);
    root.querySelector('[data-mk-copy]').onclick = function (e) {
      try { navigator.clipboard.writeText(url); e.target.textContent = 'COPIED'; } catch (err) { e.target.textContent = url; }
    };
    if (ev) {
      var a = root.querySelector('[data-mk-ics]');
      a.href = URL.createObjectURL(new Blob([ics(ev, ms, url, text(mk))], { type: 'text/calendar' }));
      a.download = (ev.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event') + '.ics';
      countdown(root, ms);
      root.querySelector('[data-mk-embed]').onclick = function (e) {
        var code = '<div data-moon-countdown="' + path(mk) + '" data-name="' + esc(ev) + '"></div>\n<script src="https://moon369.org/embed/countdown.js" async><\/script>';
        try { navigator.clipboard.writeText(code); e.target.textContent = 'EMBED CODE COPIED'; } catch (err) { e.target.textContent = 'COULD NOT COPY'; }
      };
      var h1 = document.querySelector('h1'), ey = document.querySelector('.mk-ey');
      if (h1) { h1.textContent = ev.toUpperCase(); h1.style.overflowWrap = 'anywhere'; h1.classList.add('mk-h1-s'); }
      if (ey) ey.innerHTML = '<span>AN EVENT ON MOON</span><span class="mk-sep"> · </span><span>THE SAME MOMENT EVERYWHERE</span>';
      document.title = ev + ' · Moon';
      return;
    }
    root.querySelector('[data-mk-now]').onclick = function () {
      var nowMs = (performance.timeOrigin || Date.now() - performance.now()) + performance.now();
      var mk2 = fromMs(nowMs);
      history.replaceState(null, '', '/m/' + path(mk2));
      render(root, mk2, true);
    };
  }
  // Make an event link: a name and a local date and time become one Moonmark link.
  function maker() {
    var f = document.querySelector('[data-ev-form]'); if (!f || f.dataset.on) return; f.dataset.on = '1';
    var when = f.querySelector('[data-ev-when]'), name = f.querySelector('[data-ev-name]'), out = f.querySelector('[data-ev-out]');
    var zone = 'your time zone'; try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || zone; } catch (e) {}
    var z = f.querySelector('[data-ev-zone]'); if (z) z.textContent = 'In ' + zone + '. Everyone who opens the link sees it in their own time.';
    if (!when.value) { var d = new Date(Date.now() + 864e5); d.setMinutes(0, 0, 0); when.value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
    f.onsubmit = function (e) {
      e.preventDefault();
      var nm = name.value.replace(/\s+/g, ' ').trim().slice(0, 80), t = new Date(when.value).getTime();
      if (!nm) { out.textContent = 'Give the event a name.'; name.focus(); return; }
      if (!isFinite(t)) { out.textContent = 'Choose a date and time.'; when.focus(); return; }
      location.href = '/m/' + path(fromMs(t + 1)) + '?e=' + encodeURIComponent(nm).replace(/%20/g, '+');   // +1 ms so the second never rounds down
    };
  }
  function start() {
    var root = document.querySelector('[data-mk-root]'); if (!root) return false;
    var pm = /\/m\/([^/?#]+)/.exec(location.pathname);
    var q = pm ? pm[1] : new URLSearchParams(location.search).get('m');
    var mk = q ? parse(q) : null;
    if (q && !mk) { root.innerHTML = '<div class="mk-l">THAT IS NOT A VALID MOONMARK</div>'; mk = null; }
    var fresh = false;
    if (!mk) { mk = fromMs(Date.now()); fresh = !q; }
    var rc = mk ? receiptFrom(mk) : null;
    render(root, mk, false, rc, rc || !q || !parse(q) ? '' : eventName());
    maker();
    return true;
  }
  try {
    var pm0 = /\/m\/([^/?#]+)/.exec(location.pathname), q0 = pm0 ? pm0[1] : new URLSearchParams(location.search).get('m');
    var mk0 = q0 ? parse(q0) : null, rc0 = mk0 ? receiptFrom(mk0) : null;
    if (rc0) verifyEarly(rc0);
  } catch (e) {}
  var t = 0, iv = setInterval(function () { if ((window.MoonPhase && window.qrcode && start()) || ++t > 80) clearInterval(iv); }, 100);
})();
