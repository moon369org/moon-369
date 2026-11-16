// Serves the Moonmark page for /m/<moonmark> with link-preview tags for that exact moment,
// so a Moonmark shared on X, iMessage or Slack shows its own card.
import { createHash } from 'node:crypto';

// A certificate of authenticity link: its details count only if their moon-coa/1 statement hashes to the signed fingerprint.
export function coaOf(q) {
  const s = (q.get('s') || '').toLowerCase(), cm = q.get('cm') || '', ca = q.get('ca'), ct = q.get('ct'), cy = q.get('cy'), ce = q.get('ce') || '';
  if (!/^[0-9a-f]{64}$/.test(s) || !ca || !ct || !cy || !/^[A-Za-z0-9_-]{43}$/.test(cm)) return null;
  const master = Buffer.from(cm, 'base64url').toString('hex');
  const edition = /^\d{1,3}$/.test(ce) ? ce : '';
  const st = ['moon-coa/1', 'artist:' + ca, 'title:' + ct, 'year:' + cy, 'edition:' + (edition || 'unique'), 'master:' + master].join('\n');
  return createHash('sha256').update(st, 'utf8').digest('hex') === s ? { artist: ca, title: ct, year: cy, edition } : null;
}

const MARK = /^(\d{1,7})\.(\d{1,2})\.(\d{1,2})(?:[-T ](\d{1,2})[.:](\d{2})(?:[.:](\d{2})(?:\.(\d{1,9}))?)?)?$/;
const p2 = (n) => String(n).padStart(2, '0');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function previewTags(html, raw, signed = false, event = '', coa = null) {
  const m = MARK.exec(raw || '');
  if (!m) return html;
  const [, y, mo, d, h = '0', mi = '0', s = '0', ns = ''] = m;
  if (+mo < 1 || +mo > 13 || +d < 1 || +d > 29 || +h > 23 || +mi > 59 || +s > 59) return html;
  const nine = ns.padEnd(9, '0');
  const path = `${+y}.${p2(+mo)}.${p2(+d)}-${p2(+h)}.${p2(+mi)}.${p2(+s)}.${nine}`;
  let pageUrl = `https://moon369.org/m/${path}`;
  const ev = signed ? '' : String(event || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const evQ = ev ? encodeURIComponent(ev).replace(/%20/g, '+') : '';
  if (ev) pageUrl += `?e=${evQ}`;
  const img = `https://api.moon369.org/v1/card.png?moonmark=${path}` + (ev ? `&event=${evQ}` : '');
  const mark = `${+y}.${p2(+mo)}.${p2(+d)} ${p2(+h)}:${p2(+mi)}:${p2(+s)}`;
  const title = coa ? `${coa.title} by ${coa.artist}` : ev || `${signed ? 'Signed ' : ''}Moonmark ${mark}`;
  const desc = coa
    ? `Certificate of authenticity: ${coa.title}, ${coa.artist}, ${coa.year}${coa.edition ? `, edition of ${coa.edition}` : ', unique work'}. Signed on Moon at ${mark}. Open it to check.`
    : ev
    ? `Moonmark ${mark}. Open it for the countdown and the time where you are, and add it to your calendar.`
    : signed
    ? `Moon signed a file fingerprint at this exact moment: Year ${+y}, Moon ${p2(+mo)}, Lune ${p2(+d)}. Open it to check the signature.`
    : `One exact moment, the same everywhere: Year ${+y}, Moon ${p2(+mo)}, Lune ${p2(+d)}. Open it in your own local time.`;
  const set = (re, val) => { html = html.replace(re, (_, a, b) => a + escAttr(val) + b); };
  set(/(<link rel="canonical" href=")[^"]*(")/, pageUrl);
  set(/(<meta property="og:url" content=")[^"]*(")/, pageUrl);
  set(/(<meta property="og:title" content=")[^"]*(")/, title);
  set(/(<meta name="twitter:title" content=")[^"]*(")/, title);
  set(/(<meta property="og:description" content=")[^"]*(")/, desc);
  set(/(<meta name="twitter:description" content=")[^"]*(")/, desc);
  set(/(<meta name="description" content=")[^"]*(")/, desc);
  set(/(<meta property="og:image" content=")[^"]*(")/, img);
  set(/(<meta name="twitter:image" content=")[^"]*(")/, img);
  set(/(<meta property="og:image:alt" content=")[^"]*(")/, `${title}, with the moon's phase at that moment`);
  set(/(<title>)[^<]*(<\/title>)/, `${title} · Moon`);
  if (ev) set(/(<h1[^>]*>)MOONMARK(<\/h1>)/, ev.toUpperCase());
  return html;
}

export async function GET(request) {
  const url = new URL(request.url);
  const raw = decodeURIComponent(url.searchParams.get('mark') || '');
  try {
    const page = await fetch(new URL('/m', url.origin));
    if (!page.ok) throw new Error('page ' + page.status);
    const html = previewTags(await page.text(), raw, /^[0-9a-f]{64}$/i.test(url.searchParams.get('s') || ''), url.searchParams.get('e') || '', coaOf(url.searchParams));
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=86400' } });
  } catch (e) {
    return Response.redirect(new URL('/m?m=' + encodeURIComponent(raw), url.origin).toString(), 302);
  }
}
