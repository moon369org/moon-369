import { describe, it, expect } from 'vitest';
import { knownHost, classifyText, classifyHost, selfDescription, siteOf } from '../src/hosts';

const pub = async () => ['93.184.216.34'];
const page = (html: string) => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('where a file lives', () => {
  it('knows the common hosts, CDNs included', () => {
    expect(knownHost('i.ibb.co')).toMatchObject({ kind: 'anonymous', name: 'ImgBB' });
    expect(knownHost('i.imgur.com')).toMatchObject({ kind: 'anonymous', name: 'Imgur' });
    expect(knownHost('pbs.twimg.com')).toMatchObject({ kind: 'social', name: 'X' });
    expect(knownHost('scontent-lax3-1.cdninstagram.com')).toMatchObject({ kind: 'social', name: 'Instagram' });
    expect(knownHost('i.redd.it')).toMatchObject({ kind: 'social', name: 'Reddit' });
    expect(knownHost('upload.wikimedia.org')).toMatchObject({ kind: 'library' });
    expect(knownHost('janedoe-art.com')).toBeNull();
    expect(knownHost('notimgur.com')).toBeNull();
    expect(siteOf('cdn.photos.example.co.uk')).toBe('example.co.uk');
  });
  it('reads what an unknown site says about itself', () => {
    expect(classifyText('PicDrop · Free Image Hosting · Upload images and get direct links. No sign up.')).toBe('anonymous');
    expect(classifyText('Glimmer · A social network to share your photos with friends and followers')).toBe('social');
    expect(classifyText('FreeWalls · Download free HD wallpapers and royalty-free backgrounds')).toBe('library');
    expect(classifyText('Jane Doe · Oil paintings and commissions · Portfolio')).toBeNull();
    expect(selfDescription('<html><head><title>PicDrop</title><meta name="description" content="Free image hosting"></head>')).toContain('Free image hosting');
  });
  it('classifies a new host from its home page, following a safe redirect', async () => {
    const f = (async (u: string) => u === 'https://img.newhost.example/' ? new Response(null, { status: 301, headers: { location: 'https://newhost.example/' } })
      : u === 'https://newhost.example/' ? page('<title>NewHost - Free Image Hosting</title><meta name="description" content="Upload your images instantly, drag and drop, get share links.">')
      : new Response('no', { status: 404 })) as typeof fetch;
    expect(await classifyHost('img.newhost.example', { fetch: f, lookup: pub })).toEqual({ kind: 'anonymous', name: 'NewHost', by: 'site' });
  });
  it('leaves a personal site alone', async () => {
    const f = (async () => page('<title>Mara Lind — Photography</title><meta name="description" content="Landscape photographer based in Oslo.">')) as typeof fetch;
    expect(await classifyHost('maralind.example', { fetch: f, lookup: pub })).toBeNull();
  });
});
