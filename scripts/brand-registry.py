#!/usr/bin/env python3
"""
Moon's brand registry: fingerprint every brand file, write the manifest, build the kit zip and the
batch-sign request. Run from the repo root after changing any file in site/assets/brand/.

  python3 scripts/brand-registry.py

Writes, in site/assets/brand/:
  moon-brand-manifest.json   every file with its SHA-256, size and look-alike hash
  sign-request.json          the body for POST /v1/sign/batch (statement, manifest, kit zip and every file)
and site/assets/Moon-Press-Kit.zip, built byte-for-byte the same every time so its fingerprint is stable.

Look-alike hashes (phash) come from /tmp/phash.json, made with the same code as embed/moon.js, so a
cropped or resized copy of a Moon image is found by /check too.
"""
import hashlib, json, os, zipfile

ROOT = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets')
BRAND = os.path.join(ROOT, 'brand')
ZIP = os.path.join(ROOT, 'Moon-Press-Kit.zip')
SKIP = {'moon-brand-manifest.json', 'sign-request.json', 'moon-brand-receipts.json', 'moonmarks.json'}

WHAT = {
    'logo': 'Wordmark', 'mark': 'Mark', 'app-icon': 'App icon', 'badges': 'Powered by Moon badge',
    'loader': 'Loader', 'social': 'Social image', 'colors': 'Colors',
}


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def files():
    out = []
    for d, _, names in os.walk(BRAND):
        for n in names:
            rel = os.path.relpath(os.path.join(d, n), BRAND).replace(os.sep, '/')
            if rel not in SKIP and n != '.DS_Store':
                out.append(rel)
    return sorted(out, key=lambda r: (r != 'MOON-BRAND-STATEMENT.md', r))


def main():
    try:
        phash = json.load(open('/tmp/phash.json'))
    except FileNotFoundError:
        phash = {}
    items = []
    for rel in files():
        p = os.path.join(BRAND, rel)
        kind = 'Brand statement' if rel.endswith('STATEMENT.md') else WHAT.get(rel.split('/')[0], 'Brand file')
        it = {'file': rel, 'what': kind, 'sha256': sha(p), 'bytes': os.path.getsize(p)}
        if rel in phash:
            it['phash'] = phash[rel]
        items.append(it)
    manifest = {
        'name': 'Moon brand manifest',
        'owner': 'Moon',
        'site': 'https://moon369.org/press',
        'statement': 'MOON-BRAND-STATEMENT.md',
        'policy': 'All rights reserved. No use without written permission from Moon, except news coverage of Moon and the unaltered Powered by Moon badge on sites and apps that use the Moon API.',
        'verify': 'https://api.moon369.org/v1/lookup/<sha256>',
        'files': items,
    }
    mpath = os.path.join(BRAND, 'moon-brand-manifest.json')
    with open(mpath, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')

    # The kit zip: same bytes every build (fixed dates, fixed order), so its fingerprint only changes when a file does.
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in files() + ['moon-brand-manifest.json']:
            info = zipfile.ZipInfo('Moon-Press-Kit/' + rel, date_time=(2026, 11, 15, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(os.path.join(BRAND, rel), 'rb') as f:
                z.writestr(info, f.read())

    sign = [{'sha256': sha(mpath), 'label': 'Moon brand manifest'},
            {'sha256': sha(ZIP), 'label': 'Moon press kit (zip)'}]
    for it in items:
        s = {'sha256': it['sha256'], 'label': f"Moon brand: {it['file']}"}
        if 'phash' in it:
            s['phash'] = it['phash']
        sign.append(s)
    with open(os.path.join(BRAND, 'sign-request.json'), 'w') as f:
        json.dump({'items': sign}, f, indent=1)
        f.write('\n')
    print(f'{len(items)} files, {len(sign)} to sign, manifest {sha(mpath)[:12]}, zip {sha(ZIP)[:12]} ({os.path.getsize(ZIP) // 1024} KB)')


if __name__ == '__main__':
    main()
