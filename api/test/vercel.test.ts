import { describe, it, expect } from 'vitest';
import { GET } from '../api/index';

describe('vercel entry', () => {
  it('serves the public path whether or not the rewrite adds /api', async () => {
    for (const path of ['/v1/spec', '/api/v1/spec']) {
      const r = await GET(new Request(`https://api.example.org${path}`));
      expect(r.status).toBe(200);
      expect(((await r.json()) as any).days_per_year).toBe(369);
    }
  });

  it('maps a bare /api to the index', async () => {
    const r = await GET(new Request('https://api.example.org/api'));
    expect(((await r.json()) as any).name).toBe('Moon API');
  });
});
