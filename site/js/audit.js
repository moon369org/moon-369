// The keys Moon publishes right now, straight from /v1/keys.
(function () {
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var html = null;
  // The page re-renders once its scripts load, so keep the table in whichever element is current.
  setInterval(function () { var el = document.querySelector('[data-au-keys]'); if (html && el && !el.hasAttribute('data-done')) { el.innerHTML = html; el.setAttribute('data-done', ''); } }, 400);
  function go() {
    var el = { set innerHTML(v) { html = v; } };
    fetch('https://api.moon369.org/v1/keys').then(function (r) { return r.json(); }).then(function (k) {
      var rows = (k.keys || []).map(function (x) {
        return '<tr><td><b>' + esc(x.key_id) + '</b></td><td>' + esc(x.alg) + '</td><td>' + esc(x.status) + '</td><td><span class="au-fp">' + esc(x.public_key.length > 80 ? x.public_key.slice(0, 40) + '…' + x.public_key.slice(-16) : x.public_key) + '</span></td></tr>';
      }).join('');
      el.innerHTML = '<table class="au-tbl au-keys"><tr><th>KEY ID</th><th>ALGORITHM</th><th>STATUS</th><th>PUBLIC KEY</th></tr>' + rows + '</table><p class="wg-note" style="margin-top:10px">Full keys: <a href="https://api.moon369.org/v1/keys" style="color:#E9E4D8">api.moon369.org/v1/keys</a>. Timestamp certificates: <a href="https://api.moon369.org/v1/tsa" style="color:#E9E4D8">api.moon369.org/v1/tsa</a>.</p>';
    }).catch(function () { el.innerHTML = '<p class="wg-note">Could not reach Moon. The keys are at api.moon369.org/v1/keys.</p>'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
