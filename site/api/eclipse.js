// Serves /eclipse/<date> with link-preview tags for that eclipse, so a shared link shows its card.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NAME = { total: 'Total solar eclipse', annular: 'Annular solar eclipse', hybrid: 'Hybrid solar eclipse', partial: 'Partial solar eclipse' };
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function previewTags(html, date, type) {
  const m = /^(-?\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m || !NAME[type]) return html;
  const y = +m[1], when = `${+m[3]} ${MONTHS[+m[2] - 1]} ${y <= 0 ? (1 - y) + ' BCE' : y}`;
  const title = `${NAME[type]} · ${when}`;
  const desc = `The ${NAME[type].toLowerCase()} of ${when}: its exact moment, its saros family and its place in Moon time. One of 11,896 solar eclipses from 2000 BCE to 3000 CE.`;
  const pageUrl = `https://moon369.org/eclipse/${date}`;
  const img = `https://api.moon369.org/v1/eclipse.png?date=${date}&v=2`;
  const set = (re, val) => { html = html.replace(re, (_, a, b) => a + escAttr(val) + b); };
  set(/(<link rel="canonical" href=")[^"]*(")/, pageUrl);
  set(/(<meta property="og:url" content=")[^"]*(")/, pageUrl);
  set(/(<meta property="og:title" content=")[^"]*(")/, title);
  set(/(<meta name="twitter:title" content=")[^"]*(")/, title);
  set(/(<meta name="description" content=")[^"]*(")/, desc);
  set(/(<meta property="og:description" content=")[^"]*(")/, desc);
  set(/(<meta name="twitter:description" content=")[^"]*(")/, desc);
  set(/(<meta property="og:image" content=")[^"]*(")/, img);
  set(/(<meta name="twitter:image" content=")[^"]*(")/, img);
  set(/(<meta property="og:image:alt" content=")[^"]*(")/, `${title}, with an icon of the eclipse`);
  set(/(<title>)[^<]*(<\/title>)/, `${title} · Moon`);
  return html;
}

export async function GET(request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || '';
  try {
    const [page, info] = await Promise.all([fetch(new URL('/eclipse', url.origin)), fetch(`https://api.moon369.org/v1/eclipses/${encodeURIComponent(date)}`)]);
    if (!page.ok) throw new Error('page ' + page.status);
    const type = info.ok ? (await info.json()).type : null;
    return new Response(previewTags(await page.text(), date, type), { status: info.ok ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=86400' } });
  } catch (e) {
    return new Response('', { status: 302, headers: { Location: '/eclipses' } });
  }
}
