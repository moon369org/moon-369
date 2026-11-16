/**
 * Moon Capture: sign photos and video at the moment of capture.
 *
 * capture() does three things to a freshly captured file, on your server:
 *   1. Signs its fingerprint on Moon: a Moonmark receipt, registered under your app's name.
 *   2. Writes C2PA Content Credentials into the file ("created by this app, a digital capture"),
 *      with that Moonmark receipt inside as the assertion "org.moon369.moonmark".
 *   3. Has Moon's RFC 3161 Time-Stamp Authority timestamp the credentials' signature.
 * verify() reads it all back from any copy of the file.
 *
 * The C2PA signature uses YOUR certificate: production content credentials need a claim signing
 * certificate from a CA on the C2PA Trust List. Moon adds the time and the public record.
 */
import { createHash, createPrivateKey, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { Builder, Reader } from '@contentauth/c2pa-node';
import { verify as verifyReceipt, fetchKeys, type Receipt, type KeySet } from 'moon369';

export const MOON_API = 'https://api.moon369.org';
/** The C2PA assertion that carries the Moonmark receipt. */
export const MOON_ASSERTION = 'org.moon369.moonmark';
export const CAPTURE_SPEC = 'moon-capture/1';
/** IPTC digital source types (what C2PA uses to say how media was made). */
export const SOURCE = {
  capture: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
  computational: 'http://cv.iptc.org/newscodes/digitalsourcetype/computationalCapture',
  ai: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  aiEdited: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
} as const;

export type SigningAlg = 'es256' | 'es384' | 'es512' | 'ps256' | 'ps384' | 'ps512' | 'ed25519';
type Bytes = Uint8Array | Buffer;

export interface C2paSigner {
  /** Your certificate chain, PEM: your signing certificate first, then intermediates. */
  certChainPem: string | Bytes;
  /** Your private key, PEM. Or leave it out and pass `sign` (an HSM, a KMS, a remote signer). */
  privateKeyPem?: string | Bytes;
  /** Signs the bytes and returns a raw signature (r||s for ECDSA). Used instead of privateKeyPem. */
  sign?: (data: Uint8Array) => Promise<Uint8Array>;
  /** Defaults to es256. */
  alg?: SigningAlg;
}

export interface CaptureOptions {
  /** The file's MIME type, like image/jpeg, image/png, video/mp4. */
  mimeType: string;
  /** Your C2PA signing certificate and key. */
  signer: C2paSigner;
  /** Your Moon API key: registers the capture under your (verified) name. Without it, captures are anonymous. */
  moonKey?: string;
  /** Your app, as it appears in the credentials. */
  app?: { name: string; version?: string };
  /** A file name or note, recorded with the registration (shown publicly only for verified names). */
  label?: string;
  /** Who captured it, as you state it, for example the photographer. */
  onBehalfOf?: string;
  /** How the media was made. Defaults to a digital capture. Use SOURCE.ai for generated media: honesty is the point. */
  sourceType?: string;
  /** The image's 64-bit look-alike hash (hex), so edited copies can be found. Computed with sharp when it's installed. */
  phash?: string | false;
  /** Extra C2PA assertions to add, like stds.exif or c2pa.location. */
  assertions?: { label: string; data: unknown }[];
  /** Moon's API. Defaults to https://api.moon369.org. */
  api?: string;
  /** Timestamp the credentials with Moon's RFC 3161 TSA. Default true. */
  moonTimestamp?: boolean;
}

export interface CaptureResult {
  /** The file with Content Credentials written in. */
  bytes: Buffer;
  /** SHA-256 of the file as captured, before the credentials were added. This is what the Moonmark receipt signs. */
  sha256: string;
  moonmark: string;
  receipt: Receipt;
  /** A link anyone can open to check the signed Moonmark. */
  signedUrl: string;
  registration: { registrant: string; registrant_verified: boolean } | null;
  phash: string | null;
}

const sha256 = (b: Bytes) => createHash('sha256').update(b).digest('hex');
const asBuf = (x: string | Bytes) => (typeof x === 'string' ? Buffer.from(x) : Buffer.from(x));

/**
 * Moon's look-alike hash (v2), the same as moon369.org/verify and the sign page compute: the picture drawn on black
 * at up to 1024 px, averaged over exact 9×8 blocks; each bit says whether a block is brighter than its right neighbour.
 * Needs the optional dependency sharp to decode images; without it, returns null.
 */
export async function lookAlikeHash(image: Bytes): Promise<string | null> {
  let sharp: ((b: Buffer) => any) | null = null;
  try { sharp = ((await import('sharp' as string)) as { default: (b: Buffer) => any }).default; } catch { return null; }
  if (!sharp) return null;
  try {
    const meta = await sharp(Buffer.from(image)).metadata();
    const w = meta.width as number, h = meta.height as number;
    if (!w || !h) return null;
    const s = Math.min(1, 1024 / Math.max(w, h)), W = Math.max(9, Math.round(w * s)), H = Math.max(8, Math.round(h * s));
    const px: Buffer = await sharp(Buffer.from(image)).flatten({ background: '#000000' }).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const g = new Float64Array(72), n = new Float64Array(72);
    for (let y = 0; y < H; y++) {
      const cy = Math.min(7, Math.floor((y * 8) / H));
      for (let x = 0; x < W; x++) { const c = cy * 9 + Math.min(8, Math.floor((x * 9) / W)), i = (y * W + x) * 3; g[c] += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; n[c]++; }
    }
    let bits = '';
    for (let y = 0; y < 8; y++) for (let k = 0; k < 8; k++) bits += g[y * 9 + k] / n[y * 9 + k] > g[y * 9 + k + 1] / n[y * 9 + k + 1] ? '1' : '0';
    let out = ''; for (let q = 0; q < 64; q += 4) out += parseInt(bits.slice(q, q + 4), 2).toString(16);
    return out;
  } catch { return null; }
}

function signWith(alg: SigningAlg, key: KeyObject) {
  return async (data: Uint8Array): Promise<Uint8Array> => {
    if (alg === 'ed25519') return cryptoSign(null, data, key);
    const h = alg.endsWith('384') ? 'sha384' : alg.endsWith('512') ? 'sha512' : 'sha256';
    if (alg.startsWith('ps')) return cryptoSign(h, data, { key, padding: 6 /* RSA_PKCS1_PSS_PADDING */, saltLength: h === 'sha256' ? 32 : h === 'sha384' ? 48 : 64 });
    return cryptoSign(h, data, { key, dsaEncoding: 'ieee-p1363' });
  };
}

async function moonSign(api: string, body: Record<string, unknown>, moonKey?: string) {
  const r = await fetch(api + '/v1/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(moonKey ? { Authorization: 'Bearer ' + moonKey } : {}) },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as { receipt?: Receipt; signed_url?: string; registration?: CaptureResult['registration']; error?: { message?: string } };
  if (!r.ok || !j.receipt) throw new Error('Moon could not sign the capture: ' + (j.error?.message ?? 'HTTP ' + r.status));
  return j as { receipt: Receipt; signed_url: string; registration: CaptureResult['registration'] };
}

/** Sign a file at capture: a Moonmark receipt, then C2PA Content Credentials timestamped by Moon. */
export async function capture(file: Bytes, opts: CaptureOptions): Promise<CaptureResult> {
  const api = (opts.api ?? MOON_API).replace(/\/$/, '');
  const original = Buffer.from(file), fingerprint = sha256(original);
  const phash = opts.phash === false ? null : opts.phash ?? (/^image\//.test(opts.mimeType) ? await lookAlikeHash(original) : null);

  // 1. The Moonmark: when this exact capture existed, and who registered it.
  const m = await moonSign(api, { sha256: fingerprint, ...(opts.label ? { label: opts.label } : {}), ...(opts.onBehalfOf ? { on_behalf_of: opts.onBehalfOf } : {}), ...(phash ? { phash } : {}) }, opts.moonKey);

  // 2. The Content Credentials, with the receipt inside.
  const builder = await Builder.withJsonAsync({
    claim_generator_info: [{ name: opts.app?.name ?? 'Moon Capture', version: opts.app?.version ?? '0.1.0' }],
    format: opts.mimeType,
    ...(opts.label ? { title: opts.label } : {}),
    assertions: [
      { label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.created', digitalSourceType: opts.sourceType ?? SOURCE.capture, when: new Date(Number(BigInt(m.receipt.unix_ns) / 1_000_000n)).toISOString() }] } },
      { label: MOON_ASSERTION, data: {
        spec: CAPTURE_SPEC,
        about: 'A signed Moonmark: Moon signed the SHA-256 of this file as captured, before these Content Credentials were added. Check it at signed_url or with the moon369 package.',
        captured: { sha256: fingerprint, ...(phash ? { phash } : {}) },
        moonmark: m.receipt.moonmark,
        receipt: m.receipt,
        signed_url: m.signed_url,
        registration: m.registration ?? null,
      } },
      ...(opts.assertions ?? []),
    ],
  } as never);

  // 3. Sign with your certificate; Moon's TSA timestamps the signature.
  const alg = opts.signer.alg ?? 'es256';
  const signFn = opts.signer.sign ?? (opts.signer.privateKeyPem ? signWith(alg, createPrivateKey(asBuf(opts.signer.privateKeyPem))) : null);
  if (!signFn) throw new Error('signer needs privateKeyPem or sign');
  const out = { buffer: null as Buffer | null };
  await builder.signConfigAsync(async (data: Buffer) => Buffer.from(await signFn(new Uint8Array(data))), {
    alg, certs: [asBuf(opts.signer.certChainPem)], reserveSize: 20_000, directCoseHandling: false,
    ...(opts.moonTimestamp === false ? {} : { tsaUrl: api + '/v1/tsa', ...(opts.moonKey ? { tsaHeaders: [['Authorization', 'Bearer ' + opts.moonKey]] as [string, string][] } : {}) }),
  }, { buffer: original, mimeType: opts.mimeType }, out);
  if (!out.buffer) throw new Error('C2PA signing produced no output');
  return { bytes: out.buffer, sha256: fingerprint, moonmark: m.receipt.moonmark, receipt: m.receipt, signedUrl: m.signed_url, registration: m.registration ?? null, phash };
}

export interface VerifyReport {
  /** Does the file carry Content Credentials at all? */
  hasCredentials: boolean;
  credentials: null | {
    /** C2PA's own verdict: the signature, hashes and timestamp all check out. */
    valid: boolean;
    /** Signed with a certificate the validator trusts (the C2PA Trust List). False for test certificates. */
    trusted: boolean;
    signedBy: string | null;
    issuer: string | null;
    app: string | null;
    sourceType: string | null;
    /** Credentials changed or broken: list of C2PA failure codes. */
    failures: string[];
  };
  moon: null | {
    /** Moon's TSA timestamped the credentials' signature (by the name the timestamp carries; the Moonmark receipt is the signed proof). */
    timestamped: boolean;
    /** The time-stamp authority the credentials name, whoever it is. */
    timestampAuthority: string | null;
    timestampedAt: string | null;
    /** The Moonmark receipt inside the credentials verifies with Moon's keys. */
    receiptValid: boolean;
    receiptReason?: string;
    moonmark: string;
    signedUrl: string | null;
    /** Who registered the capture on Moon, from Moon's public registry (null if offline). */
    registeredBy: { name: string; verified: boolean } | null;
  };
  summary: string;
}

/** Read the Content Credentials and Moon's proof back from any copy of the file. */
export async function verify(file: Bytes, opts: {
  mimeType?: string; api?: string; keys?: KeySet; offline?: boolean;
  /** The name Moon's TSA signs with. Defaults to Moon's production TSA. */
  tsaName?: RegExp;
} = {}): Promise<VerifyReport> {
  const api = (opts.api ?? MOON_API).replace(/\/$/, '');
  const reader = await Reader.fromAsset({ buffer: Buffer.from(file), ...(opts.mimeType ? { mimeType: opts.mimeType } : {}) } as never).catch(() => null);
  if (!reader) return { hasCredentials: false, credentials: null, moon: null, summary: 'No Content Credentials in this file.' };
  const store = reader.json() as any;
  const active = store.manifests?.[store.active_manifest];
  const results = store.validation_results?.activeManifest ?? {};
  const failures: string[] = (results.failure ?? []).map((f: { code: string }) => f.code);
  const success: { code: string; explanation?: string }[] = results.success ?? [];
  const trusted = !failures.includes('signingCredential.untrusted');
  const realFailures = failures.filter((c) => c !== 'signingCredential.untrusted');
  const actions = (active?.assertions ?? []).find((a: { label: string }) => /^c2pa\.actions/.test(a.label))?.data?.actions ?? [];
  const created = actions.find((a: { action: string }) => a.action === 'c2pa.created');
  const credentials = {
    valid: realFailures.length === 0 && store.validation_state !== 'Invalid',
    trusted, signedBy: active?.signature_info?.common_name ?? null, issuer: active?.signature_info?.issuer ?? null,
    app: active?.claim_generator_info?.[0]?.name ?? active?.claim_generator ?? null,
    sourceType: created?.digitalSourceType ?? null, failures,
  };

  const moonA = (active?.assertions ?? []).find((a: { label: string }) => a.label === MOON_ASSERTION)?.data;
  const tsaAll = success.find((s) => s.code === 'timeStamp.validated');
  const tsaBy = tsaAll ? (/matched: (.+)$/.exec(tsaAll.explanation ?? '')?.[1] ?? null) : null;
  const tsa = tsaBy && (opts.tsaName ?? /^Moon Timestamp Authority$/).test(tsaBy) ? tsaAll : undefined;
  let moon: VerifyReport['moon'] = null;
  if (moonA || tsa) {
    let receiptValid = false, receiptReason: string | undefined, registeredBy: { name: string; verified: boolean } | null = null;
    if (moonA?.receipt) {
      try {
        const keys = opts.keys ?? (opts.offline ? undefined : await fetchKeys(api + '/v1/keys'));
        const v = await verifyReceipt(moonA.receipt, { keys, sha256: moonA.captured?.sha256 });
        receiptValid = v.valid; if (!v.valid) receiptReason = v.reason;
      } catch (e) { receiptReason = 'could_not_check: ' + (e as Error).message; }
      if (!opts.offline && moonA.receipt.sha256) {
        try {
          const lk = (await (await fetch(api + '/v1/lookup/' + moonA.receipt.sha256)).json()) as { first?: { registrant: string; registrant_verified: boolean } | null };
          if (lk.first) registeredBy = { name: lk.first.registrant, verified: lk.first.registrant_verified };
        } catch { /* offline */ }
      }
    }
    moon = { timestamped: !!tsa, timestampAuthority: tsaBy, timestampedAt: tsa ? active?.signature_info?.time ?? null : null, receiptValid, ...(receiptReason ? { receiptReason } : {}),
      moonmark: moonA?.moonmark ?? '', signedUrl: moonA?.signed_url ?? null, registeredBy };
  }
  const what = credentials.sourceType === SOURCE.capture ? 'a camera capture' : credentials.sourceType === SOURCE.ai ? 'AI-generated' : credentials.sourceType === SOURCE.aiEdited ? 'edited with AI' : 'media';
  const summary = !credentials.valid ? 'Content Credentials are present but do not check out: the file was changed after signing, or the credentials are broken.'
    : `Content Credentials check out${credentials.trusted ? '' : ' (signed with a certificate not on the C2PA Trust List)'}: ${what}${credentials.app ? ' from ' + credentials.app : ''}.` +
      (moon?.receiptValid ? ` Signed on Moon at ${moon.moonmark}${moon.registeredBy ? ', registered by ' + moon.registeredBy.name + (moon.registeredBy.verified ? ' (verified)' : ' (not verified)') : ''}.` : '') +
      (moon?.timestamped ? ' Timestamped by Moon.' : '');
  return { hasCredentials: true, credentials, moon, summary };
}

