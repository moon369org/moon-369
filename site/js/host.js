/* moon369.org/host#<door>.<key>: a host's page for Moon Stays. Add a door, book stays (each gets a single-use
   invite and a backup PIN), cancel them, see openings, and open the lock reader. */
(function () {
  var API = 'https://api.moon369.org';
  try { var o = localStorage.getItem('moonApi'); if (o) API = o; } catch (e) {}
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var door = '', key = '', data = null, armed = null, last = null;
  function toast(t) { var el = $('[data-m-toast]'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2200); }
  function api(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Error ' + r.status), { status: r.status }); return j; }); });
  }
  var when = function (iso) { try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: data.door.tz }).format(new Date(iso)); } catch (e) { return iso; } };
  var hr = function (h) { var d = new Date(Date.UTC(2026, 0, 1, h)); return d.toLocaleTimeString(undefined, { hour: 'numeric', timeZone: 'UTC' }); };
  var pinf = function (p) { return p.slice(0, 3) + ' ' + p.slice(3, 5) + ' ' + p.slice(5); };
  function message() { return 'Your stay at ' + data.door.name + ': open this link on your phone to get your door pass. It works once, only on that phone. Backup PIN for the lock: ' + pinf(last.pin) + '\n' + last.link; }
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copied'); }, function () { prompt('Copy this', text); }); }

  function render() {
    var n = 0, up = 0, h = '';
    data.stays.forEach(function (s) {
      if (s.status === 'active') n++; if (s.status === 'upcoming') up++;
      var label = { active: 'STAYING', upcoming: 'UPCOMING', ended: 'ENDED', cancelled: 'CANCELLED' }[s.status];
      h += '<div class="m"><div class="m-h"><span class="m-n">' + esc(s.guest || 'Guest') + '</span><span class="chip ' + (s.status === 'active' ? 'active' : s.status) + '">' + label + '</span></div>' +
        '<div class="m-d"><span>IN <b>' + esc(when(s.check_in)) + '</b></span><span>OUT <b>' + esc(when(s.check_out)) + '</b></span><span>PIN <b translate="no">' + pinf(s.pin) + '</b></span><span>OPENINGS <b>' + s.openings + '</b></span><span>' + (s.joined ? 'PASS ON PHONE' : 'INVITE NOT USED YET') + '</span></div>' +
        '<div class="m-a">' + (s.link ? '<button class="btn s" type="button" data-icopy="' + esc(s.link) + '">COPY INVITE</button>' : '') +
        (s.status === 'cancelled' || s.status === 'ended' ? '' : '<button class="btn s" type="button" data-cancel="' + s.id + '">' + (armed === s.id ? 'TAP AGAIN TO CANCEL' : 'CANCEL STAY') + '</button>') + '</div></div>';
    });
    $('[data-m-list]').innerHTML = h || '<p class="note" style="padding:16px 0">No stays yet. Add one above.</p>';
    var names = {}; data.stays.forEach(function (s) { names[s.id] = s.guest || 'Guest'; });
    $('[data-h-visits]').innerHTML = data.visits.length ? data.visits.slice(0, 15).map(function (v) {
      return '<div class="m"><div class="m-d"><span><b>' + esc(names[v.stay] || 'Guest') + '</b></span><span>' + esc(when(v.at)) + '</span><span>' + (v.method === 'pin' ? 'BACKUP PIN' : 'PHONE PASS') + '</span>' + (v.signed_url ? '<a href="' + esc(v.signed_url.replace(/^https:\/\/moon369\.org/, '')) + '" style="color:#C9C6BE">SIGNED</a>' : '') + '</div></div>';
    }).join('') : '<p class="note" style="padding:16px 0">Openings show up here when the lock has a connection.</p>';
    $('[data-h-now]').textContent = n; $('[data-h-next]').textContent = up; $('[data-h-open]').textContent = data.visits.length;
  }
  function load() {
    return api('/v1/stays/' + door + '/host', { key: key }).then(function (j) {
      data = j; $('[data-m-name]').textContent = j.door.name; document.title = j.door.name + ' · Host · Moon';
      $('[data-h-hours]').textContent = 'CHECK-IN ' + hr(j.door.checkin_hour) + ' · CHECK-OUT ' + hr(j.door.checkout_hour) + ' · ' + j.door.tz.replace(/_/g, ' ');
      render();
    });
  }
  function add() {
    var b = $('[data-h-add]'), guest = $('[data-h-guest]').value.trim(), a = $('[data-h-arrive]').value, d = $('[data-h-depart]').value;
    if (!a || !d) { toast('Pick arrive and depart dates'); return; }
    b.disabled = true;
    api('/v1/stays/' + door + '/book', { key: key, guest: guest || undefined, arrive: a, depart: d }).then(function (j) {
      last = j;
      $('[data-m-invqr]').innerHTML = window.MoonQR ? MoonQR.svg(j.link, window.MoonPhase ? MoonPhase.fraction(Date.now()) : 0, { square: true }) : '';
      $('[data-m-invlink]').value = j.link; $('[data-m-invname]').textContent = guest || 'the guest'; $('[data-h-pin]').textContent = pinf(j.pin);
      $('[data-m-inv]').hidden = false; $('[data-h-guest]').value = '';
      return load();
    }).catch(function (e) { toast(e.message); }).then(function () { b.disabled = false; });
  }
  function click(e) {
    var t = e.target.closest('button'); if (!t) return;
    var id;
    if ((id = t.getAttribute('data-cancel'))) {
      if (armed !== id) { armed = id; render(); clearTimeout(click.t); click.t = setTimeout(function () { armed = null; render(); }, 4000); return; }
      armed = null; api('/v1/stays/' + door + '/cancel', { key: key, stay: id }).then(function () { toast('Stay cancelled. The lock refuses it once it syncs.'); return load(); }, function (er) { toast(er.message); });
    } else if ((id = t.getAttribute('data-icopy'))) copy(id);
  }

  function newDoor() {
    var tzs = []; try { tzs = Intl.supportedValuesOf('timeZone'); } catch (e) { tzs = ['America/Denver', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'UTC']; }
    var mine = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    $('[data-h-tz]').innerHTML = tzs.map(function (z) { return '<option' + (z === mine ? ' selected' : '') + '>' + esc(z) + '</option>'; }).join('');
    var hrs = ''; for (var i = 0; i < 24; i++) hrs += '<option value="' + i + '">' + hr(i) + '</option>';
    $('[data-h-ci]').innerHTML = hrs; $('[data-h-co]').innerHTML = hrs; $('[data-h-ci]').value = '15'; $('[data-h-co]').value = '11';
    $('[data-h-new]').hidden = false;
    $('[data-h-make]').addEventListener('click', function () {
      var name = $('[data-h-name]').value.trim(); if (!name) { $('[data-h-name]').focus(); return; }
      this.disabled = true;
      api('/v1/stays', { name: name, tz: $('[data-h-tz]').value, checkin_hour: Number($('[data-h-ci]').value), checkout_hour: Number($('[data-h-co]').value), renew_hours: Number($('[data-h-renew]').value) })
        .then(function (j) { location.hash = j.door.id + '.' + j.key; location.reload(); }, function (er) { toast(er.message); });
    });
  }
  function start() {
    var m = /^#?([A-Za-z0-9_-]{8,24})\.([A-Za-z0-9_-]{16,64})$/.exec(location.hash);
    if (!m) {
      var saved = {}; try { saved = JSON.parse(localStorage.getItem('moonDoorsHost') || '{}'); } catch (e) {}
      var ids = Object.keys(saved);
      if (ids.length && !/new/.test(location.search)) { location.replace('/host#' + ids[0] + '.' + saved[ids[0]]); return start(); }
      return newDoor();
    }
    door = m[1]; key = m[2];
    try { var s = JSON.parse(localStorage.getItem('moonDoorsHost') || '{}'); s[door] = key; localStorage.setItem('moonDoorsHost', JSON.stringify(s)); } catch (e) {}
    $('[data-h-lock]').href = '/lock#' + door + '.' + key;
    var d0 = new Date(), d1 = new Date(Date.now() + 2 * 86400000), iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    $('[data-h-arrive]').value = iso(d0); $('[data-h-depart]').value = iso(d1);
    $('[data-h-add]').addEventListener('click', add);
    $('[data-m-copy]').addEventListener('click', function () { copy(message()); });
    $('[data-m-share]').addEventListener('click', function () { if (navigator.share) navigator.share({ title: data.door.name, text: message() }).catch(function () {}); else copy(message()); });
    $('[data-m-list]').addEventListener('click', click);
    load().then(function () { $('[data-m-main]').hidden = false; setInterval(function () { if (!armed && document.visibilityState === 'visible') load().catch(function () {}); }, 30000); }, function (e) {
      var msg = $('[data-m-msg]'); msg.textContent = e.status === 403 ? 'This link has the wrong key for this door.' : e.status === 404 ? 'No such door.' : 'Could not reach Moon. Check your connection.'; msg.hidden = false;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
