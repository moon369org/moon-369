import { describe, it, expect } from 'vitest';
import { leafHash, merkleRoot, inclusionProof, verifyInclusion } from '../src/merkle';

describe('merkle (RFC 9162)', () => {
  it('matches the RFC 6962 reference vectors', () => {
    // Known test vector from the Certificate Transparency reference implementation.
    expect(merkleRoot([])).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(leafHash(new Uint8Array(0))).toBe('6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d');
    const data = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'];
    const leaves = data.map((d) => leafHash(new Uint8Array(Buffer.from(d, 'hex'))));
    expect(merkleRoot(leaves)).toBe('5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328');
    expect(merkleRoot(leaves.slice(0, 7))).toBe('ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c');
  });
  it('every inclusion proof verifies, and tampering fails', () => {
    for (let n = 1; n <= 40; n++) {
      const leaves = Array.from({ length: n }, (_, i) => leafHash(new Uint8Array([i, n])));
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        const p = inclusionProof(i, leaves);
        expect(verifyInclusion(leaves[i], i, n, p, root)).toBe(true);
        if (n > 1) expect(verifyInclusion(leaves[(i + 1) % n], i, n, p, root)).toBe(false);
      }
    }
  });
});
