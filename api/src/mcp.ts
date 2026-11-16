// Moon over the Model Context Protocol, so AI assistants (Claude, ChatGPT, Cursor and others) can use it.
// Streamable HTTP, stateless: POST /mcp with a JSON-RPC message, get one JSON response back.
// Each tool calls the same API inside, with the caller's Authorization and address, so limits and
// keys work exactly as they do over HTTP.
import type { Env } from './index.js';

type Handle = (req: Request, env: Env) => Promise<Response>;
type Json = Record<string, unknown>;

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'moon', title: 'Moon', version: '1.0.0', websiteUrl: 'https://moon369.org' };
const INSTRUCTIONS =
  'Moon is a worldwide timestamp locked to the moon, with a 13-moon calendar (cycle, moon, lune). ' +
  'Use these tools for: Moon time for any moment; what the moon looked like on any date (phase, light, rise and set needs a place on moon369.org/night); ' +
  'every solar eclipse from 2000 BCE to 3000 CE; and signed timestamps (Moonmarks) for a file\'s SHA-256 fingerprint. ' +
  'Never send file contents: only the 64-character hex SHA-256.';

interface Tool { name: string; title: string; description: string; inputSchema: Json; annotations?: Json; call: (a: Json) => { method: 'GET' | 'POST'; path: string; body?: Json } }
const s = (description: string, extra: Json = {}) => ({ type: 'string', description, ...extra });

const TOOLS: Tool[] = [
  {
    name: 'moon_time', title: 'Moon time for a moment',
    description: 'Convert a moment to Moon time: the Moonmark, cycle, moon and lune. Leave "utc" out for right now.',
    inputSchema: { type: 'object', properties: { utc: s('ISO 8601 moment with Z or an offset, e.g. 2026-11-15T21:30:00Z') } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => a.utc ? { method: 'GET', path: '/v1/convert?utc=' + encodeURIComponent(String(a.utc)) } : { method: 'GET', path: '/v1/now' },
  },
  {
    name: 'moon_on_date', title: 'The moon on a date',
    description: 'What the moon looked like on any date from the year 1000 to 2999: phase, how much was lit, its Moon date, the year the same moon returns to that date, and any solar eclipse that day. Includes a share card image and a page link.',
    inputSchema: {
      type: 'object', required: ['date'],
      properties: {
        date: s('Local date, YYYY-MM-DD', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        time: s('Local time, HH:MM (24-hour). Optional; midday if left out.'),
        utc_offset: s('UTC offset at that place on that date, e.g. -07:00. Optional; UTC if left out.'),
        occasion: { type: 'string', enum: ['day', 'born', 'met', 'wed', 'kid'], description: 'What happened, for the card title. Optional.' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => {
      const q = new URLSearchParams({ d: String(a.date) });
      if (a.time) q.set('t', String(a.time).replace(':', ''));
      if (a.utc_offset) q.set('z', String(a.utc_offset).replace(':', ''));
      if (a.occasion) q.set('for', String(a.occasion));
      return { method: 'GET', path: '/v1/night?' + q.toString() };
    },
  },
  {
    name: 'next_solar_eclipse', title: 'Next solar eclipse',
    description: 'The next solar eclipse after now (or after a given moment), optionally of one type. Returns its date, type, saros, Moon time, an icon and a page link.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['total', 'annular', 'hybrid', 'partial'] }, after: s('ISO 8601 moment to search after. Optional.') } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => {
      const q = new URLSearchParams();
      if (a.type) q.set('type', String(a.type));
      if (a.after) { const ms = Date.parse(String(a.after)); if (!Number.isNaN(ms)) q.set('after', String(ms)); }
      return { method: 'GET', path: '/v1/eclipses/next' + (q.toString() ? '?' + q : '') };
    },
  },
  {
    name: 'solar_eclipse_on', title: 'Solar eclipse on a date',
    description: 'Details of the solar eclipse on a date (YYYY-MM-DD; before year 1 use -YYYY-MM-DD, e.g. -0584-05-28), with its saros series and the eclipses before and after. Errors if there was none that day.',
    inputSchema: { type: 'object', required: ['date'], properties: { date: s('YYYY-MM-DD, Terrestrial Time as NASA lists eclipses') } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => ({ method: 'GET', path: '/v1/eclipses/' + encodeURIComponent(String(a.date)) }),
  },
  {
    name: 'list_solar_eclipses', title: 'List solar eclipses',
    description: 'Solar eclipses between two years (from -1999 to 3000), optionally of some types. Up to 100 per call.',
    inputSchema: {
      type: 'object', required: ['from_year', 'to_year'],
      properties: { from_year: { type: 'integer' }, to_year: { type: 'integer' }, type: s('total, annular, hybrid or partial; comma-separated for several. Optional.') },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => {
      const q = new URLSearchParams({ from: String(a.from_year), to: String(a.to_year), limit: '100' });
      if (a.type) q.set('type', String(a.type));
      return { method: 'GET', path: '/v1/eclipses?' + q.toString() };
    },
  },
  {
    name: 'make_event_link', title: 'Make an event link',
    description: 'Make one link for an event that opens in everyone\'s own local time, with a live countdown, Add to calendar and a share card. Give the event name and its time as ISO 8601 with a Z or the organizer\'s UTC offset. Returns the link, a calendar file link, a Google Calendar link and an embeddable countdown snippet.',
    inputSchema: { type: 'object', required: ['name', 'utc'], properties: { name: s('What the event is called, up to 80 characters'), utc: s('When it starts: ISO 8601 with Z or an offset, e.g. 2026-12-04T19:00:00-07:00'), minutes: { type: 'integer', description: 'How long it lasts, for calendars (default 60)', minimum: 1, maximum: 10080 } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => ({ method: 'GET', path: '/v1/event?name=' + encodeURIComponent(String(a.name)) + '&utc=' + encodeURIComponent(String(a.utc)) + (a.minutes ? '&minutes=' + Number(a.minutes) : '') }),
  },
  {
    name: 'timestamp_fingerprint', title: 'Timestamp a file (Moonmark)',
    description: 'Make a signed, post-quantum timestamp (a Moonmark) for a file\'s SHA-256 fingerprint, proving the file existed now. Send only the 64-character hex SHA-256, never the file. Returns the receipt and a shareable link. Free signing is limited; an API key raises it.',
    inputSchema: {
      type: 'object', required: ['sha256'],
      properties: { sha256: s('64-character hex SHA-256 of the file', { pattern: '^[0-9a-fA-F]{64}$' }), label: s('A short label for the file. Optional.'), on_behalf_of: s('Who made the file, as you state it. Optional.') },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    call: (a) => ({ method: 'POST', path: '/v1/sign', body: { sha256: a.sha256, ...(a.label ? { label: a.label } : {}), ...(a.on_behalf_of ? { on_behalf_of: a.on_behalf_of } : {}) } }),
  },
  {
    name: 'lookup_fingerprint', title: 'Who registered a file',
    description: 'Is this file on Moon? Looks up a SHA-256 fingerprint and returns every registration: when, by whom (and whether Moon verified that name), and a link to the signed proof.',
    inputSchema: { type: 'object', required: ['sha256'], properties: { sha256: s('64-character hex SHA-256 of the file', { pattern: '^[0-9a-fA-F]{64}$' }) } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => ({ method: 'GET', path: '/v1/lookup/' + String(a.sha256).toLowerCase() }),
  },
  {
    name: 'verify_receipt', title: 'Verify a Moonmark receipt',
    description: 'Check a Moonmark receipt: its signatures (Ed25519 and ML-DSA-65), its drand beacon and, if you give it, that it matches a fingerprint.',
    inputSchema: { type: 'object', required: ['receipt'], properties: { receipt: { type: 'object', description: 'The receipt JSON as returned when signing' }, sha256: s('Optional fingerprint the receipt should cover') } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    call: (a) => ({ method: 'POST', path: '/v1/verify', body: { receipt: a.receipt, ...(a.sha256 ? { sha256: a.sha256 } : {}) } }),
  },
];

const ok = (id: unknown, result: Json) => ({ jsonrpc: '2.0', id, result });
const fail = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Mcp-Protocol-Version', 'Cache-Control': 'no-store' };

async function one(msg: Json, req: Request, env: Env, handle: Handle): Promise<Json | null> {
  const id = msg.id, method = msg.method as string;
  if (msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(id, -32600, 'Invalid request');
  if (id === undefined) return null;   // a notification (e.g. notifications/initialized): nothing to send back
  const params = (msg.params ?? {}) as Json;
  switch (method) {
    case 'initialize': {
      const asked = String(params.protocolVersion ?? '');
      return ok(id, { protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: TOOLS.map(({ call, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, 'Unknown tool: ' + String(params.name));
      const args = (params.arguments ?? {}) as Json;
      for (const r of ((tool.inputSchema.required as string[]) ?? [])) if (args[r] === undefined || args[r] === '') return ok(id, { isError: true, content: [{ type: 'text', text: `Missing "${r}".` }] });
      const c = tool.call(args);
      const fwd = new Headers();
      for (const h of ['authorization', 'x-real-ip', 'x-forwarded-for']) { const v = req.headers.get(h); if (v) fwd.set(h, v); }
      if (c.body) fwd.set('content-type', 'application/json');
      const base = new URL(req.url);
      const res = await handle(new Request(base.origin + c.path, { method: c.method, headers: fwd, body: c.body ? JSON.stringify(c.body) : undefined }), env);
      let data: unknown;
      try { data = await res.json(); } catch { data = { status: res.status }; }
      if (!res.ok) {
        const e = (data as { error?: { message?: string } }).error;
        return ok(id, { isError: true, content: [{ type: 'text', text: e?.message ?? `Moon answered ${res.status}` }] });
      }
      return ok(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data as Json });
    }
    default: return fail(id, -32601, 'Method not found: ' + method);
  }
}

export async function mcp(req: Request, env: Env, handle: Handle): Promise<Response> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    // No server-to-client stream: this server only answers requests.
    return new Response(JSON.stringify({ name: 'Moon MCP server', transport: 'streamable-http', endpoint: 'POST /mcp', tools: TOOLS.map((t) => t.name), docs: 'https://moon369.org/api#mcp' }),
      { status: 405, headers: { ...HEADERS, Allow: 'POST, OPTIONS' } });
  }
  if (req.method === 'DELETE') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST, OPTIONS' } });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST, OPTIONS' } });
  let body: unknown;
  try { const t = await req.text(); if (t.length > 65_536) throw new Error('large'); body = JSON.parse(t); }
  catch { return new Response(JSON.stringify(fail(null, -32700, 'Parse error')), { status: 400, headers: HEADERS }); }
  const msgs = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(msgs.map((m) => one((m ?? {}) as Json, req, env, handle)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: HEADERS });
  const pv = req.headers.get('mcp-protocol-version');
  return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { status: 200, headers: { ...HEADERS, ...(pv ? { 'Mcp-Protocol-Version': pv } : {}) } });
}
