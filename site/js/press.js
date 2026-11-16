/* The press page: Moon's own brand registry.
   Reads the signed manifest, lists every brand file with its fingerprint and a live <moon-badge>,
   and fills the "signed at" numbers from the manifest's own registration on Moon. */
(function () {
  var API = 'https://api.moon369.org', BASE = 'assets/brand/';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function sha256(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); });
  }
  function thumb(f) {
    var file = f.file, img = /\.(svg|png|jpg)$/.test(file);
    if (!img) return '<div class="pr-th"><span>' + esc(file.split('.').pop().toUpperCase()) + '</span></div>';
    var light = /black(?!-on-cream)|badge-light/.test(file);   // dark artwork on a transparent ground needs a light tile
    return '<div class="pr-th' + (light ? ' lt' : '') + '"><img src="' + BASE + esc(file) + '" alt="" loading="lazy" decoding="async"></div>';
  }
  function row(f) {
    return '<div class="pr-row" id="file-' + esc(f.file.replace(/[^a-z0-9]+/gi, '-')) + '">' + thumb(f) +
      '<div class="pr-nm"><b>' + esc(f.file) + '</b><span>' + esc(f.what) + ' · ' + (f.bytes < 1024 ? f.bytes + ' B' : Math.round(f.bytes / 1024) + ' KB') + (f.phash ? ' · look-alike hash ' + esc(f.phash) : '') + '</span></div>' +
      '<button type="button" class="pr-sha" data-sha="' + f.sha256 + '" title="Copy the SHA-256" aria-label="Copy the SHA-256 of ' + esc(f.file) + '">' + f.sha256 + '</button>' +
      '<moon-badge sha256="' + f.sha256 + '" show-missing></moon-badge>' +
      '<a class="pr-dl" href="' + BASE + esc(f.file) + '" download>GET ↓</a></div>';
  }

  function stats(manifestSha, count) {
    $('[data-pr-count]').textContent = count;
    fetch(API + '/v1/lookup/' + manifestSha).then(function (r) { return r.json(); }).then(function (j) {
      var mine = j.registered && (j.registrations || []).filter(function (r) { return r.registrant_verified; })[0];
      if (!mine) { $('[data-pr-when]').textContent = 'Signing soon'; return; }
      $('[data-pr-who]').innerHTML = esc(mine.registrant.toUpperCase()) + ' <span style="font-family:JetBrains Mono,monospace;font-weight:500;font-size:12px;letter-spacing:.2em;color:#7FBF8E;vertical-align:middle">VERIFIED</span>';
      var w = $('[data-pr-when]'); w.textContent = mine.moonmark;
      w.title = mine.utc;
    }).catch(function () { $('[data-pr-when]').textContent = 'Could not reach Moon'; });
  }

  function load() {
    var box = $('[data-pr-reg]');
    fetch(BASE + 'moon-brand-manifest.json', { cache: 'no-cache' }).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var m = JSON.parse(new TextDecoder().decode(buf));
      box.innerHTML = m.files.map(row).join('');
      return sha256(buf).then(function (h) { stats(h, m.files.length); });
    }).catch(function () { box.innerHTML = '<div class="pr-reg-empty">Could not load the registry. <a href="' + BASE + 'moon-brand-manifest.json" style="color:#E9E4D8">Open the manifest</a>.</div>'; });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pr-sha'); if (!b) return;
    var sha = b.getAttribute('data-sha');
    (navigator.clipboard ? navigator.clipboard.writeText(sha) : Promise.reject()).then(function () {
      var t = b.textContent; b.textContent = 'COPIED'; setTimeout(function () { b.textContent = t; }, 1200);
    }, function () { window.prompt('SHA-256', sha); });
  });

  // The page is drawn after load; wait for the live registry box, not the snapshot.
  (function boot(n) {
    var el = $('[data-pr-reg]'), snap = document.querySelector('[data-dc-snapshot]');
    if (!el || (snap && snap.contains(el))) { if (n < 200) setTimeout(function () { boot(n + 1); }, 25); return; }
    load();
  })(0);
})();
