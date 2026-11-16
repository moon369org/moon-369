// Serves /night?d=… with link-preview tags for that exact moon, so a shared Your Moon link
// shows its own card on X, iMessage, WhatsApp and Slack.
const TITLES = { day: 'The moon on', born: 'The moon when I was born', met: 'The moon when we met', wed: 'The moon on our wedding day', kid: 'The moon when my child was born' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n) => String(n).padStart(2, '0');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function previewTags(html, params) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('d') || '');
  if (!m || +m[1] < 1000 || +m[1] > 2999 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return html;
  const occ = TITLES[params.get('for')] ? params.get('for') : 'day';
  const t = /^(\d{2}):?(\d{2})$/.exec(params.get('t') || '');
  const z = /^([+-])(\d{2}):?(\d{2})$/.exec((params.get('z') || '').replace(' ', '+'));
  const q = new URLSearchParams({ d: m[0], ...(t ? { t: t[1] + t[2] } : {}), ...(z ? { z: z[1] + z[2] + z[3] } : {}), for: occ }).toString();
  const date = `${+m[3]} ${MONTHS[+m[2] - 1]} ${+m[1]}`;
  const title = occ === 'day' ? `The moon on ${date}` : `${TITLES[occ]} · ${date}`;
  const desc = 'See the moon exactly as it was on any day in history, then share the card. What did yours look like?';
  const rest = new URLSearchParams({ ...(t ? { t: t[1] + t[2] } : {}), ...(z ? { z: z[1] + z[2] + z[3] } : {}), for: occ }).toString();
  const pageUrl = `https://moon369.org/night/${m[0]}?${rest}`;
  // v = the drawing's version: bump it when the card art changes, so browsers and link previews fetch the new image.
  const img = `https://api.moon369.org/v1/night.png?${q}&v=2`;
  const set = (re, val) => { html = html.replace(re, (_, a, b) => a + escAttr(val) + b); };
  set(/(<link rel="canonical" href=")[^"]*(")/, pageUrl);
  set(/(<meta property="og:url" content=")[^"]*(")/, pageUrl);
  set(/(<meta property="og:title" content=")[^"]*(")/, title);
  set(/(<meta name="twitter:title" content=")[^"]*(")/, title);
  set(/(<meta property="og:description" content=")[^"]*(")/, desc);
  set(/(<meta name="twitter:description" content=")[^"]*(")/, desc);
  set(/(<meta property="og:image" content=")[^"]*(")/, img);
  set(/(<meta name="twitter:image" content=")[^"]*(")/, img);
  set(/(<meta property="og:image:alt" content=")[^"]*(")/, `${title}, with the moon's phase that day`);
  set(/(<title>)[^<]*(<\/title>)/, `${title} · Moon`);
  return html;
}

export async function GET(request) {
  const url = new URL(request.url);
  try {
    const page = await fetch(new URL('/night', url.origin));
    if (!page.ok) throw new Error('page ' + page.status);
    return new Response(previewTags(await page.text(), url.searchParams), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=86400' } });
  } catch (e) {
    return new Response('', { status: 302, headers: { Location: '/night' } });
  }
}
