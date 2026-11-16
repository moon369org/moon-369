/* Moon countdown: embed a live event countdown on any page.

   <div data-moon-countdown="1928.05.24-17.31.02.640327453" data-name="Moon launch party"></div>
   <script src="https://moon369.org/embed/countdown.js" async></script>

   Options on the div: data-theme="light" (default dark), data-compact (no local time line).
   Shows the event name, a live countdown and the time in the viewer's own time zone, and links
   to the event page (calendar buttons, QR code). No cookies, no tracking, no network calls. MIT. */
(function () {
  if (window.MoonCountdown) { window.MoonCountdown.scan(); return; }
  var EPOCH = -62165308562978.61, K = 1.0403730490216803, SEC = 1000 * K;
  var firstDay = function (m) { return Math.ceil(m * 369 / 13); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  function toMs(mark) {
    var u = /^(-?\d+)\.(\d{1,2})\.(\d{1,2})[- T](\d{1,2})[.:](\d{2})(?:[.:](\d{2})(?:\.(\d{1,9}))?)?$/.exec(String(mark || '').trim());
    if (!u) return null;
    var y = +u[1], m = +u[2], d = +u[3], h = +u[4], mi = +u[5], s = +(u[6] || 0), ns = u[7] ? +u[7].padEnd(9, '0') : 0;
    if (m < 1 || m > 13 || d < 1 || d > firstDay(m) - firstDay(m - 1) || h > 23 || mi > 59 || s > 59) return null;
    var days = y * 369 + firstDay(m - 1) + d - 1;
    return Math.round((EPOCH + (days * 86400 + h * 3600 + mi * 60 + s + ns / 1e9) * SEC) / 1000) * 1000;
  }
  var CSS = ':host{all:initial;display:block;max-width:560px}' +
    '.c{box-sizing:border-box;border:1px solid var(--line);background:var(--bg);color:var(--fg);padding:20px 22px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;gap:14px}' +
    '.k{font:500 10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.24em;color:var(--dim)}' +
    '.n{font-weight:600;font-size:20px;line-height:1.25;overflow-wrap:anywhere}' +
    '.g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line)}' +
    '.g div{display:flex;flex-direction:column;gap:6px;padding:12px 12px 10px;border-left:1px solid var(--line)}.g div:first-child{border-left:0}' +
    '.g b{font:400 clamp(22px,6vw,34px)/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}' +
    '.g i{font:normal 500 9px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.2em;color:var(--dim)}' +
    '.t{font:400 13px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
    '.f{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--dim)}' +
    '.f a{color:var(--fg);text-decoration:underline;text-underline-offset:3px;min-height:24px;display:inline-flex;align-items:center}' +
    '.dark{--bg:#0B0B0D;--fg:#E9E4D8;--dim:#8A8B8F;--line:#2A2C30}.light{--bg:#FFFFFF;--fg:#141415;--dim:#5E6064;--line:#D9D6CF}';
  function span(ms) {
    var t = Math.abs(ms);
    return [[String(Math.floor(t / 864e5)), 'DAYS'], [p2(Math.floor(t % 864e5 / 36e5)), 'HRS'], [p2(Math.floor(t % 36e5 / 6e4)), 'MIN'], [p2(Math.floor(t % 6e4 / 1e3)), 'SEC']];
  }
  function local(ms) {
    try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(ms); }
    catch (e) { return new Date(ms).toString(); }
  }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var live = [];
  function mount(el) {
    if (el.__moon) return; el.__moon = 1;
    var mark = el.getAttribute('data-moon-countdown'), ms = toMs(mark);
    var name = String(el.getAttribute('data-name') || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    var root = el.attachShadow ? el.attachShadow({ mode: 'open' }) : el;
    if (ms === null) { root.innerHTML = '<style>' + CSS + '</style><div class="c dark"><div class="k">NOT A VALID MOONMARK</div></div>'; return; }
    var url = 'https://moon369.org/m/' + encodeURIComponent(mark).replace(/%2E/g, '.') + (name ? '?e=' + encodeURIComponent(name).replace(/%20/g, '+') : '');
    var theme = el.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    root.innerHTML = '<style>' + CSS + '</style><div class="c ' + theme + '" role="timer" aria-live="off">' +
      '<div class="k" data-l>STARTS IN</div>' + (name ? '<div class="n">' + esc(name) + '</div>' : '') +
      '<div class="g" data-g></div>' +
      (el.hasAttribute('data-compact') ? '' : '<div class="t">' + esc(local(ms)) + '</div>') +
      '<div class="f"><a href="' + url + '" target="_blank" rel="noopener">Add to calendar</a><span>Moonmark ' + esc(mark.split('-')[0]) + ' \u00B7 moon369.org</span></div></div>';
    live.push({ root: root, ms: ms });
    tick();
  }
  function tick() {
    var now = Date.now();
    live.forEach(function (x) {
      var left = x.ms - now, past = left <= 0;
      x.root.querySelector('[data-l]').textContent = past ? (left > -36e5 ? 'HAPPENING NOW \u00B7 STARTED' : 'STARTED') : 'STARTS IN';
      x.root.querySelector('[data-g]').innerHTML = span(left).map(function (c) { return '<div><b>' + c[0] + '</b><i>' + c[1] + (past && c[1] === 'SEC' ? ' AGO' : '') + '</i></div>'; }).join('');
    });
  }
  function scan() { Array.prototype.forEach.call(document.querySelectorAll('[data-moon-countdown]'), mount); }
  window.MoonCountdown = { scan: scan, toMs: toMs };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  // Pages that render later (frameworks, the Moon site itself): mount countdowns as they appear.
  if (window.MutationObserver) { var due = 0; new MutationObserver(function () { if (!due) due = setTimeout(function () { due = 0; scan(); }, 50); }).observe(document.documentElement, { childList: true, subtree: true }); }
  // Drop countdowns that left the page.
  setInterval(function () { live = live.filter(function (x) { var h = x.root.host || x.root; return h.isConnected; }); }, 5000);
  setInterval(tick, 1000);
})();
