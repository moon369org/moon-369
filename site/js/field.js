/* Field Log (/field): a signed record of farm and site work, kept on this phone.
   Each entry (what was done, where, photos) goes to POST /v1/field/sign. Moon adds the observed weather,
   signs the record's fingerprint and hands it back; nothing is stored on Moon's side but the fingerprint.
   With no signal, entries wait on the phone with their phone time and are signed when the phone is back online.
   The report prints every entry with a QR code to its signed Moonmark, and the evidence file can be checked
   by anyone at /field#check. */
(function () {
  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://api.moon369.org';
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var T = function (x, v) { return window.MoonT ? MoonT(x, v) : x.replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? v[k] : m; }); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function lang() { var l = window.MoonI18n && MoonI18n.lang; if (!l) { try { l = localStorage.getItem('moonLang'); } catch (e) {} } return l && l !== 'en' ? (l === 'pt' ? 'pt-PT' : l) : undefined; }
  function when(ms, o) { try { return new Intl.DateTimeFormat(lang(), o || { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms); } catch (e) { return new Date(ms).toISOString(); } }
  function toast(m) { var t = $('[data-fl-toast]'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3200); }

  var KINDS = [['spray', 'SPRAY'], ['planting', 'PLANTING'], ['fertilizer', 'FERTILIZER'], ['irrigation', 'IRRIGATION'], ['harvest', 'HARVEST'], ['damage', 'DAMAGE'], ['livestock', 'LIVESTOCK'], ['inspection', 'INSPECTION'], ['other', 'OTHER']];
  var kindName = function (k) { for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0] === k) return T(KINDS[i][1]); return k; };

  // ---------- storage: entries in localStorage, photos in IndexedDB ----------
  function load() { try { return JSON.parse(localStorage.getItem('moonField') || '[]'); } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem('moonField', JSON.stringify(list)); return true; } catch (e) { toast(T('This phone is out of space for the Field Log.')); return false; } }
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem('moonField.' + k) || ''; localStorage.setItem('moonField.' + k, v); } catch (e) { return ''; } }
  var dbp = null;
  function db() {
    return dbp || (dbp = new Promise(function (ok, no) {
      if (!window.indexedDB) return no(new Error('no db'));
      var r = indexedDB.open('moon-field', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('photos'); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
    }));
  }
  function putPhoto(k, b) { return db().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction('photos', 'readwrite'); t.objectStore('photos').put(b, k); t.oncomplete = ok; t.onerror = function () { no(t.error); }; }); }); }
  function getPhoto(k) { return db().then(function (d) { return new Promise(function (ok) { var q = d.transaction('photos').objectStore('photos').get(k); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); }
  function delPhoto(k) { return db().then(function (d) { d.transaction('photos', 'readwrite').objectStore('photos').delete(k); }).catch(function () {}); }

  function hex(buf) { return Array.from(new Uint8Array(buf), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }
  function sha256(blob) { return blob.arrayBuffer().then(function (b) { return crypto.subtle.digest('SHA-256', b); }).then(hex); }
  // The photo kept in the log is the one Moon signs: up to 1600 px, so a season of photos fits on a phone.
  function shrink(file) {
    return createImageBitmap(file).then(function (bm) {
      var s = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
      c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      return new Promise(function (ok) { c.toBlob(function (b) { ok(b || file); }, 'image/jpeg', 0.86); });
    }).catch(function () { return file; });
  }

  // ---------- views ----------
  function show(v) {
    $$('[data-view]').forEach(function (s) { s.hidden = s.getAttribute('data-view') !== v; });
    document.body.setAttribute('data-on', v);
    window.scrollTo(0, 0);
    if (v === 'list') drawList();
    if (v === 'report') drawReport();
  }
  function route() { var h = location.hash.replace('#', ''); show(['new', 'report', 'check'].indexOf(h) >= 0 ? h : 'list'); if (h === 'new') openNew(); }

  // ---------- the list ----------
  function drawList() {
    var list = load(), box = $('[data-fl-list]'), pend = list.filter(function (e) { return e.status === 'pending'; }).length;
    $('[data-fl-count]').textContent = list.length === 1 ? T('1 ENTRY') : T('{n} ENTRIES', { n: list.length });
    $('[data-fl-pend]').hidden = !pend;
    $('[data-fl-pend]').textContent = pend === 1 ? T('1 entry waiting for signal. It will be signed when you are back online.') : T('{n} entries waiting for signal. They will be signed when you are back online.', { n: pend });
    if (!list.length) { box.innerHTML = '<li class="fl-empty">' + esc(T('No entries yet. Tap NEW ENTRY when you spray, plant, harvest or find damage.')) + '</li>'; return; }
    box.innerHTML = list.slice().reverse().map(function (e) {
      var en = e.record ? e.record.entry : e.body.entry, ms = e.signed_ms || Date.parse(en.written_utc) || e.at;
      return '<li class="fl-row" data-id="' + esc(e.id) + '"><div class="fl-rk">' + esc(kindName(en.kind)) + (e.status === 'pending' ? ' <em>' + esc(T('WAITING')) + '</em>' : ' <em class="ok">' + esc(T('SIGNED')) + '</em>') + '</div>' +
        '<div class="fl-rt">' + esc([en.field, en.crop, en.product].filter(Boolean).join(' · ') || en.notes || '') + '</div>' +
        '<div class="fl-rm">' + esc(when(ms)) + (e.photos && e.photos.length ? ' · ' + esc(e.photos.length === 1 ? T('1 photo') : T('{n} photos', { n: e.photos.length })) : '') + '</div>' +
        '<button type="button" class="fl-del" data-del="' + esc(e.id) + '" aria-label="' + esc(T('Remove from this phone')) + '">×</button></li>';
    }).join('');
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-del]'); if (!b) return;
    if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = T('REMOVE?'); setTimeout(function () { if (b.isConnected) { b.removeAttribute('data-sure'); b.textContent = '×'; } }, 3000); return; }
    var id = b.getAttribute('data-del'), list = load(), e = list.filter(function (x) { return x.id === id; })[0];
    if (e && e.photos) e.photos.forEach(function (p) { delPhoto(p.key); });
    save(list.filter(function (x) { return x.id !== id; })); drawList();
  });

  // ---------- a new entry ----------
  var draft = null;
  function openNew() {
    draft = { kind: pref('kind') || 'spray', photos: [], place: null };
    var f = $('[data-fl-form]'); f.reset();
    f.by.value = pref('by'); f.field.value = ''; f.crop.value = '';
    var fields = {}; load().forEach(function (e) { var en = e.record ? e.record.entry : e.body.entry; if (en.field) fields[en.field] = 1; });
    $('#fl-fields').innerHTML = Object.keys(fields).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');
    drawKinds(); drawPhotos(); locate();
  }
  function drawKinds() {
    $('[data-fl-kinds]').innerHTML = KINDS.map(function (k) { return '<button type="button" class="fl-chip" aria-pressed="' + (draft.kind === k[0]) + '" data-kind="' + k[0] + '">' + esc(T(k[1])) + '</button>'; }).join('');
    $$('[data-kind]').forEach(function (b) { b.onclick = function () { draft.kind = b.getAttribute('data-kind'); drawKinds(); }; });
    $('[data-fl-spray]').hidden = ['spray', 'fertilizer'].indexOf(draft.kind) < 0;
  }
  function drawPhotos() {
    $('[data-fl-photos]').innerHTML = draft.photos.map(function (p, i) { return '<div class="fl-ph"><img alt="" src="' + p.url + '"><button type="button" data-rmph="' + i + '" aria-label="' + esc(T('Remove photo')) + '">×</button></div>'; }).join('');
    $$('[data-rmph]').forEach(function (b) { b.onclick = function () { var p = draft.photos.splice(+b.getAttribute('data-rmph'), 1)[0]; if (p) URL.revokeObjectURL(p.url); drawPhotos(); }; });
    $('[data-fl-addph]').hidden = draft.photos.length >= 8;
  }
  $('[data-fl-file]') && $('[data-fl-file]').addEventListener('change', function (ev) {
    var files = Array.prototype.slice.call(ev.target.files || [], 0, 8 - draft.photos.length); ev.target.value = '';
    Promise.all(files.map(shrink)).then(function (bs) { bs.forEach(function (b) { draft.photos.push({ blob: b, url: URL.createObjectURL(b) }); }); drawPhotos(); });
  });
  function locate() {
    var out = $('[data-fl-where]');
    if (!navigator.geolocation) { out.textContent = T('This phone cannot share its location. The entry will be signed without a place or weather.'); return; }
    out.textContent = T('Finding where you are…');
    navigator.geolocation.getCurrentPosition(function (p) {
      draft.place = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy };
      out.textContent = T('Here: {lat}, {lng} (within {m} m). Moon adds the weather from the nearest station.', { lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5), m: Math.round(p.coords.accuracy) });
    }, function () { draft.place = null; out.textContent = T('Location is off. The entry will be signed without a place or weather.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  function submit(ev) {
    ev.preventDefault();
    var f = ev.target, btn = $('[data-fl-save]');
    var entry = { kind: draft.kind, field: f.field.value, crop: f.crop.value, notes: f.notes.value, by: f.by.value, written_utc: new Date().toISOString() };
    if (!$('[data-fl-spray]').hidden) { entry.product = f.product.value; entry.epa_reg = f.epa_reg.value; entry.rate = f.rate.value; entry.area = f.area.value; }
    if (!entry.field.trim() && !entry.notes.trim() && !draft.photos.length) { toast(T('Add a field name, a note or a photo.')); return; }
    pref('by', entry.by); pref('kind', draft.kind);
    btn.disabled = true; btn.textContent = T('SAVING…');
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    Promise.all(draft.photos.map(function (p, i) {
      return sha256(p.blob).then(function (h) { var key = id + '-' + i; return putPhoto(key, p.blob).then(function () { return { key: key, sha256: h }; }); });
    })).then(function (photos) {
      var body = { entry: entry, photos: photos.map(function (p) { return p.sha256; }) };
      if (draft.place) { body.lat = draft.place.lat; body.lng = draft.place.lng; body.accuracy_m = draft.place.accuracy_m; }
      var list = load(); list.push({ id: id, status: 'pending', body: body, photos: photos, at: Date.now() });
      if (!save(list)) throw new Error('space');
      draft.photos.forEach(function (p) { URL.revokeObjectURL(p.url); });
      return signOne(id).then(function (ok) { toast(ok ? T('Signed by Moon.') : T('Saved. It will be signed when you have signal.')); });
    }).catch(function () { toast(T('Could not save this entry.')); }).then(function () {
      btn.disabled = false; btn.textContent = T('SIGN AND SAVE');
      location.hash = '';
    });
  }

  // Signs one waiting entry. Resolves true when signed, false when it should wait for signal.
  function signOne(id) {
    var e = load().filter(function (x) { return x.id === id; })[0];
    if (!e || e.status !== 'pending') return Promise.resolve(true);
    return fetch(API + '/v1/field/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.body) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (!x.r.ok) { if (x.r.status >= 400 && x.r.status < 500 && x.r.status !== 429) { e.error = (x.j.error && x.j.error.message) || 'Rejected'; } return false; }
        var list = load(), i = list.findIndex(function (y) { return y.id === id; }); if (i < 0) return true;
        list[i] = { id: id, status: 'signed', record: x.j.record, receipt: x.j.receipt, signed_url: x.j.signed_url, signed_ms: Number(BigInt(x.j.receipt.unix_ns) / 1000000n), photos: e.photos, at: e.at };
        save(list); return true;
      }).catch(function () { return false; });
  }
  var syncing = false;
  function syncAll() {
    if (syncing || !navigator.onLine) return; syncing = true;
    var ids = load().filter(function (e) { return e.status === 'pending'; }).map(function (e) { return e.id; });
    ids.reduce(function (p, id) { return p.then(function () { return signOne(id); }); }, Promise.resolve()).then(function () {
      syncing = false; if (ids.length && document.body.getAttribute('data-on') === 'list') drawList();
    });
  }
  window.addEventListener('online', syncAll);

  // ---------- the report ----------
  function qr(url) {
    try { var q = window.qrcode(0, 'L'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 3, margin: 1, scalable: true }).replace('<svg ', '<svg role="img" aria-label="' + esc(T('QR code to the signed record')) + '" '); } catch (e) { return ''; }
  }
  function compass(d) { return d == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8]; }
  function weatherLine(w) {
    if (!w) return T('No weather on record');
    var mph = function (k) { return Math.round(k * 0.621371); }, f = function (c) { return Math.round(c * 9 / 5 + 32); };
    return [w.temp_c != null ? w.temp_c + ' °C (' + f(w.temp_c) + ' °F)' : null,
      w.wind_kmh != null ? T('wind {k} km/h ({m} mph) from the {d}', { k: Math.round(w.wind_kmh), m: mph(w.wind_kmh), d: compass(w.wind_from_deg) }) : null,
      w.wind_gust_kmh != null ? T('gusts {k} km/h', { k: Math.round(w.wind_gust_kmh) }) : null,
      w.humidity_pct != null ? T('humidity {h}%', { h: Math.round(w.humidity_pct) }) : null, w.conditions].filter(Boolean).join(', ') +
      ' · ' + T('{station}, {km} km away, observed {t}', { station: w.station_name || w.station, km: w.distance_km, t: w.observed_utc ? w.observed_utc.replace('T', ' ').replace('Z', ' UTC') : '' });
  }
  function selected() {
    var f = $('[data-fl-rf]').value, a = $('[data-fl-from]').value, b = $('[data-fl-to]').value;
    var lo = a ? Date.parse(a + 'T00:00:00') : -Infinity, hi = b ? Date.parse(b + 'T23:59:59') : Infinity;
    return load().filter(function (e) { return e.status === 'signed' && (!f || e.record.entry.field === f) && e.signed_ms >= lo && e.signed_ms <= hi; });
  }
  var urls = [];
  function drawReport() {
    var all = load(), fields = {}; all.forEach(function (e) { var en = e.record ? e.record.entry : e.body.entry; if (en.field) fields[en.field] = 1; });
    var sel = $('[data-fl-rf]'), cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(T('All fields')) + '</option>' + Object.keys(fields).sort().map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    $('[data-fl-farm]').value = pref('farm');
    paint();
  }
  function paint() {
    urls.forEach(URL.revokeObjectURL); urls = [];
    var list = selected(), farm = $('[data-fl-farm]').value.trim(), waiting = load().filter(function (e) { return e.status === 'pending'; }).length;
    pref('farm', farm);
    var doc = $('[data-fl-doc]');
    doc.innerHTML = '<div class="rp-h"><div><div class="rp-k">' + esc(T('FIELD LOG REPORT')) + '</div><h2>' + esc(farm || T('Field Log')) + '</h2>' +
      '<div class="rp-s">' + esc(T('{n} signed entries · made {t}', { n: list.length, t: when(Date.now()) })) + (waiting ? ' · ' + esc(T('{n} not yet signed, left out', { n: waiting })) : '') + '</div></div>' +
      '<img class="rp-logo" src="/assets/brand/logo/moon-wordmark-black.svg" alt="Moon"></div>' +
      (list.length ? '' : '<p class="rp-none">' + esc(T('No signed entries match.')) + '</p>') +
      list.map(function (e) {
        var r = e.record, en = r.entry, p = r.place;
        var rows = [[T('FIELD'), en.field], [T('CROP'), en.crop], [T('PRODUCT'), en.product], [T('EPA REG. NO.'), en.epa_reg], [T('RATE'), en.rate], [T('AREA'), en.area], [T('BY'), en.by], [T('NOTES'), en.notes],
          [T('PLACE'), p ? p.lat + ', ' + p.lng + (p.accuracy_m != null ? ' (±' + p.accuracy_m + ' m)' : '') : T('Not shared')], [T('WEATHER'), weatherLine(r.weather)],
          [T('WRITTEN (PHONE CLOCK)'), en.written_utc ? en.written_utc.replace('T', ' ').replace('Z', ' UTC') : null],
          [T('SIGNED BY MOON'), e.receipt.moonmark.replace(/\.\d+$/, '') + ' · ' + new Date(e.signed_ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')],
          [T('RECORD FINGERPRINT'), e.receipt.sha256]].filter(function (x) { return x[1]; });
        return '<article class="rp-e"><div class="rp-et"><b>' + esc(kindName(en.kind)) + '</b><span>' + esc(when(e.signed_ms, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })) + '</span></div>' +
          '<div class="rp-eb"><dl>' + rows.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl><div class="rp-qr">' + qr(e.signed_url) + '<span>' + esc(T('Scan to check the signature')) + '</span></div></div>' +
          (e.photos && e.photos.length ? '<div class="rp-ph" data-ph="' + esc(e.id) + '"></div>' : '') + '</article>';
      }).join('') +
      '<div class="rp-f">' + esc(T('Each entry was signed by Moon (moon369.org) at the time shown. Moon added the weather from the nearest US National Weather Service station; the person who made the entry could not change it. Change any detail, a photo or the weather, and the record fingerprint no longer matches the signature. To check the full record, open the evidence file at moon369.org/field#check.')) + '</div>';
    list.forEach(function (e) {
      var box = doc.querySelector('[data-ph="' + e.id + '"]'); if (!box) return;
      (e.photos || []).forEach(function (p) { getPhoto(p.key).then(function (b) { if (!b) return; var u = URL.createObjectURL(b); urls.push(u); var im = new Image(); im.src = u; im.alt = ''; box.appendChild(im); }); });
    });
  }
  function blobToData(b) { return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.readAsDataURL(b); }); }
  function evidence() {
    var list = selected(); if (!list.length) { toast(T('No signed entries match.')); return; }
    toast(T('Packing the evidence file…'));
    Promise.all(list.map(function (e) {
      return Promise.all((e.photos || []).map(function (p) { return getPhoto(p.key).then(function (b) { return b ? blobToData(b).then(function (d) { return { sha256: p.sha256, jpeg: d }; }) : { sha256: p.sha256, jpeg: null }; }); }))
        .then(function (ph) { return { record: e.record, receipt: e.receipt, signed_url: e.signed_url, photos: ph }; });
    })).then(function (entries) {
      var data = { format: 'moon-field-evidence/1', farm: $('[data-fl-farm]').value.trim() || null, made_utc: new Date().toISOString(), check: 'https://moon369.org/field#check', entries: entries };
      var name = 'field-log-' + new Date().toISOString().slice(0, 10) + '.json', file = new File([JSON.stringify(data, null, 1)], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: T('Field Log evidence') }).catch(function () {});
      var a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    });
  }

  // ---------- check an evidence file ----------
  function dataToBlob(d) { return fetch(d).then(function (r) { return r.blob(); }); }
  function check(file) {
    var out = $('[data-fl-cout]'); out.innerHTML = '<li class="fl-empty">' + esc(T('Checking…')) + '</li>';
    file.text().then(function (t) {
      var d = JSON.parse(t); if (!d || d.format !== 'moon-field-evidence/1' || !Array.isArray(d.entries)) throw new Error(T('That is not a Field Log evidence file.'));
      return Promise.all(d.entries.map(function (e) {
        var rec = fetch(API + '/v1/field/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record: e.record, receipt: e.receipt }) }).then(function (r) { return r.json(); });
        var photos = Promise.all((e.photos || []).map(function (p, i) {
          var want = e.record && e.record.photos ? e.record.photos[i] : null;
          return p.jpeg ? dataToBlob(p.jpeg).then(sha256).then(function (h) { return h === want; }) : Promise.resolve(null);
        }));
        return Promise.all([rec, photos]).then(function (x) { return { e: e, v: x[0], ph: x[1] }; });
      }));
    }).then(function (rs) {
      out.innerHTML = rs.map(function (x) {
        var en = x.e.record && x.e.record.entry || {}, ok = x.v.valid === true, phOk = x.ph.every(function (y) { return y !== false; });
        return '<li class="fl-row"><div class="fl-rk">' + esc(kindName(en.kind)) + ' <em class="' + (ok && phOk ? 'ok' : 'bad') + '">' + esc(ok && phOk ? T('CHECKS OUT') : T('DOES NOT MATCH')) + '</em></div>' +
          '<div class="fl-rt">' + esc([en.field, en.product].filter(Boolean).join(' · ')) + '</div>' +
          '<div class="fl-rm">' + esc(ok ? T('Signed {mm} · {utc}', { mm: String(x.v.moonmark).replace(/\.\d+$/, ''), utc: String(x.v.utc).replace('T', ' ').replace(/\.\d+Z$|Z$/, ' UTC') }) : T('The record was changed after Moon signed it, or the signature is not Moon\'s.')) +
          (x.ph.length ? ' · ' + esc(phOk ? T('{n} photos match', { n: x.ph.length }) : T('A photo was changed')) : '') + '</div></li>';
      }).join('');
    }).catch(function (e) { out.innerHTML = '<li class="fl-empty">' + esc(e.message || T('Could not check that file.')) + '</li>'; });
  }

  function start() {
    $('[data-fl-form]').addEventListener('submit', submit);
    $('[data-fl-locate]').onclick = locate;
    ['[data-fl-rf]', '[data-fl-from]', '[data-fl-to]'].forEach(function (s) { $(s).addEventListener('change', paint); });
    $('[data-fl-farm]').addEventListener('input', function () { clearTimeout(paint.t); paint.t = setTimeout(paint, 300); });
    $('[data-fl-print]').onclick = function () { window.print(); };
    $('[data-fl-ev]').onclick = evidence;
    $('[data-fl-cfile]').addEventListener('change', function (ev) { if (ev.target.files[0]) check(ev.target.files[0]); ev.target.value = ''; });
    window.addEventListener('hashchange', route);
    route(); syncAll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
