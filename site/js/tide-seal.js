/* moon369.org/tideline: the sealing module. Shows the lunes that have ended and are waiting to be
   sealed into a tide, how many receipts they hold, and a live countdown to the seal.
   Data: api.moon369.org/v1/status (tideline.waiting, next_seal_run_utc, last_sealed). */
(function () {
  var API = 'https://api.moon369.org';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var state = null, tick = null, built = '';

  function ago(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60);
  }
  var local = function (iso) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return iso.slice(0, 16).replace('T', ' ') + ' UTC'; } };

  function render() {
    var el = $('[data-tl-seal]'); if (!el || !state) return;
    var t = state, now = Date.now();
    if (!t.waiting || !t.waiting.length) {
      // Nothing waiting: show the last seal, if there is one.
      built = '';
      if (!t.last_sealed) { el.innerHTML = ''; return; }
      var ls = t.last_sealed;
      el.innerHTML =
        '<svg viewBox="-50 -50 100 100" width="96" height="96" aria-hidden="true"><circle r="40" fill="none" stroke="#E9E4D8" stroke-width="3"/><circle r="26" fill="#E9E4D8"/></svg>' +
        '<div><div class="tl-seal-k">ALL TIDES SEALED</div><div class="tl-seal-h">TIDE ' + esc(ls.lune) + '</div>' +
        '<p class="tl-seal-p">Sealed ' + esc(local(ls.sealed_utc)) + (ls.bitcoin ? ' · Bitcoin ' + (ls.bitcoin.status === 'confirmed' ? 'confirmed' + (ls.bitcoin.block_height ? ' in block ' + ls.bitcoin.block_height : '') : 'confirming') : '') + '.</p></div>' +
        '<div class="tl-seal-ns"><div class="tl-seal-n"><b>' + ls.size + '</b><span>RECEIPTS</span></div></div>' +
        '<div class="tl-seal-foot"><span>The next lune seals the moment it ends</span><span><a href="/tide/' + esc(ls.lune) + '">See the tide</a></span></div>';
      return;
    }
    var total = t.waiting.reduce(function (a, w) { return a + w.size; }, 0);
    var first = t.waiting[0], last = t.waiting[t.waiting.length - 1];
    var ended = Date.parse(last.ended_utc), run = Date.parse(t.next_seal_run_utc), left = run - now;
    var label = t.waiting.length === 1 ? 'LUNE ' + first.lune : t.waiting.length + ' LUNES · ' + first.lune + ' TO ' + last.lune;
    var due = left <= 0;
    var pct = Math.min(100, Math.max(0, (now - ended) / Math.max(1, run - ended) * 100));
    // Rebuild only when what's shown changes, so the loader keeps animating; the clock updates in place.
    var key = label + '|' + due + '|' + total;
    if (built === key) {
      var cd = el.querySelector('[data-cd]'), bar = el.querySelector('.tl-seal-bar i'), ag = el.querySelector('[data-ago]');
      if (cd && !due) cd.textContent = clock(left); if (bar) bar.style.width = pct.toFixed(2) + '%'; if (ag) ag.textContent = ago(now - ended);
      return;
    }
    built = key;
    el.innerHTML =
      '<img src="/assets/moon-loader.svg" alt="" aria-hidden="true">' +
      '<div><div class="tl-seal-k">' + (due ? 'SEALING NOW' : 'WAITING TO BE SEALED') + '</div><div class="tl-seal-h">' + esc(label) + '</div>' +
      '<p class="tl-seal-p">' + (due
        ? 'The lune has ended and the seal is running. These receipts are about to become one tide, chained to the last and signed with Moon\'s keys.'
        : 'This lune ended <span data-ago>' + ago(now - ended) + '</span> ago. Tonight its receipts become one tide: a single fingerprint of all of them, chained to the last tide, signed with Moon\'s keys and anchored to Bitcoin.') + '</p></div>' +
      '<div class="tl-seal-ns"><div class="tl-seal-n"><b>' + total + '</b><span>RECEIPT' + (total === 1 ? '' : 'S') + '</span></div>' +
      '<div class="tl-seal-n"><b data-cd>' + (due ? 'NOW' : clock(left)) + '</b><span>' + (due ? 'SEALING' : 'UNTIL THE SEAL') + '</span></div></div>' +
      '<div class="tl-seal-bar' + (due ? ' go' : '') + '"><i style="width:' + pct.toFixed(2) + '%"></i></div>' +
      '<div class="tl-seal-foot"><span>Seals ' + esc(local(t.next_seal_run_utc)) + ', then anchored to Bitcoin</span><span><a href="/tide/' + esc(first.lune) + '">See the receipts</a></span></div>';
  }

  function load() {
    fetch(API + '/v1/status', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var before = state && state.waiting ? state.waiting.length : 0;
      state = j.tideline && j.tideline.ok !== false ? j.tideline : null;
      if (!state) return;
      render();
      if (before && !(state.waiting || []).length && window.moonTrack) window.moonTrack('tide_sealed_seen');
    }).catch(function () {});
  }

  function start() {
    load();
    setInterval(load, 60000);
    tick = setInterval(function () { if (state && state.waiting && state.waiting.length) render(); }, 1000);
  }
  var t = 0, iv = setInterval(function () {
    var el = $('[data-tl-seal]'), snap = document.querySelector('[data-dc-snapshot]');
    if ((el && !(snap && snap.contains(el))) || ++t > 200) { clearInterval(iv); if (el) start(); }
  }, 25);
})();
