// Make a customer API key.
//   node scripts/new-key.mjs "Acme Clocks" pro 1000
// Prints the key (give it to the customer once; it is not stored) and the entry to add to MOON_API_KEYS in Vercel.
import { createHash, randomBytes } from 'node:crypto';

const [owner = 'customer', plan = 'pro', perMin = '1000'] = process.argv.slice(2);
const key = 'moon_' + randomBytes(24).toString('base64url');
const hash = createHash('sha256').update(key, 'utf8').digest('hex');
const entry = { owner, plan, per_min: Number(perMin), active: true, created: new Date().toISOString().slice(0, 10) };

console.log('\nAPI key (send to the customer, store nowhere else):\n\n  ' + key + '\n');
console.log('Add this line inside the MOON_API_KEYS JSON object in Vercel:\n\n  ' + JSON.stringify(hash) + ': ' + JSON.stringify(entry) + '\n');
