/* /trust: is Moon still locked to the real Moon? Two charts from /v1/drift.
   1. Every new moon from 1900 to 2100: how far the real one fell from Moon's grid. It wobbles; the average holds.
   2. That average, century by century, 2000 BCE to 3000 CE, inside the band of the wobble. */
(function () {
  var API = 'https://api.moon369.org', NS = 'http://www.w3.org/2000/svg';
  var C = { fg: '#E9E4D8', dim: '#8A8B8F', line: '#24262A', faint: '#1C1D20' };
  var $ = function (s) { return document.querySelector(s); };
  var fmt = function (h) { return (h < 0 ? '−' : '+') + Math.abs(h).toFixed(1) + ' h'; };
  function el(name, attrs, text) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (name === 'text') { e.setAttribute('paint-order', 'stroke'); e.setAttribute('stroke', '#0B0B0D'); e.setAttribute('stroke-width', 5); e.setAttribute('stroke-linejoin', 'round'); } if (text != null) e.textContent = text; return e; }
  function svg(w, h, label) { var s = el('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': label, style: 'width:100%;height:auto;display:block' }); return s; }
  var MONO = "'JetBrains Mono', monospace";

  function axes(s, o) {
    // horizontal grid + hour labels
    for (var v = o.yMin; v <= o.yMax; v += o.yStep) {
      var y = o.Y(v);
      s.appendChild(el('line', { x1: o.L, x2: o.R, y1: y, y2: y, stroke: v === 0 ? C.dim : C.faint, 'stroke-width': 1, 'stroke-dasharray': v === 0 ? '4 4' : '' }));
      s.appendChild(el('text', { x: o.L - 10, y: y + 4, 'text-anchor': 'end', fill: C.dim, 'font-family': MONO, 'font-size': 12 }, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' h'));
    }
    o.xTicks.forEach(function (t) {
      var x = o.X(t);
      s.appendChild(el('line', { x1: x, x2: x, y1: o.B, y2: o.B + 6, stroke: C.dim }));
      s.appendChild(el('text', { x: x, y: o.B + 22, 'text-anchor': 'middle', fill: C.dim, 'font-family': MONO, 'font-size': 12 }, t < 0 ? (-t) + ' BCE' : String(t)));
    });
  }

  function wobble(box, d) {
    var W = 1000, H = 360, o = { L: 64, R: 980, T: 24, B: 316, yMin: -24, yMax: 12, yStep: 6 };
    var y0 = d.range.from_year, y1 = d.range.to_year;
    var yr = function (iso) { var t = Date.parse(iso); return 1970 + t / (365.2425 * 86400000); };
    o.X = function (y) { return o.L + (y - y0) / (y1 - y0) * (o.R - o.L); };
    o.Y = function (h) { return o.T + (o.yMax - h) / (o.yMax - o.yMin) * (o.B - o.T); };
    o.xTicks = []; for (var t = Math.ceil(y0 / 25) * 25; t <= y1; t += 25) o.xTicks.push(t);
    var s = svg(W, H, 'Gap between each real new moon and Moon\'s grid, ' + y0 + ' to ' + y1);
    axes(s, o);
    var sum = 0;
    d.lunations.forEach(function (l) { sum += l.gap_h; s.appendChild(el('circle', { cx: o.X(yr(l.utc)).toFixed(1), cy: o.Y(l.gap_h).toFixed(1), r: 1.7, fill: C.fg, 'fill-opacity': 0.45 })); });
    var mean = sum / d.lunations.length, my = o.Y(mean);
    s.appendChild(el('line', { x1: o.L, x2: o.R, y1: my, y2: my, stroke: C.fg, 'stroke-width': 2 }));
    s.appendChild(el('text', { x: o.R, y: my - 10, 'text-anchor': 'end', fill: C.fg, 'font-family': MONO, 'font-size': 13 }, 'AVERAGE ' + fmt(mean) + ', FLAT'));
    s.appendChild(el('text', { x: o.L + 8, y: o.Y(0) - 8, fill: C.dim, 'font-family': MONO, 'font-size': 12 }, 'MOON\'S GRID'));
    box.innerHTML = ''; box.appendChild(s);
    return mean;
  }

  function centuries(box, d) {
    var W = 1000, H = 340, o = { L: 64, R: 980, T: 24, B: 296, yMin: -30, yMax: 12, yStep: 6 };
    var c = d.centuries, y0 = c[0].from_year, y1 = c[c.length - 1].from_year + 100;
    o.X = function (y) { return o.L + (y - y0) / (y1 - y0) * (o.R - o.L); };
    o.Y = function (h) { return o.T + (o.yMax - h) / (o.yMax - o.yMin) * (o.B - o.T); };
    o.xTicks = [-2000, -1000, 0, 1000, 2000, 3000];
    var s = svg(W, H, 'Average gap per century from 2000 BCE to 3000 CE, inside the range of the wobble');
    axes(s, o);
    var mid = function (x) { return x.from_year + 50; };
    var band = c.map(function (x) { return o.X(mid(x)).toFixed(1) + ',' + o.Y(x.max_gap_h).toFixed(1); }).concat(c.slice().reverse().map(function (x) { return o.X(mid(x)).toFixed(1) + ',' + o.Y(x.min_gap_h).toFixed(1); }));
    s.appendChild(el('polygon', { points: band.join(' '), fill: C.fg, 'fill-opacity': 0.08 }));
    s.appendChild(el('polyline', { points: c.map(function (x) { return o.X(mid(x)).toFixed(1) + ',' + o.Y(x.mean_gap_h).toFixed(1); }).join(' '), fill: 'none', stroke: C.fg, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    s.appendChild(el('text', { x: o.X(2400), y: o.Y(11) + 4, 'text-anchor': 'middle', fill: C.dim, 'font-family': MONO, 'font-size': 12 }, 'RANGE OF THE WOBBLE'));
    var mod = c.filter(function (x) { return x.from_year >= 1000 && x.from_year < 2200; });
    var mm = mod.map(function (x) { return x.mean_gap_h; }), lo = Math.min.apply(null, mm), hi = Math.max.apply(null, mm);
    s.appendChild(el('text', { x: o.X(1600), y: o.Y(hi) - 14, 'text-anchor': 'middle', fill: C.fg, 'font-family': MONO, 'font-size': 13 }, '1000 to 2200: WITHIN ' + Math.max(0.1, (hi - lo) / 2).toFixed(1) + ' H'));
    box.innerHTML = ''; box.appendChild(s);
    var all = c.map(function (x) { return x.mean_gap_h; });
    return { modern: (hi - lo), total: Math.max.apply(null, all) - Math.min.apply(null, all), first: c[0].mean_gap_h };
  }

  function load() {
    Promise.all([fetch(API + '/v1/drift?from=1900&to=2100').then(function (r) { return r.json(); })]).then(function (a) {
      var d = a[0], mean = wobble($('[data-drift-wobble]'), d), st = centuries($('[data-drift-centuries]'), d);
      var n = $('[data-drift-note]');
      if (n) n.textContent = 'Every new moon from 1900 to 2100 (' + d.lunations.length.toLocaleString('en-US') + ' of them) lands within a day of Moon\'s grid, and the average sits at ' + fmt(mean) + ': Moon\'s grid starts on the real new moon of 6 January 2000, which came about 4 hours after an average one. From 1000 to 2200 that average moves less than ' + Math.max(0.1, st.modern).toFixed(1) + ' hours. Over 5,000 years it moves ' + st.total.toFixed(1) + ' hours, mostly because Earth\'s spin is slowing, still less than the Moon\'s own monthly swing.';
    }).catch(function () { ['[data-drift-wobble]', '[data-drift-centuries]'].forEach(function (s) { var b = $(s); if (b) b.innerHTML = '<p style="color:#8A8B8F;font-size:14px;margin:0">Could not reach Moon.</p>'; }); });
  }
  (function boot(n) {
    var el2 = $('[data-drift-wobble]'), snap = document.querySelector('[data-dc-snapshot]');
    if (!el2 || (snap && snap.contains(el2))) { if (n < 200) setTimeout(function () { boot(n + 1); }, 25); return; }
    load();
  })(0);
})();
