const $ = (s) => document.querySelector(s);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const size = (n) => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const safe = (n) => String(n || 'moon').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60);
function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

(async () => {
  const id = new URLSearchParams(location.search).get('id'), job = id && (await chrome.storage.session.get(id))[id];
  const out = $('#out');
  if (!job) { out.innerHTML = '<div class="k bad">NOTHING TO SHOW</div><p>This result has expired. Sign it again.</p>'; return; }
  if (job.error) { out.innerHTML = '<div class="k bad">COULD NOT SIGN</div><p>' + esc(job.error) + '</p>'; return; }
  const rc = job.response.receipt, url = job.response.signed_url, ms = Number(BigInt(rc.unix_ns) / 1000000n);
  document.title = 'Signed on Moon · ' + rc.moonmark.slice(0, 19);
  let qr = ''; try { qr = window.MoonQR.svg(url, window.MoonPhase.fraction(ms)); } catch (e) {}
  const what = job.kind === 'image' ? 'Image · ' + esc(job.name) + ' · ' + size(job.size) : job.kind === 'text' ? 'Selected text · ' + size(new TextEncoder().encode(job.text).length) : 'Page · ' + esc(job.name) + ' · ' + size(job.size);
  const content = job.kind === 'image' ? 'SAVE IMAGE' : job.kind === 'text' ? 'SAVE TEXT' : 'SAVE PAGE';
  out.innerHTML = '<div class="card"><div>' +
    '<div class="k ok">SIGNED ON MOON</div><div class="mark mono">' + esc(rc.moonmark.slice(0, 19)) + '<span>' + esc(rc.moonmark.slice(19)) + '</span></div>' +
    '<div class="when">' + esc(new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })) + '</div>' +
    '<dl><div><dt>WHAT</dt><dd>' + what + '</dd></div>' + (job.page ? '<div><dt>FROM</dt><dd>' + esc(job.page) + '</dd></div>' : '') + '<div><dt>FINGERPRINT</dt><dd class="mono" style="font-size:12.5px;color:#B9B6AE">' + job.sha + '</dd></div></dl>' +
    '<div class="link"><input readonly value="' + esc(url) + '"><button class="btn p" id="copy">COPY LINK</button></div>' +
    '<div class="acts"><button class="btn" id="content">' + content + '</button><button class="btn" id="receipt">SAVE RECEIPT</button><a class="btn" href="' + esc(url) + '" target="_blank">OPEN →</a></div>' +
    '<p class="note">Keep the saved ' + (job.kind === 'image' ? 'image' : job.kind === 'text' ? 'text' : 'page') + ': it is exactly what was signed. Anyone can drop it on <a href="https://moon369.org/verify" target="_blank">moon369.org/verify</a> to check it.' +
    (job.kind === 'page' ? ' A page snapshot is the page as your browser showed it, scripts included; it proves what you saw, not who runs the site.' : '') + '</p>' +
    (job.dataUrl ? '<img class="prev" src="' + job.dataUrl + '" alt="">' : '') +
    '</div><div class="qr">' + qr + '<div class="k">SCAN TO CHECK</div></div></div>';
  const base = safe(job.kind === 'text' ? 'moon-text-' + rc.moonmark.slice(0, 10) : job.name);
  $('#copy').onclick = () => navigator.clipboard.writeText(url).then(() => { $('#copy').textContent = 'COPIED'; setTimeout(() => { $('#copy').textContent = 'COPY LINK'; }, 1500); });
  $('#receipt').onclick = () => save(new Blob([JSON.stringify(rc, null, 2) + '\n'], { type: 'application/json' }), base + '.moonmark.json');
  $('#content').onclick = async () => {
    if (job.kind === 'image') save(job.dataUrl ? await (await fetch(job.dataUrl)).blob() : await (await fetch(job.source)).blob(), job.name || 'image');
    else save(new Blob([job.text], { type: job.kind === 'page' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' }), base + (job.kind === 'page' ? '.html' : '.txt'));
  };
})();
