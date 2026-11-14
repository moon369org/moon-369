/* Live Moonmark links: when one is clicked, it captures the exact moment of the
   click, down to the nanosecond digits, instead of the second shown on screen. */
(function () {
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803;
  var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
  var firstDay = function (m) { return Math.ceil(m * 369 / 13); };
  function nowMs() { return (performance.timeOrigin || Date.now() - performance.now()) + performance.now(); }
  function markPath(ms) {
    var s = (ms - EPOCH) / SEC, whole = Math.floor(s), ns = Math.min(999999999, Math.floor((s - whole) * 1e9));
    var da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - firstDay(mi) + 1, sd = whole - da * 86400;
    return y + '.' + p(mi + 1) + '.' + p(d) + '-' + p(Math.floor(sd / 3600)) + '.' + p(Math.floor(sd % 3600 / 60)) + '.' + p(sd % 60) + '.' + p(ns, 9);
  }
  function stamp(e) {
    var a = e.target && e.target.closest && e.target.closest('a[data-live-mark]');
    if (a) a.setAttribute('href', '/m/' + markPath(nowMs()));
  }
  ['pointerdown', 'click', 'contextmenu', 'keydown'].forEach(function (t) { document.addEventListener(t, stamp, true); });
})();
