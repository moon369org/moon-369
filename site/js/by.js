/* moon369.org/by/<name>: everything a verified company has registered on Moon. */
(function () {
  var API = 'https://api.moon369.org';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var m = /^\/by\/([^/?#]+)/.exec(location.pathname), slug = m ? decodeURIComponent(m[1]) : (new URLSearchParams(location.search).get('name') || '');
  var shown = 0, next = null;

  function row(r) {
    return '<li><div class="by-when">' + esc(r.moonmark.slice(0, 19)) + '<span>' + esc(r.utc.replace('T', ' ').slice(0, 19)) + ' UTC</span></div>' +
      '<div class="by-what"><b>' + esc(r.label || 'Signed file') + '</b><span title="SHA-256">' + esc(r.sha256) + '</span></div>' +
      '<a class="by-proof" href="' + esc(r.signed_url) + '" target="_blank" rel="noopener">MOONMARK ↗</a></li>';
  }
  function load(before) {
    var url = API + '/v1/registrants/' + encodeURIComponent(slug) + (before ? '?before=' + before : '');
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var list = $('[data-by-list]'), empty = $('[data-by-empty]'), more = $('[data-by-more]');
      if (!before) {
        if (!j.verified) {
          $('[data-by-name]').textContent = slug.toUpperCase().replace(/-/g, ' ');
          $('[data-by-lede]').textContent = 'No verified company by this name has registered anything on Moon. Only names Moon has verified have a page.';
          empty.textContent = ''; $('[data-by-count]').textContent = '';
          return;
        }
        document.title = j.registrant + ' · Registered on Moon';
        $('[data-by-name]').textContent = j.registrant.toUpperCase();
        $('[data-by-badge]').removeAttribute('data-off');
      }
      list.insertAdjacentHTML('beforeend', j.results.map(row).join(''));
      shown += j.results.length; next = j.next_before || null;
      empty.textContent = shown ? '' : 'Nothing registered yet.';
      $('[data-by-count]').textContent = shown + (next ? '+' : '') + (shown === 1 ? ' registration' : ' registrations');
      if (next) more.removeAttribute('data-off'); else more.setAttribute('data-off', '');
    }).catch(function () { $('[data-by-empty]').textContent = 'Could not reach Moon. Try again.'; });
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-by-more]') && next) load(next); });

  (function boot(n) {
    var el = $('[data-by-list]'), snap = document.querySelector('[data-dc-snapshot]');
    if (!el || (snap && snap.contains(el))) { if (n < 200) setTimeout(function () { boot(n + 1); }, 25); return; }
    if (!slug) { $('[data-by-name]').textContent = 'REGISTERED ON MOON'; $('[data-by-empty]').textContent = 'Add a verified company name to the address, like moon369.org/by/moon.'; return; }
    load();
  })(0);
})();
