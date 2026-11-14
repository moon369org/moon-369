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
    if (/^\d{1,12}$/.test(rd || '') && /^[0-9a-f]{96}$/.test(bs)) { rc.receipt = 'moonmark-receipt/2'; rc.beacon = { network: 'drand-quicknet', round: Number(rd), signature: bs }; }
    rc.signature = g;
    return rc;
  }
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function sigBox(root, rc) {
    var box = root.querySelector('[data-mk-sig]'); if (!box) return;
    var short = rc.sha256.slice(0, 12) + '…' + rc.sha256.slice(-8);
    box.className = 'mk-sig';
    box.innerHTML = '<div class="mk-sig-h">CHECKING SIGNATURE…</div>';
    fetch('https://api.moon369.org/v1/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: rc }) })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b || !b.valid) {
          box.className = 'mk-sig mk-sig-bad';
          box.innerHTML = '<div class="mk-sig-h">SIGNATURE DOES NOT CHECK OUT</div><div class="mk-sig-p">This link&#39;s receipt is not valid' + (b && b.reason ? ' (' + esc(b.reason) + ')' : '') + '. Do not rely on it.</div>';
          return;
        }
        var href = URL.createObjectURL(new Blob([JSON.stringify(rc, null, 2) + '\n'], { type: 'application/json' }));
        box.className = 'mk-sig mk-sig-ok';
        box.innerHTML =
          '<div class="mk-sig-h"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>SIGNED · VERIFIED</div>' +
          '<div class="mk-sig-p">Moon signed this file fingerprint at this exact moment. The signature checks out' + (b.not_before ? ', and a public drand beacon proves it couldn&#39;t have been signed any&nbsp;earlier' : '') + '.</div>' +
          '<div class="mk-sig-r"><span>SHA-256</span><b title="' + rc.sha256 + '">' + short + '</b></div>' +
          '<div class="mk-sig-r"><span>KEY</span><b>' + rc.key_id + ' · Ed25519</b></div>' +
          (b.not_before ? '<div class="mk-sig-r"><span>NOT BEFORE</span><b title="drand quicknet round ' + b.not_before.round + '">' + esc(b.not_before.utc.replace('T', ' ').slice(0, 19)) + ' UTC</b></div>' : '') +
          '<label class="mk-sig-btn">CHECK A FILE<input type="file" data-mk-file></label>' +
          '<a class="mk-sig-btn" href="' + href + '" download="' + rc.moonmark.replace(/[^0-9.]+/g, '_') + '.moonmark.json">SAVE RECEIPT</a>' +
          '<div class="mk-sig-m" data-mk-match></div>';
        var inp = box.querySelector('[data-mk-file]'), out = box.querySelector('[data-mk-match]');
        inp.onchange = function () {
          var f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
          out.textContent = 'Fingerprinting ' + f.name + '…';
          f.arrayBuffer().then(function (b2) { return crypto.subtle.digest('SHA-256', b2); }).then(function (d) {
            var h = Array.from(new Uint8Array(d), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
            out.className = 'mk-sig-m ' + (h === rc.sha256 ? 'yes' : 'no');
            out.textContent = h === rc.sha256 ? '✓ ' + f.name + ' is the exact file Moon signed.' : '✕ ' + f.name + ' is not the file Moon signed.';
          }).catch(function () { out.textContent = 'Could not read that file.'; });
        };
      })
      .catch(function () { box.innerHTML = '<div class="mk-sig-h">COULD NOT REACH MOON TO CHECK THE SIGNATURE</div>'; });
  }
  function render(root, mk, fresh, rc) {
    var ms = toMs(mk);
    var url = 'https://moon369.org/m/' + path(mk) + (rc ? '?s=' + rc.sha256 + '&u=' + rc.unix_ns + '&k=' + rc.key_id + '&g=' + rc.signature : '');
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
      (rc ? '<div data-mk-sig></div>' : '') +
      '<div class="mk-date"><svg viewBox="-11 -11 22 22" class="mk-ph" role="img" aria-label="' + nm + '"><circle r="10" fill="#24262A"/><path d="' + ph + '" fill="#E9E4D8"/></svg>' +
      '<div class="mk-cells"><div><i>YEAR</i><b>' + mk.y + '</b></div><div><i>MOON</i><b>' + p(mk.m) + '</b></div><div><i>LUNE</i><b>' + p(mk.d) + '</b></div></div></div>' +
      '<div class="mk-mark" aria-label="Moonmark ' + text(mk) + '.' + p(mk.ns, 9) + '"><span>' + mk.y + '.' + p(mk.m) + '.' + p(mk.d) + '</span> <span>' + p(mk.h) + ':' + p(mk.mi) + ':' + p(mk.s) + '<span class="mk-ns">' + nsGroups(mk.ns) + '</span></span></div>' +
      '<div class="mk-rows">' +
      '<div><span>YOUR LOCAL CLOCK</span><b>' + local + ' ' + abbr + '</b></div>' +
      '<div><span>THE MOON THAT NIGHT</span><b>' + nm + ' · ' + il + '% lit<span class="mi"><button type="button" class="mi-b" aria-label="What the lit percentage means" aria-expanded="false" aria-describedby="mi-t3">i</button><span role="tooltip" id="mi-t3" class="mi-t">Share of the moon&#39;s face lit by the sun at this moment, as seen from Earth. Moon calculates it from the moon&#39;s real position (Meeus, Astronomical Algorithms) and checks it against PyEphem, a standard astronomy library: they agree within 0.05 percentage&nbsp;points.</span></span></b></div>' +
      '<div><span>UTC</span><b>' + new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + '</b></div>' +
      '</div>' +
      '<div class="mk-btns"><button type="button" data-mk-copy>COPY LINK</button><button type="button" data-mk-now class="mk-p">MARK THIS MOMENT</button></div>' +
      '</div>' +
      '<div class="mk-side"><div class="mk-qr">' + qr + '</div><div class="mk-cap">Scan to open this Moonmark in your own local time.</div>' +
      (rc ? '' : '<div class="mk-note">This Moonmark is unsigned. A signed Moonmark from Moon proves when something happened.</div>') + '</div>' +
      '</div>';
    if (rc) sigBox(root, rc);
    root.querySelector('[data-mk-copy]').onclick = function (e) {
      try { navigator.clipboard.writeText(url); e.target.textContent = 'COPIED'; } catch (err) { e.target.textContent = url; }
    };
    root.querySelector('[data-mk-now]').onclick = function () {
      var nowMs = (performance.timeOrigin || Date.now() - performance.now()) + performance.now();
      var mk2 = fromMs(nowMs);
      history.replaceState(null, '', '/m/' + path(mk2));
      render(root, mk2, true);
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
    render(root, mk, false, mk ? receiptFrom(mk) : null);
    return true;
  }
  var t = 0, iv = setInterval(function () { if ((window.MoonPhase && window.qrcode && start()) || ++t > 80) clearInterval(iv); }, 100);
})();
