/* Moon app (/app): Moon time and the live moon, computed on the device so it works offline,
   plus one-tap links for any moment that open in each person's own local time. */
(function () {
  var EPOCH = -62165308562978.61, K = 1.0403730490216803, SEC = 1000 * K;
  var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
  var firstDay = function (m) { return Math.ceil(m * 369 / 13); };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function moon(ms) {
    var t = ms - EPOCH, s = t / SEC, whole = Math.floor(s), da = Math.floor(whole / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - firstDay(mi) + 1, sd = whole - da * 86400;
    return { y: y, m: mi + 1, d: d, h: Math.floor(sd / 3600), mi: Math.floor(sd % 3600 / 60), s: sd % 60 };
  }
  var text = function (k) { return k.y + '.' + p(k.m) + '.' + p(k.d) + ' ' + p(k.h) + ':' + p(k.mi) + ':' + p(k.s); };
  var path = function (k) { return k.y + '.' + p(k.m) + '.' + p(k.d) + '-' + p(k.h) + '.' + p(k.mi) + '.' + p(k.s); };
  // A moment's link: the Moonmark, to the second, with an optional name. It opens in each person's own time.
  function link(ms, name) {
    var k = moon(Math.floor(ms / 1000) * 1000 + 1);   // land inside the second so rounding never slips back one
    return 'https://moon369.org/m/' + path(k) + (name ? '?e=' + encodeURIComponent(name).replace(/%20/g, '+') : '');
  }
  function localStr(ms, opts) { try { return new Intl.DateTimeFormat(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms); } catch (e) { return new Date(ms).toString(); } }

  function tick() {
    var now = Date.now(), k = moon(now), P = window.MoonPhase;
    $('[data-app-date]').textContent = k.y + '.' + p(k.m) + '.' + p(k.d);
    $('[data-app-clock]').innerHTML = p(k.h) + ':' + p(k.mi) + ':' + p(k.s) + ' <span>LUNE ' + k.d + '</span>';
    if (P) {
      var f = P.fraction(now), lit = Math.round(P.illumination(now) * 100);
      $('[data-app-meta]').innerHTML = esc(P.name(f)) + ' · ' + lit + '% lit<br>Your time: ' + esc(localStr(now));
    }
  }

  // Recent moments stay on this device only.
  function recent() { try { return JSON.parse(localStorage.getItem('moonMoments') || '[]'); } catch (e) { return []; } }
  function remember(ms, name, url) {
    try { var r = recent().filter(function (x) { return x.url !== url; }); r.unshift({ ms: ms, name: name, url: url }); localStorage.setItem('moonMoments', JSON.stringify(r.slice(0, 8))); } catch (e) {}
    showRecent();
  }
  function showRecent() {
    var r = recent(), el = $('[data-app-recent]'); if (!r.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<div class="k" style="text-align:left;margin-bottom:6px">YOUR MOMENTS</div>' + r.map(function (x) {
      return '<a href="' + esc(x.url) + '"><span>' + esc(x.name || 'A moment') + '</span><span>' + esc(text(moon(x.ms))) + '</span></a>';
    }).join('');
  }

  var cur = null;   // { ms, plan }
  function openSheet(plan) {
    var ms = Math.floor(Date.now() / 1000) * 1000;
    cur = { ms: ms, plan: plan };
    $('[data-sheet-h]').textContent = plan ? 'PLAN AN EVENT' : 'MARK THIS MOMENT';
    var when = $('[data-sheet-when]'); when.hidden = !plan;
    if (plan) { var d = new Date(ms + 86400000); d.setMinutes(0, 0, 0); when.value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':00'; cur.ms = d.getTime(); }
    $('[data-sheet-name]').value = ''; $('[data-sheet-name]').placeholder = plan ? 'Name the event' : "What's happening? (optional)";
    updateSheet();
    $('[data-app-sheet]').hidden = false;
    setTimeout(function () { (plan ? when : $('[data-sheet-name]')).focus(); }, 50);
  }
  function updateSheet() {
    $('[data-sheet-mk]').textContent = 'Moonmark ' + text(moon(cur.ms + 1));
    $('[data-sheet-lt]').textContent = localStr(cur.ms, { dateStyle: 'full', timeStyle: 'short' }) + ' your time. Everyone else sees their own.';
  }
  function closeSheet() { $('[data-app-sheet]').hidden = true; }
  function toast(t) { var el = $('[data-app-toast]'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 1800); }
  function current() {
    var name = $('[data-sheet-name]').value.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (cur.plan && !name) { toast('Name the event first'); $('[data-sheet-name]').focus(); return null; }
    var url = link(cur.ms, name); remember(cur.ms, name, url);
    return { url: url, name: name, mark: text(moon(cur.ms + 1)) };
  }
  function share() {
    var c = current(); if (!c) return;
    var msg = (c.name ? c.name + ': ' : '') + 'Moonmark ' + c.mark + '. Opens in your own time:';
    if (navigator.share) navigator.share({ title: c.name || 'A moment on Moon', text: msg, url: c.url }).catch(function () {});
    else copy(c);
  }
  function copy(c) {
    c = c || current(); if (!c) return;
    (navigator.clipboard ? navigator.clipboard.writeText(c.url) : Promise.reject()).then(function () { toast('Link copied'); }, function () { prompt('Copy this link', c.url); });
  }
  function card() {
    var c = current(); if (!c) return;
    var m = moon(cur.ms + 1), q = 'moonmark=' + encodeURIComponent(path(m) + '.000000000') + (c.name ? '&event=' + encodeURIComponent(c.name) : '') + '&v=2';
    var url = 'https://api.moon369.org/v1/card.png?' + q;
    fetch(url).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
      var file = new File([b], 'moon-' + path(m) + '.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: c.url }).catch(function () {});
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click();
    }).catch(function () { toast('The card needs a connection'); });
  }

  // Install: Chrome and Android offer a prompt; iPhone needs Share, then Add to Home Screen.
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    var el = $('[data-app-install]'); el.hidden = false; el.innerHTML = '<button type="button">Add Moon to your home screen</button>';
    el.querySelector('button').onclick = function () { deferred.prompt(); deferred = null; el.hidden = true; };
  });
  function iosHint() {
    var standalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (!standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) { var el = $('[data-app-install]'); el.hidden = false; el.textContent = 'To keep Moon on your home screen: tap Share, then Add to Home Screen.'; }
  }

  function start() {
    tick(); setInterval(tick, 250); showRecent(); iosHint();
    $('[data-app-mark]').onclick = function () { openSheet(false); };
    $('[data-app-plan]').onclick = function () { openSheet(true); };
    $('[data-sheet-close]').onclick = closeSheet;
    $('[data-app-sheet]').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeSheet(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    $('[data-sheet-when]').oninput = function () { var v = Date.parse($('[data-sheet-when]').value); if (!isNaN(v)) { cur.ms = v; updateSheet(); } };
    $('[data-sheet-share]').onclick = share;
    $('[data-sheet-copy]').onclick = function () { copy(); };
    $('[data-sheet-card]').onclick = card;
    if (/[?&]mark=1/.test(location.search)) openSheet(false);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app-sw.js', { scope: '/app' }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
