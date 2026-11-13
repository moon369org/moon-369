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

  function render(root, mk, fresh) {
    var ms = toMs(mk);
    var url = 'https://moon369.org/m/' + path(mk);
    var f = window.MoonPhase ? window.MoonPhase.fraction(ms) : 0;
    var il = window.MoonPhase ? Math.round(window.MoonPhase.illumination(ms) * 100) : 0;
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
      var q = window.qrcode(0, 'M'); q.addData(url); q.make();
      qr = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }).replace(/fill="white"/g, 'fill="#E9E4D8"').replace(/fill="black"/g, 'fill="#0B0B0D"');
    } catch (e) {}
    var ph = window.MoonPhase ? window.MoonPhase.path(f, 10) : '';
    root.innerHTML =
      '<div class="mk-grid">' +
      '<div class="mk-main">' +
      '<div class="mk-l">' + (fresh ? 'MOONMARK · JUST MARKED' : 'MOONMARK') + '</div>' +
      '<div class="mk-date"><svg viewBox="-11 -11 22 22" class="mk-ph" aria-label="' + nm + '"><circle r="10" fill="#24262A"/><path d="' + ph + '" fill="#E9E4D8"/></svg><span>YEAR ' + mk.y + ' · MOON ' + p(mk.m) + ' · LUNE ' + p(mk.d) + '</span></div>' +
      '<div class="mk-mark">' + text(mk) + '<span>' + nsGroups(mk.ns) + '</span></div>' +
      '<div class="mk-rows">' +
      '<div><span>YOUR LOCAL CLOCK</span><b>' + local + ' ' + abbr + '</b></div>' +
      '<div><span>THE MOON THAT NIGHT</span><b>' + nm + ' · ' + il + '% lit</b></div>' +
      '<div><span>UTC</span><b>' + new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + '</b></div>' +
      '</div>' +
      '<div class="mk-btns"><button type="button" data-mk-copy>COPY LINK</button><button type="button" data-mk-now class="mk-p">MARK THIS MOMENT</button></div>' +
      '</div>' +
      '<div class="mk-side"><div class="mk-qr">' + qr + '</div><div class="mk-cap">Scan to open this Moonmark in your own local time.</div>' +
      '<div class="mk-note">This Moonmark is unsigned. A signed Moonmark from Moon proves when something happened.</div></div>' +
      '</div>';
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
    render(root, mk, false);
    return true;
  }
  var t = 0, iv = setInterval(function () { if ((window.MoonPhase && window.qrcode && start()) || ++t > 80) clearInterval(iv); }, 100);
})();
