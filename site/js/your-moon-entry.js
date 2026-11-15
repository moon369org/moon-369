/* The Your Moon form on the homepage: pick an occasion, a date and optionally a place, land on that moon at /night. */
(function () {
  var occasion = 'born', where = null;
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  function zOf(tz, y, mo, d, h, mi) {   // the UTC offset on that date: the place's time zone, else this device's
    if (tz && window.MoonPlaces) { try { return MoonPlaces.zIn(tz, y, mo, d, h, mi); } catch (e) {} }
    var dt = new Date(2000, mo - 1, d, h == null ? 12 : h, mi || 0); dt.setFullYear(y);
    return -dt.getTimezoneOffset();
  }
  function fmtZ(z) { var a = Math.abs(z); return (z < 0 ? '-' : '+') + p2(Math.floor(a / 60)) + p2(a % 60); }
  function readDate(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.querySelector('input[name=d]').value);
    if (!m) return null;
    var t = /^(\d{2}):(\d{2})/.exec(f.querySelector('input[name=t]').value);
    return { y: +m[1], mo: +m[2], d: +m[3], h: t ? +t[1] : null, mi: t ? +t[2] : 0, iso: m[0], t: t };
  }

  // The form is drawn after load; bind the place field once it is there.
  (function boot(n) {
    var f = document.querySelector('[data-ym-form]'), snap = document.querySelector('[data-dc-snapshot]');
    if (!f || !window.MoonPlaces || (snap && snap.contains(f))) { if (n < 200) setTimeout(function () { boot(n + 1); }, 25); return; }
    var field = f.querySelector('[data-ym-where]');
    if (field) where = MoonPlaces.bind(field, function () { return readDate(f); });
    f.addEventListener('input', function (e) { if (where && e.target.matches('input[name=d],input[name=t]')) where.refresh(); });
  })(0);

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
    var err = f.querySelector('[data-ym-err]'), d = readDate(f);
    if (!d) { err.textContent = 'Pick a date first.'; f.querySelector('input[name=d]').focus(); return; }
    if (d.y < 1000 || d.y > 2999) { err.textContent = 'Pick a date between the years 1000 and 2999.'; return; }
    (where ? where.resolve() : Promise.resolve(null)).then(function (place) {
      var typed = f.querySelector('input[name=where]');
      if (typed && typed.value.trim() && !place) { err.textContent = 'Pick a place from the list, or leave it empty to use your time zone.'; typed.focus(); return; }
      var z = zOf(place ? place.tz : (window.MoonPlaces && MoonPlaces.myTz), d.y, d.mo, d.d, d.h, d.mi);
      location.href = '/night/' + d.iso + '?' + (d.t ? 't=' + d.t[1] + d.t[2] + '&' : '') + 'z=' + encodeURIComponent(fmtZ(z)) + '&for=' + occasion + (place ? '&in=' + place.slug : '');
    });
  });
})();
