// Moon: sign anything. Right-click an image, selected text or a page; Moon signs its SHA-256 and the result
// page shows the proof link, QR code and receipt. Nothing but the fingerprint (and, for images, Moon's 64-bit
// look-alike hash) leaves the browser.
const DEFAULT_API = 'https://api.moon369.org';
const api = async () => (await chrome.storage.local.get('api')).api || DEFAULT_API;   // 'api' is only for testing against a local Moon

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'moon-image', title: 'Sign this image with Moon', contexts: ['image'] });
    chrome.contextMenus.create({ id: 'moon-text', title: 'Sign selected text with Moon', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'moon-page', title: 'Sign this page with Moon', contexts: ['page'] });
  });
});

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));

// Moon's look-alike hash v2, the same as moon369.org and the capture SDK: the picture on black at up to 1024 px,
// averaged over exact 9x8 blocks; each bit says whether a block is brighter than its right neighbour.
async function dhash(blob) {
  try {
    const bmp = await createImageBitmap(blob), w = bmp.width, h = bmp.height; if (!w || !h) return null;
    const s = Math.min(1, 1024 / Math.max(w, h)), W = Math.max(9, Math.round(w * s)), H = Math.max(8, Math.round(h * s));
    const cv = new OffscreenCanvas(W, H), x = cv.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, g = new Float64Array(72), n = new Float64Array(72);
    for (let yy = 0; yy < H; yy++) { const cy = Math.min(7, Math.floor(yy * 8 / H)); for (let xx = 0; xx < W; xx++) {
      const c = cy * 9 + Math.min(8, Math.floor(xx * 9 / W)), i = (yy * W + xx) * 4; g[c] += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n[c]++; } }
    let bits = '', out = '';
    for (let y = 0; y < 8; y++) for (let k = 0; k < 8; k++) bits += g[y * 9 + k] / n[y * 9 + k] > g[y * 9 + k + 1] / n[y * 9 + k + 1] ? '1' : '0';
    for (let q = 0; q < 64; q += 4) out += parseInt(bits.slice(q, q + 4), 2).toString(16);
    return out;
  } catch { return null; }
}

async function signBytes(bytes, phash) {
  const sha = await sha256(bytes), { key } = await chrome.storage.sync.get('key');
  const r = await fetch((await api()) + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
    body: JSON.stringify(phash ? { sha256: sha, phash } : { sha256: sha }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests right now. Try again in a minute.' : (b?.error?.message || 'Moon returned ' + r.status));
  return { sha, response: b };
}

// Hand the result to the result page through session storage (cleared when the browser closes).
async function show(job) {
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ [id]: job });
  chrome.tabs.create({ url: chrome.runtime.getURL('result.html') + '?id=' + id });
}

async function run(kind, info, tab) {
  try {
    if (kind === 'image') {
      const r = await fetch(info.srcUrl); if (!r.ok) throw new Error('Could not load that image (' + r.status + ').');
      const blob = await r.blob(), bytes = await blob.arrayBuffer();
      const { sha, response } = await signBytes(bytes, await dhash(blob));
      const name = (new URL(info.srcUrl, tab?.url).pathname.split('/').pop() || 'image').slice(0, 80);
      await show({ kind, name, source: info.srcUrl, page: tab?.url, sha, response, type: blob.type, size: bytes.byteLength, dataUrl: bytes.byteLength < 6e6 ? await toDataUrl(blob) : null });
    } else if (kind === 'text') {
      const text = info.selectionText || '';
      const { sha, response } = await signBytes(new TextEncoder().encode(text));
      await show({ kind, name: 'Selected text', page: tab?.url, sha, response, text });
    } else {
      // The page as it is in the browser right now: its full HTML, including anything scripts added.
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => '<!doctype html>\n' + document.documentElement.outerHTML });
      const html = res.result, bytes = new TextEncoder().encode(html);
      const { sha, response } = await signBytes(bytes);
      await show({ kind, name: tab.title || 'Page', page: tab.url, sha, response, text: html, size: bytes.byteLength });
    }
  } catch (e) {
    await show({ kind, error: (e && e.message) || String(e), page: tab?.url });
  }
}
async function toDataUrl(blob) {
  const b = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + btoa(s);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  run(info.menuItemId === 'moon-image' ? 'image' : info.menuItemId === 'moon-text' ? 'text' : 'page', info, tab);
});
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m && m.type === 'sign-page') chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => { run('page', {}, tab); reply(true); });
  return true;
});
self.moonRun = run;   // for automated tests
