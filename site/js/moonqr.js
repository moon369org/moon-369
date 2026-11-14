/* Moon QR: an on-brand QR code for a Moonmark link.
   Round dots, eyes with a round moon at their center, and the moon phase of that
   moment in the middle. Error correction level H keeps it scannable with the moon
   covering the center. The square outer eye rings are kept on purpose: strict
   scanners need them to find the code. */
(function (root) {
  var INK = '#0B0B0D', PAPER = '#E9E4D8';

  function svg(url, f, opts) {
    opts = opts || {};
    var qrcode = opts.qrcode || root.qrcode, phase = opts.phase || root.MoonPhase;
    var q = qrcode(0, 'H'); q.addData(url); q.make();
    var n = q.getModuleCount(), quiet = 4, size = n + quiet * 2;
    var c = n / 2, clear = Math.max(3.5, n * 0.12);

    function inEye(r, col) {
      return (r < 8 && col < 8) || (r < 8 && col >= n - 8) || (r >= n - 8 && col < 8);
    }
    function inCenter(r, col) {
      var dx = col + 0.5 - c, dy = r + 0.5 - c;
      return dx * dx + dy * dy < clear * clear;
    }

    var d = '', rr = 0.48;
    for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) {
      if (!q.isDark(r, col) || inEye(r, col) || inCenter(r, col)) continue;
      var x = col + 0.5, y = r + 0.5;
      d += 'M' + (x - rr) + ',' + y + 'a' + rr + ',' + rr + ' 0 1,0 ' + (2 * rr) + ',0a' + rr + ',' + rr + ' 0 1,0 ' + (-2 * rr) + ',0';
    }

    var eyes = '';
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (p) {
      eyes += '<rect x="' + (p[0] + 0.5) + '" y="' + (p[1] + 0.5) + '" width="6" height="6" fill="none" stroke="' + INK + '" stroke-width="1"/>' +
              '<circle cx="' + (p[0] + 3.5) + '" cy="' + (p[1] + 3.5) + '" r="1.5" fill="' + INK + '"/>';
    });

    var mr = clear - 1, lit = phase ? phase.path(f || 0, mr) : '';
    var moon = '<g transform="translate(' + c + ',' + c + ')">' +
      '<circle r="' + mr + '" fill="' + INK + '"/>' +
      (lit ? '<path d="' + lit + '" fill="' + PAPER + '"/>' : '') +
      '<circle r="' + mr + '" fill="none" stroke="' + INK + '" stroke-width="0.35"/>' +
      '</g>';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-quiet) + ' ' + (-quiet) + ' ' + size + ' ' + size + '" shape-rendering="geometricPrecision" role="img" aria-label="QR code for this Moonmark">' +
      '<rect x="' + (-quiet) + '" y="' + (-quiet) + '" width="' + size + '" height="' + size + '" fill="' + PAPER + '"/>' +
      '<path d="' + d + '" fill="' + INK + '"/>' + eyes + moon + '</svg>';
  }

  var api = { svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonQR = api;
})(typeof window !== 'undefined' ? window : globalThis);
