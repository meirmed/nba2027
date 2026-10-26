// EXTERNAL tool: every player's pick for every game -> CSV files (Excel) + one HTML page. Not part of the app / the admin panel.
// It reads Firestore with the Admin SDK, so it needs a service-account key (see docs/EXPORT_PREDICTIONS.md). Nothing is written to the database.
//
//   node scripts/export-predictions.mjs --key "C:\path\to\key.json"
//   node scripts/export-predictions.mjs --demo                      (fake data, to see the files; no key needed)
// Options: --out <folder> (default exports) · --from YYYY-MM-DD · --to YYYY-MM-DD · --lang he|en · --future (also games that have not started) · --all-users
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLong, buildMatrix, loadExportData, renderHtml, selectData, toCsv } from '../shared/exportPredictions.js';

const FLAGS = new Set(['future', 'all-users', 'demo', 'help']);
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (!argv[i].startsWith('--')) { console.error(`Unexpected argument: ${argv[i]}`); process.exit(1); }
  const k = argv[i].slice(2);
  if (FLAGS.has(k)) args[k] = true;
  else { args[k] = argv[i + 1]; i += 1; }
}
if (args.help) {
  console.log('Usage: node scripts/export-predictions.mjs --key <service-account.json> [--out folder] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--lang he|en] [--future] [--all-users]\n       node scripts/export-predictions.mjs --demo');
  process.exit(0);
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
for (const k of ['from', 'to']) if (args[k] && !DAY.test(args[k])) { console.error(`--${k} must look like 2026-11-30`); process.exit(1); }
if (args.lang && !['he', 'en'].includes(args.lang)) { console.error('--lang must be he or en'); process.exit(1); }

// ---- the database: the real one (Admin SDK, read only) or a small fake one for --demo ----
function demoDb() {
  const ts = (iso) => ({ toMillis: () => Date.parse(iso) });
  const now = Date.now();
  const iso = (h) => new Date(now + h * 3600e3).toISOString();
  const names = ['דן כהן', 'מאיה לוי', 'Arik Safran', 'Yosi Medler', 'נועה ברק', 'Nir Moalem'];
  const games = { d1: ['BOS', 'NYK', 'finished', 110, 102, -30], d2: ['LAL', 'GSW', 'finished', 98, 104, -20], d3: ['DEN', 'MIA', 'live', 44, 41, -1], d4: ['PHX', 'DAL', 'scheduled', null, null, 20] };
  const store = { games: {}, predictions: {}, users: {}, participants: {}, points: {} };
  Object.entries(games).forEach(([id, [t1, t2, status, s1, s2, h]]) => { store.games[id] = { round: 'RS', status, t1, t2, s1, s2, tipoff: ts(iso(h)) }; });
  names.forEach((name, i) => {
    const uid = `demo${i}`;
    store.users[uid] = { name };
    store.participants[`p${i}`] = { claimedBy: uid, paid: true };
    store.predictions[uid] = { games: Object.fromEntries(Object.keys(games).filter((id, j) => (i + j) % 5 !== 0).map((id, j) => [id, { s1: 95 + ((i * 7 + j * 3) % 25), s2: 92 + ((i * 5 + j * 4) % 25), autoFilled: i === 3 && j === 1, updatedAt: ts(iso(-40)) }])), jokers: i % 2 ? { d1: true } : {} };
  });
  return { collection: (n) => ({ get: async () => ({ docs: Object.entries(store[n] || {}).map(([id, d]) => ({ id, data: () => d })) }) }) };
}

async function realDb() {
  const adminRequire = createRequire(new URL('../functions/package.json', import.meta.url)); // firebase-admin is installed in the functions folder
  const { initializeApp, cert, applicationDefault } = adminRequire('firebase-admin/app');
  const { getFirestore } = adminRequire('firebase-admin/firestore');
  const keyPath = args.key || null;
  if (keyPath) {
    if (!fs.existsSync(keyPath)) { console.error(`Key file not found: ${keyPath}`); process.exit(1); }
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    initializeApp({ credential: cert(key), projectId: key.project_id });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || 'nba2027' });
  } else {
    console.error('A service-account key is needed: --key "C:\\path\\key.json" (see docs/EXPORT_PREDICTIONS.md). Use --demo to see sample files.');
    process.exit(1);
  }
  return getFirestore();
}

const db = args.demo ? demoDb() : await realDb();
const data = await loadExportData(db);
const sel = selectData(data, { from: args.from || null, to: args.to || null, future: !!args.future, allUsers: !!args['all-users'], lang: args.lang || 'he' });

const out = path.resolve(args.out || 'exports');
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
const files = {
  [`predictions-matrix_${stamp}.csv`]: toCsv(buildMatrix(sel)),
  [`predictions-long_${stamp}.csv`]: toCsv(buildLong(sel)),
  [`predictions_${stamp}.html`]: renderHtml(sel),
};
Object.entries(files).forEach(([name, text]) => fs.writeFileSync(path.join(out, name), text, 'utf8'));

console.log(`${args.demo ? '[DEMO DATA] ' : ''}${sel.games.length} games x ${sel.players.length} players${args.future ? ' (including games that have not started)' : ' (games that have started)'}`);
console.log(`Files in ${out}:`);
Object.keys(files).forEach((name) => console.log(`  ${name}`));
process.exit(0);
