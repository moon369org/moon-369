#!/usr/bin/env node
// Sign AI output on Moon the moment it's generated: proof of exactly what a model produced, and when.
// Zero dependencies, Node 18+. Only SHA-256 fingerprints leave your machine.
//
//   node sign-output.mjs image.png --model "my-image-model v2"           # a file your generator wrote
//   your-llm "prompt" | node sign-output.mjs --model gpt-x --out answer.txt   # text on stdin, saved exactly as signed
//   node sign-output.mjs answer.txt --model gpt-x --prompt prompt.txt         # also bind the prompt that made it
//
// Writes <output>.moonmark.json: the output's receipt, plus a manifest (model, prompt fingerprint, output
// fingerprint) that is itself signed, so the model and prompt can't be swapped later. Prints the proof link.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const API = process.env.MOON_API || 'https://api.moon369.org';
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const model = opt('model'), promptFile = opt('prompt'), outFile = opt('out'), key = opt('key') || process.env.MOON_KEY;
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function sign(sha256, label) {
  const r = await fetch(API + '/v1/sign', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
    body: JSON.stringify({ sha256, ...(label ? { label: label.slice(0, 120) } : {}) }) });
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error?.message || 'Moon returned ' + r.status);
  return b;
}

let bytes, name = args[0];
if (name) bytes = await readFile(name);
else {
  const chunks = []; for await (const c of process.stdin) chunks.push(c); bytes = Buffer.concat(chunks);
  name = outFile || 'output.txt'; await writeFile(name, bytes);   // keep the exact bytes that were signed
}
const label = `AI-generated${model ? ' by ' + model : ''}: ${basename(name)}`;
const output = await sign(sha(bytes), label);

// The manifest ties model and prompt to this exact output. Its fingerprint is signed too.
const manifest = { moon: 'ai-output/1', output: { file: basename(name), sha256: output.receipt.sha256 }, model: model ?? null,
  prompt_sha256: promptFile ? sha(await readFile(promptFile)) : null, receipt_moonmark: output.receipt.moonmark };
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
const sealed = await sign(sha(manifestBytes), `AI output manifest: ${basename(name)}`);

await writeFile(name + '.moonmark.json', JSON.stringify({ output: output.receipt, signed_url: output.signed_url, manifest, manifest_receipt: sealed.receipt }, null, 2) + '\n');
await writeFile(name + '.manifest.json', manifestBytes);
console.log(`Signed ${basename(name)} at ${output.receipt.moonmark.slice(0, 19)} (Moon time)\n${output.signed_url}`);
