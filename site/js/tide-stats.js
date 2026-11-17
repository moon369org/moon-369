// Public numbers for the Tideline: receipts signed per lune, totals, tides sealed, Bitcoin proofs. Counts only.
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  function n(x) { return Number(x || 0).toLocaleString('en-US'); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function draw(el, s) {
    var h = (s.history || []).slice(-30), max = Math.max(1, Math.max.apply(null, h.map(function (x) { return x.receipts; })));
    var bars = h.map(function (x, i) { return '<i' + (i === h.length - 1 ? ' class="now"' : '') + ' style="height:' + Math.max(1, Math.round(x.receipts / max * 100)) + '%" title="' + esc(x.lune + ': ' + n(x.receipts) + ' receipts') + '"></i>'; }).join('');
    var btc = s.bitcoin || {};
    el.innerHTML = '<div class="tl-st-top"><span class="tl-st-k">BY THE NUMBERS</span><span class="tl-st-k"><a href="' + API + '/v1/stats">/v1/stats</a> · <a href="/audit">AUDIT IT YOURSELF</a></span></div>' +
      '<div class="tl-st-ns">' +
      '<div class="tl-st-n"><b>' + n(s.this_lune) + '</b><span>SIGNED THIS LUNE</span></div>' +
      '<div class="tl-st-n"><b>' + n(s.last_lune) + '</b><span>LAST LUNE</span></div>' +
      '<div class="tl-st-n"><b>' + n(s.total_receipts) + '</b><span>SIGNED IN ALL</span></div>' +
      '<div class="tl-st-n"><b>' + n(s.tides_sealed) + '</b><span>TIDES SEALED' + (btc.confirmed ? ' · ' + n(btc.confirmed) + ' IN BITCOIN' : '') + '</span></div>' +
      '</div>' +
      (h.length > 1 ? '<div class="tl-st-ch" role="img" aria-label="Receipts signed per lune, last ' + h.length + ' lunes">' + bars + '</div><div class="tl-st-ax"><span>' + esc(h[0].lune) + '</span><span>RECEIPTS PER LUNE</span><span>' + esc(h[h.length - 1].lune) + ' · NOW</span></div>' : '');
  }
  function go() {
    var el = document.querySelector('[data-tl-stats]');
    if (!el) return setTimeout(go, 300);
    if (/[?&]preview/.test(location.search)) return;
    fetch(API + '/v1/stats').then(function (r) { return r.ok ? r.json() : null; }).then(function (s) { if (s) draw(el, s); }).catch(function () {});
    setTimeout(go, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
