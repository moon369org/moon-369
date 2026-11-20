/* moon369.org/members#<place>.<key>: the owner's page for a place's member passes. Add members with single-use
   invites, renew or cancel them, and open the door scanner. The key stays in this link and on this device. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); };
  var T = function (s, v) { if (window.MoonT) return window.MoonT(s, v); return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var place = '', key = '', data = null, armed = null;
  var day = function (iso) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 10); } };
  var when = function (iso) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return iso; } };
  function toast(t) { var el = $('[data-m-toast]'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2200); }
  function api(path, body) {
    return fetch(API + '/v1/passes/' + place + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ key: key }, body || {})) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Error ' + r.status), { status: r.status }); return j; }); });
  }
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(T('Link copied')); }, function () { prompt('Copy this link', text); }); }
  function share(text, name) {
    var msg = T('Your membership pass for {p}. Open this on your phone: it works once, and only on that phone.', { p: data.place.name });
    if (navigator.share) navigator.share({ title: data.place.name, text: msg, url: text }).catch(function () {}); else copy(text);
  }

  function render() {
    var today = new Date().toDateString(), act = 0, inToday = 0, h = '';
    data.members.forEach(function (m) {
      if (m.status === 'active') act++;
      if (m.last_visit && new Date(m.last_visit).toDateString() === today) inToday++;
      var label = { active: T('ACTIVE'), expired: T('EXPIRED'), cancelled: T('CANCELLED') }[m.status];
      h += '<div class="m"><div class="m-h"><span class="m-n">' + esc(m.name || T('Member')) + '</span><span class="chip ' + m.status + '">' + label + '</span></div>' +
        '<div class="m-d"><span>' + (m.status === 'cancelled' ? T('CANCELLED') + ' <b>' + esc(day(m.cancelled)) + '</b>' : (m.expires ? (m.status === 'expired' ? T('ENDED') : T('UNTIL')) + ' <b>' + esc(day(m.expires)) + '</b>' : T('NO END DATE'))) + '</span>' +
        '<span>' + T('VISITS') + ' <b>' + m.visits + '</b></span><span>' + T('LAST') + ' <b>' + esc(m.last_visit ? when(m.last_visit) : T('never')) + '</b></span></div>' +
        '<div class="m-a"><select class="in" data-renew-days="' + m.id + '" aria-label="Renew for"><option value="30">+1 month</option><option value="90">+3 months</option><option value="365" selected>+1 year</option><option value="0">No end date</option></select>' +
        '<button class="btn s" type="button" data-renew="' + m.id + '">' + (m.status === 'active' ? T('RENEW') : T('RESTORE')) + '</button>' +
        (m.status === 'cancelled' ? '' : '<button class="btn s" type="button" data-cancel="' + m.id + '">' + (armed === m.id ? T('TAP AGAIN TO CANCEL') : T('CANCEL')) + '</button>') + '</div></div>';
    });
    data.invites.forEach(function (i) {
      h += '<div class="m"><div class="m-h"><span class="m-n">' + esc(i.name || T('Invite')) + '</span><span class="chip invite">' + T('INVITED') + '</span></div>' +
        '<div class="m-d"><span>' + T('SENT') + ' <b>' + esc(day(i.created)) + '</b></span><span>' + (i.days ? T('FOR') + ' <b>' + i.days + ' ' + T('days') + '</b>' : T('NO END DATE')) + '</span></div>' +
        '<div class="m-a"><button class="btn s" type="button" data-icopy="' + esc(i.link) + '">' + T('COPY LINK') + '</button><button class="btn s" type="button" data-idrop="' + esc(i.token) + '">' + (armed === i.token ? T('TAP AGAIN TO WITHDRAW') : T('WITHDRAW')) + '</button></div></div>';
    });
    $('[data-m-list]').innerHTML = h || '<p class="note" style="padding:16px 0">' + T('No members yet. Create an invite above and send it to your first member.') + '</p>';
    $('[data-m-active]').textContent = act; $('[data-m-today]').textContent = inToday; $('[data-m-pending]').textContent = data.invites.length;
  }
  function load() { return api('/members').then(function (j) { data = j; $('[data-m-name]').textContent = j.place.name; document.title = j.place.name + ' · Members · Moon'; render(); }); }

  function add() {
    var b = $('[data-m-add]'), name = $('[data-m-name-in]').value.trim(), d = Number($('[data-m-days]').value);
    b.disabled = true;
    api('/invite', { name: name || undefined, days: d || null }).then(function (j) {
      $('[data-m-invqr]').innerHTML = window.MoonQR ? MoonQR.svg(j.link, window.MoonPhase ? MoonPhase.fraction(Date.now()) : 0, { square: true }) : '';
      $('[data-m-invlink]').value = j.link; $('[data-m-invname]').textContent = name || T('the member'); $('[data-m-inv]').hidden = false;
      $('[data-m-name-in]').value = ''; return load();
    }).catch(function (e) { toast(e.message || T('Could not create the invite')); }).then(function () { b.disabled = false; });
  }
  function click(e) {
    var t = e.target.closest('button'); if (!t) return;
    var id;
    if ((id = t.getAttribute('data-renew'))) {
      var d = Number(document.querySelector('[data-renew-days="' + id + '"]').value);
      t.disabled = true; api('/renew', { pass: id, days: d || null }).then(function () { toast(T('Renewed')); return load(); }, function (er) { toast(er.message); t.disabled = false; });
    } else if ((id = t.getAttribute('data-cancel'))) {
      if (armed !== id) { armed = id; render(); clearTimeout(click.t); click.t = setTimeout(function () { armed = null; render(); }, 4000); return; }
      armed = null; api('/cancel', { pass: id }).then(function () { toast(T('Membership cancelled')); return load(); }, function (er) { toast(er.message); });
    } else if ((id = t.getAttribute('data-idrop'))) {
      if (armed !== id) { armed = id; render(); clearTimeout(click.t); click.t = setTimeout(function () { armed = null; render(); }, 4000); return; }
      armed = null; api('/cancel', { invite: id }).then(function () { toast(T('Invite withdrawn')); return load(); }, function (er) { toast(er.message); });
    } else if ((id = t.getAttribute('data-icopy'))) copy(id);
  }

  function start() {
    var m = /^#?([A-Za-z0-9_-]{8,24})\.([A-Za-z0-9_-]{16,64})$/.exec(location.hash);
    if (!m) {
      var saved = {}; try { saved = JSON.parse(localStorage.getItem('moonPlaces') || '{}'); } catch (e) {}
      var ids = Object.keys(saved);
      if (ids.length) { location.replace('/members#' + ids[0] + '.' + saved[ids[0]]); return start(); }
      var msg = $('[data-m-msg]'); msg.innerHTML = T('This is the members page for a place on Moon. Open the link you got when you made it, or <a href="/passes#start">start one</a>.'); msg.hidden = false; return;
    }
    place = m[1]; key = m[2];
    try { var s = JSON.parse(localStorage.getItem('moonPlaces') || '{}'); s[place] = key; localStorage.setItem('moonPlaces', JSON.stringify(s)); } catch (e) {}
    $('[data-m-door]').href = '/door#' + place + '.' + key;
    $('[data-m-add]').addEventListener('click', add);
    $('[data-m-name-in]').addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    $('[data-m-copy]').addEventListener('click', function () { copy($('[data-m-invlink]').value); });
    $('[data-m-share]').addEventListener('click', function () { share($('[data-m-invlink]').value); });
    $('[data-m-list]').addEventListener('click', click);
    load().then(function () { $('[data-m-main]').hidden = false; setInterval(function () { if (!armed && document.visibilityState === 'visible') load().catch(function () {}); }, 20000); }, function (e) {
      var msg = $('[data-m-msg]'); msg.textContent = e.status === 403 ? T('This link has the wrong key for this place.') : e.status === 404 ? T('No such place.') : T('Could not reach Moon. Check your connection.'); msg.hidden = false;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
