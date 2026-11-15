/* The Your Moon form on the homepage: pick an occasion and a date, land on that moon at /night. */
(function () {
  var occasion = 'born';
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  function zOf(y, mo, d, h, mi) {   // the visitor's UTC offset on that date, in minutes
    var dt = new Date(2000, mo - 1, d, h == null ? 12 : h, mi || 0); dt.setFullYear(y);
    return -dt.getTimezoneOffset();
  }
  function fmtZ(z) { var a = Math.abs(z); return (z < 0 ? '-' : '+') + p2(Math.floor(a / 60)) + p2(a % 60); }

  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('.ym-chip');
    if (!c) return;
    occasion = c.getAttribute('data-for');
    document.querySelectorAll('.ym-chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b === c)); });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.matches || !f.matches('[data-ym-form]')) return;
    e.preventDefault();
    var err = f.querySelector('[data-ym-err]'), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.querySelector('input[name=d]').value);
    if (!m) { err.textContent = 'Pick a date first.'; f.querySelector('input[name=d]').focus(); return; }
    if (+m[1] < 1000 || +m[1] > 2999) { err.textContent = 'Pick a date between the years 1000 and 2999.'; return; }
    var t = /^(\d{2}):(\d{2})/.exec(f.querySelector('input[name=t]').value), h = t ? +t[1] : null, mi = t ? +t[2] : 0;
    var z = zOf(+m[1], +m[2], +m[3], h, mi);
    location.href = '/night/' + m[0] + '?' + (t ? 't=' + t[1] + t[2] + '&' : '') + 'z=' + encodeURIComponent(fmtZ(z)) + '&for=' + occasion;
  });
})();
