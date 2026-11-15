/* The API page: get a free key, and "Try it" on the examples.
   Try it runs an example's curl command in the browser and shows the live answer in its RESPONSE box.
   Only read-only calls get the button: anything that signs, logs or creates something stays an example,
   so trying the docs never writes a real registration. */
(function () {
  var API = 'https://api.moon369.org';
  var WRITES = /\/v1\/(sign|sign\/batch|evidence|tsa|api-keys)(\?|$)/;
  var myKey = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (x) { return String(x).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
  var track = function (n, d) { if (window.moonTrack) window.moonTrack(n, d || {}); };

  // ---------- curl, parsed just enough for our own examples ----------
  function words(cmd) {
    cmd = cmd.replace(/\\\r?\n[ \t]*/g, function (m, i) { return /["'][^"'\s]*$/.test(cmd.slice(0, i)) ? '' : ' '; });
    var out = [], cur = '', q = null, has = false;
    for (var i = 0; i < cmd.length; i++) {
      var c = cmd[i];
      if (q) { if (c === q) q = null; else cur += c; continue; }
      if (c === "'" || c === '"') { q = c; has = true; continue; }
      if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
      cur += c;
    }
    if (cur || has) out.push(cur);
    return out;
  }
  function parse(text) {
    var w = words(text.trim());
    if (w[0] !== 'curl') return null;
    var r = { method: 'GET', headers: {}, url: null, body: null };
    for (var i = 1; i < w.length; i++) {
      var a = w[i];
      if (a === '-X' || a === '--request') r.method = w[++i];
      else if (a === '-H' || a === '--header') { var h = w[++i], k = h.indexOf(':'); if (k > 0) r.headers[h.slice(0, k).trim()] = h.slice(k + 1).trim(); }
      else if (a === '-d' || a === '--data' || a === '--data-raw') { r.body = w[++i]; if (r.body[0] === '@') return null; if (r.method === 'GET') r.method = 'POST'; }
      else if (/^https?:\/\//.test(a)) r.url = a;
      else if (a[0] === '-') { if (/^-(o|u|A|e|F|-data-binary|-output)$/.test(a)) return null; }
    }
    return r.url && r.url.indexOf(API) === 0 ? r : null;
  }
  function runnable(r, text) {
    if (!r || WRITES.test(r.url.replace(API, ''))) return false;
    if (/…|\.\.\.|<[^>]+>/.test(text)) return false;                 // a placeholder, not a real call
    if (/\$MOON_KEY/.test(text) && !myKey) return false;
    if (/\$[A-Z_]/.test(text.replace(/\$MOON_KEY/g, ''))) return false;
    return true;
  }

  function setUp() {
    Array.prototype.forEach.call(document.querySelectorAll('pre'), function (pre) {
      var box = pre.parentElement, head = box && box.firstElementChild;
      if (!head || pre.__try || !/^REQUEST/.test((head.textContent || '').trim())) return;
      var r = parse(pre.textContent);
      if (!runnable(r, pre.textContent)) return;
      var resBox = box.nextElementSibling, resPre = resBox && resBox.querySelector('pre'), resHead = resBox && resBox.firstElementChild;
      if (!resPre) return;
      pre.__try = true;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'at-btn'; btn.textContent = 'TRY IT';
      btn.setAttribute('aria-label', 'Run this request live');
      var slot = head.children.length > 1 ? head.lastElementChild : head.appendChild(document.createElement('span'));
      slot.textContent = ''; slot.appendChild(btn);
      btn.addEventListener('click', function () { run(r, pre.textContent, btn, resPre, resHead); });
    });
  }

  function run(r, text, btn, resPre, resHead) {
    var headers = {};
    Object.keys(r.headers).forEach(function (k) { headers[k] = r.headers[k].replace('$MOON_KEY', myKey || ''); });
    btn.setAttribute('aria-busy', 'true'); btn.textContent = 'RUNNING…';
    var label = resHead && resHead.lastElementChild, old = resBox(resPre).querySelector('.at-img');
    if (old) old.remove();
    track('API tried', { path: r.url.replace(API, '').split('?')[0].replace(/\/[0-9a-f]{64}$|\/-?\d{4}-\d{2}-\d{2}$/, '/{param}') });
    fetch(r.url, { method: r.method, headers: headers, body: r.body || undefined }).then(function (res) {
      var ct = res.headers.get('content-type') || '';
      if (label) { label.textContent = 'LIVE · ' + res.status + (res.ok ? ' OK' : ''); label.className = res.ok ? 'at-live' : 'at-err'; }
      if (/^image\//.test(ct)) {
        return res.blob().then(function (b) {
          resPre.textContent = ct + ' · ' + Math.round(b.size / 1024) + ' KB';
          var img = document.createElement('img'); img.className = 'at-img'; img.alt = 'The image this request returns'; img.src = URL.createObjectURL(b);
          resPre.after(img);
        });
      }
      return res.text().then(function (t) {
        try { t = JSON.stringify(JSON.parse(t), null, 2); } catch (e) {}
        if (t.length > 8000) t = t.slice(0, 8000) + '\n…';
        resPre.textContent = t;
      });
    }).catch(function () {
      if (label) { label.textContent = 'COULD NOT REACH THE API'; label.className = 'at-err'; }
    }).then(function () { btn.removeAttribute('aria-busy'); btn.textContent = 'TRY AGAIN'; });
  }
  function resBox(pre) { return pre.parentElement; }

  // ---------- get a free key ----------
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.matches || !f.matches('[data-ak-form]')) return;
    e.preventDefault();
    var msg = $('[data-ak-msg]', f), go = $('.ak-go', f);
    var body = { name: f.name.value.trim(), email: f.email.value.trim(), use: f.use.value.trim() };
    if (body.name.length < 2) { msg.textContent = 'Add who the key is for: your name, app or company.'; f.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) { msg.textContent = 'Add a working email, so we can reach you about your key.'; f.email.focus(); return; }
    msg.textContent = ''; go.setAttribute('aria-busy', 'true'); go.textContent = 'MAKING YOUR KEY…';
    fetch(API + '/v1/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status); return j; }); })
      .then(function (j) {
        myKey = j.key;
        track('API key created', {});
        $('[data-ak-key]').textContent = j.key;
        $('[data-ak-example]').textContent = 'curl https://api.moon369.org/v1/me \\\n  -H "Authorization: Bearer ' + j.key + '"\n\n# ' + j.per_min + ' requests a minute · ' + j.signing_per_day + ' signatures a day · batch signing on';
        f.setAttribute('data-off', ''); $('[data-ak-out]').removeAttribute('data-off');
        setUp();   // examples that need a key can run now
      })
      .catch(function (err) { msg.textContent = err.message; })
      .then(function () { go.removeAttribute('aria-busy'); go.textContent = 'GET MY KEY'; });
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-ak-copy]'); if (!b || !myKey) return;
    (navigator.clipboard ? navigator.clipboard.writeText(myKey) : Promise.reject()).then(function () { b.textContent = 'COPIED'; setTimeout(function () { b.textContent = 'COPY'; }, 1600); }, function () { window.prompt('Copy your key', myKey); });
  });

  // The page is drawn after load; add the buttons once the examples are there.
  (function boot(n) {
    var snap = document.querySelector('[data-dc-snapshot]');
    if (!document.querySelector('#endpoints') || (snap && snap.contains(document.querySelector('#endpoints')))) { if (n < 200) setTimeout(function () { boot(n + 1); }, 25); return; }
    setUp();
  })(0);
})();
