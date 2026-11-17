/**
 * Where a linked file lives says a lot about whether it can be anyone's original.
 *   library    public image libraries and stock sites: almost certainly not the signer's own work
 *   anonymous  image hosts anyone can upload to without a name: origin can't be shown
 *   social     social and community sites: anyone can post anything there
 * Known sites are mapped below. Any other site is classified from its own home page (title, description,
 * keywords), so a new image host or social network is caught without being on the list.
 */
import { safeUrl, type Lookup } from './filecheck.js';

export type HostKind = 'library' | 'anonymous' | 'social';
export interface HostClass { kind: HostKind; name: string; by: 'list' | 'site' }

const D = (k: HostKind, name: string, ...domains: string[]) => domains.map((d) => [d, k, name] as const);
export const KNOWN_HOSTS: readonly (readonly [string, HostKind, string])[] = [
  // Public libraries, stock and wallpaper sites
  ...D('library', 'Wikimedia Commons', 'wikimedia.org', 'wikipedia.org', 'wikiart.org'),
  ...D('library', 'Unsplash', 'unsplash.com'), ...D('library', 'Pexels', 'pexels.com'), ...D('library', 'Pixabay', 'pixabay.com'),
  ...D('library', 'Flickr', 'flickr.com', 'staticflickr.com'), ...D('library', 'Getty Images', 'gettyimages.com', 'istockphoto.com', 'gettyimages.co.uk'),
  ...D('library', 'Shutterstock', 'shutterstock.com'), ...D('library', 'Alamy', 'alamy.com'), ...D('library', 'Adobe Stock', 'stock.adobe.com', 'adobestock.com', 'ftcdn.net'),
  ...D('library', 'NASA', 'nasa.gov'), ...D('library', 'the Internet Archive', 'archive.org'), ...D('library', 'Google image results', 'googleusercontent.com', 'gstatic.com'),
  ...D('library', 'a stock library', 'dreamstime.com', 'depositphotos.com', '123rf.com', 'freepik.com', 'vecteezy.com', 'canva.com', 'stocksnap.io', 'burst.shopify.com', 'rawpixel.com', 'pikwizard.com', 'kaboompics.com', 'picjumbo.com', 'gratisography.com', 'stockvault.net', 'freeimages.com', 'pxhere.com', 'publicdomainpictures.net', 'wallhaven.cc', 'wallpaperaccess.com', 'wallpapercave.com', 'wallpaperflare.com', 'hdqwalls.com', 'wall.alphacoders.com', 'alphacoders.com', 'bing.com', 'yimg.com', 'duckduckgo.com'),
  // Anonymous image and file hosts
  ...D('anonymous', 'ImgBB', 'imgbb.com', 'ibb.co'), ...D('anonymous', 'Imgur', 'imgur.com'), ...D('anonymous', 'Postimages', 'postimages.org', 'postimg.cc'),
  ...D('anonymous', 'an anonymous image host', 'imgbox.com', 'catbox.moe', 'litterbox.catbox.moe', 'pixhost.to', 'freeimage.host', 'iili.io', 'imagebam.com', 'imagevenue.com', 'imgpile.com', 'vgy.me', 'snipboard.io', 'prnt.sc', 'prntscr.com', 'gyazo.com', 'imageshack.com', 'photobucket.com', 'tinypic.com', 'imgchest.com', 'imgkk.com', 'imgsha.com', 'lensdump.com', 'imagetwist.com', 'pasteboard.co', 'picpaste.com', 'uploadhaven.com', 'tmpfiles.org', 'file.io', 'transfer.sh', 'filebin.net', '0x0.st', 'uguu.se', 'pomf.lain.la', 'telegra.ph', 'graph.org', 'imgflip.com', 'ifunny.co', 'tenor.com', 'giphy.com'),
  // Social and community sites
  ...D('social', 'X', 'twimg.com', 'x.com', 'twitter.com'), ...D('social', 'Instagram', 'instagram.com', 'cdninstagram.com'), ...D('social', 'Facebook', 'facebook.com', 'fbcdn.net', 'fbsbx.com'),
  ...D('social', 'Threads', 'threads.net'), ...D('social', 'TikTok', 'tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com'), ...D('social', 'Reddit', 'reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com'),
  ...D('social', 'Tumblr', 'tumblr.com'), ...D('social', 'Pinterest', 'pinterest.com', 'pinimg.com'), ...D('social', 'Bluesky', 'bsky.app', 'bsky.social'),
  ...D('social', 'Discord', 'discordapp.com', 'discordapp.net', 'discord.com'), ...D('social', 'Telegram', 'telegram.org', 't.me', 'telesco.pe'),
  ...D('social', 'LinkedIn', 'licdn.com', 'linkedin.com'), ...D('social', 'YouTube', 'ytimg.com', 'youtube.com'), ...D('social', 'VK', 'vk.com', 'userapi.com', 'vkuserphoto.ru'),
  ...D('social', 'Weibo', 'sinaimg.cn', 'weibo.com'), ...D('social', 'DeviantArt', 'deviantart.com', 'deviantart.net', 'wixmp.com'), ...D('social', 'ArtStation', 'artstation.com'),
  ...D('social', 'Behance', 'behance.net'), ...D('social', 'Dribbble', 'dribbble.com', 'dribbble.net'), ...D('social', '500px', '500px.com', '500px.org'),
  ...D('social', 'Mastodon', 'mastodon.social', 'files.mastodon.social', 'mstdn.social'), ...D('social', 'Snapchat', 'snapchat.com', 'sc-cdn.net'), ...D('social', 'Quora', 'quora.com', 'qph.cf2.quoracdn.net', 'quoracdn.net'),
  ...D('social', 'Medium', 'medium.com', 'miro.medium.com'), ...D('social', 'Substack', 'substack.com', 'substackcdn.com'), ...D('social', 'WhatsApp', 'whatsapp.net', 'whatsapp.com'),
  ...D('social', 'Civitai', 'civitai.com'), ...D('social', 'a social site', 'lemmy.world', 'vsco.co', 'ello.co', '9gag.com', 'newgrounds.com', 'pixiv.net', 'pximg.net', 'xiaohongshu.com', 'douyin.com'),
];

/** The site a host belongs to: the last two labels, or three under a country second level (example.co.uk). */
export function siteOf(host: string): string {
  const p = host.toLowerCase().replace(/\.$/, '').split('.');
  if (p.length <= 2) return p.join('.');
  const sld = p[p.length - 2];
  return (/^(co|com|net|org|gov|ac|edu|or|ne|go)$/.test(sld) && p[p.length - 1].length === 2 ? p.slice(-3) : p.slice(-2)).join('.');
}

export function knownHost(host: string): HostClass | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  let best: (typeof KNOWN_HOSTS)[number] | null = null;
  for (const e of KNOWN_HOSTS) if ((h === e[0] || h.endsWith('.' + e[0])) && (!best || e[0].length > best[0].length)) best = e;
  return best ? { kind: best[1], name: best[2], by: 'list' } : null;
}

const SIGNALS: [HostKind, RegExp, number][] = [
  ['anonymous', /\b(image|photo|picture|img|file) ?(hosting|host|uploader|upload)\b/, 3],
  ['anonymous', /\bupload (your )?(images?|photos?|pictures?|files?|screenshots?)\b/, 3],
  ['anonymous', /\b(free|anonymous|instant) (image|photo|file) (hosting|sharing|upload)/, 3],
  ['anonymous', /\b(direct|share|embed|bbcode|hotlink) links?\b/, 1], ['anonymous', /\bdrag (and|&) drop\b/, 1], ['anonymous', /\bno (sign ?up|registration|account)\b/, 1],
  ['anonymous', /\bscreenshot\b/, 1], ['anonymous', /\bpaste (an )?image\b/, 2],
  ['social', /\bsocial (network|media|platform)\b/, 3], ['social', /\b(follow|followers|following)\b/, 1], ['social', /\b(community|communities|forum|subreddit)\b/, 1],
  ['social', /\b(share|post) (your )?(photos?|art|artwork|work|moments)\b/, 2], ['social', /\b(connect|chat) with (friends|people|creators)\b/, 2],
  ['social', /\bjoin (the )?(conversation|community|millions)\b/, 2], ['social', /\b(memes?|viral|trending)\b/, 1],
  ['library', /\b(stock|royalty[- ]free|free to use|public domain|creative commons|cc0)\b/, 3], ['library', /\b(wallpapers?|backgrounds?) (hd|4k|free|download)\b/, 3],
  ['library', /\b(free (photos?|images?|pictures?|vectors?))\b/, 2], ['library', /\bdownload (free|hd|high[- ]resolution)\b/, 2],
];

/** Classify a site from the words it uses about itself. Needs a clear signal; most personal sites score nothing. */
export function classifyText(text: string): HostKind | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  const score: Record<HostKind, number> = { library: 0, anonymous: 0, social: 0 };
  for (const [k, re, w] of SIGNALS) if (re.test(t)) score[k] += w;
  const best = (Object.keys(score) as HostKind[]).sort((a, b) => score[b] - score[a])[0];
  return score[best] >= 3 ? best : null;
}

/** The words a home page uses about itself: title, description, keywords, site name, first heading. */
export function selfDescription(html: string): string {
  const pick = (re: RegExp) => (re.exec(html)?.[1] ?? '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
    .filter((m) => /(name|property)=["'](description|keywords|og:title|og:description|og:site_name|twitter:title|twitter:description|application-name)["']/i.test(m))
    .map((m) => /content=["']([^"']*)["']/i.exec(m)?.[1] ?? '');
  return [pick(/<title[^>]*>([^<]{0,300})/i), ...metas, pick(/<h1[^>]*>([^<]{0,200})/i)].join(' · ').slice(0, 2000);
}

const cache = new Map<string, { at: number; v: HostClass | null }>();
/** Known list first; otherwise read the site's home page (capped, safe fetch) and classify it. Cached a day per site. */
export async function classifyHost(host: string, opts: { fetch?: typeof fetch; lookup?: Lookup } = {}): Promise<HostClass | null> {
  const k = knownHost(host); if (k) return k;
  const site = siteOf(host), hit = cache.get(site);
  if (hit && Date.now() - hit.at < 864e5) return hit.v;
  const f = opts.fetch ?? fetch;
  let v: HostClass | null = null;
  for (const h of host === site ? [site] : [host, site]) {
    try {
      let u = await safeUrl(`https://${h}/`, opts.lookup), r: Response | null = null;
      for (let hop = 0; hop < 4; hop++) {              // follow redirects by hand, checking every address
        r = await f(u.toString(), { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Moon file check (+https://moon369.org/sign)', Accept: 'text/html' } });
        const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
        if (!loc) break;
        u = await safeUrl(new URL(loc, u).toString(), opts.lookup);
      }
      if (!r) continue;
      if (!r.ok || !/html/i.test(r.headers.get('content-type') || '') || !r.body) continue;
      const reader = r.body.getReader(), parts: Uint8Array[] = []; let n = 0;
      while (n < 200_000) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.byteLength; }
      await reader.cancel().catch(() => {});
      const html = new TextDecoder().decode(Buffer.concat(parts.map((p) => Buffer.from(p))));
      const desc = selfDescription(html), kind = classifyText(desc);
      if (kind) { const name = (/<title[^>]*>([^<]{1,80})/i.exec(html)?.[1] ?? site).split(/[|·—–-]/)[0].trim() || site; v = { kind, name, by: 'site' }; break; }
      if (desc.trim()) break;          // the site describes itself and it isn't a host: done
    } catch { /* unreachable: try the next */ }
  }
  cache.set(site, { at: Date.now(), v });
  return v;
}
