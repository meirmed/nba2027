// READ-ONLY report: who played a joker, on which game, and how many points it gave (the zero-point jokers first). It reads the database with the Admin SDK and CHANGES NOTHING.
//
//   node scripts/joker-report.mjs --key "C:\path\to\key.json"                          (this week: from the last Sunday to today, Israel dates)
//   node scripts/joker-report.mjs --key "..." --from 2026-11-15 --to 2026-11-21
//   node scripts/joker-report.mjs --demo                                              (a simulated season, no key needed)
// Options: --out <folder> (default exports)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { jokerReport } from '../shared/jokerReport.js';
import { dayKeyOfMs, addDaysToKey } from '../shared/daykeys.js';
import { TEAMS_BY_ABBR } from '../shared/teams.js';
import { toCsv } from '../shared/exportPredictions.js';
import { buildSeason } from './lib/simulate.mjs';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (!argv[i].startsWith('--')) { console.error(`Unexpected argument: ${argv[i]}`); process.exit(1); }
  const k = argv[i].slice(2);
  if (k === 'demo' || k === 'help') args[k] = true; else { args[k] = argv[i + 1]; i += 1; }
}
if (args.help) { console.log('Usage: node scripts/joker-report.mjs --key <service-account.json> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out folder]\n       node scripts/joker-report.mjs --demo'); process.exit(0); }
const DAY = /^\d{4}-\d{2}-\d{2}$/;
for (const k of ['from', 'to']) if (args[k] && !DAY.test(args[k])) { console.error(`--${k} must look like 2026-11-21`); process.exit(1); }

async function realData() {
  const adminRequire = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, cert, applicationDefault } = adminRequire('firebase-admin/app');
  const { getFirestore } = adminRequire('firebase-admin/firestore');
  if (args.key) {
    if (!fs.existsSync(args.key)) { console.error(`Key file not found: ${args.key}`); process.exit(1); }
    const key = JSON.parse(fs.readFileSync(args.key, 'utf8'));
    initializeApp({ credential: cert(key), projectId: key.project_id });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || 'nba2027' });
  } else { console.error('A service-account key is needed: --key "C:\\path\\key.json". Use --demo to see the report on a simulated season.'); process.exit(1); }
  const db = getFirestore();
  const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : null);
  const [g, p, pts, set] = await Promise.all([db.collection('games').get(), db.collection('predictions').get(), db.collection('points').get(), db.doc('appSettings/main').get()]);
  const settings = set.exists ? set.data() : {};
  const players = pts.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((x) => x.isAdmin !== true && x.paid !== false);
  return {
    games: g.docs.map((d) => { const x = d.data(); return { id: d.id, round: x.round, status: x.status, t1: x.t1, t2: x.t2, s1: x.s1 ?? null, s2: x.s2 ?? null, tipoffMs: ms(x.tipoff) }; }).filter((x) => x.tipoffMs),
    predictions: Object.fromEntries(p.docs.map((d) => [d.id, { games: d.data().games || {}, jokers: d.data().jokers || {} }])),
    uids: players.map((x) => x.uid), names: Object.fromEntries(players.map((x) => [x.uid, x.name || x.uid])),
    scoring: settings.scoring, countedRounds: settings.countedRounds || ['RS'], timezone: settings.timezone || 'Asia/Jerusalem',
  };
}
function demoData() {
  const s = buildSeason({ users: 23, days: 60, gamesPerDay: 1.5, seed: 5 });
  return { games: s.games, predictions: s.predictions, uids: s.uids, names: Object.fromEntries(s.uids.map((u, i) => [u, `Player ${i + 1}`])), scoring: undefined, countedRounds: ['RS'], timezone: 'Asia/Jerusalem' };
}

const d = args.demo ? demoData() : await realData();
const today = dayKeyOfMs(Date.now(), d.timezone);
const sunday = addDaysToKey(today, -new Date(`${today}T12:00:00Z`).getUTCDay()); // the Israeli week starts on Sunday
const from = args.from || (args.demo ? null : sunday);
const to = args.to || (args.demo ? null : today);
const r = jokerReport({ games: d.games, predictions: d.predictions, uids: d.uids, names: d.names, scoring: d.scoring, countedRounds: d.countedRounds, timezone: d.timezone, from, to });
const team = (a) => TEAMS_BY_ABBR[a]?.shortHe || a || '';
const line = (x) => `  ${String(x.name).padEnd(22)} ${x.day}  ${`${team(x.t1)} - ${team(x.t2)}`.padEnd(30)} pick ${x.pick.padEnd(8)} result ${String(x.result || '-').padEnd(8)} ${x.finished ? `${x.pts} points` : `(${x.status})`}`;
const L = [];
L.push(`${args.demo ? '[DEMO DATA] ' : ''}JOKERS ${from || '(all)'} .. ${to || '(all)'}   READ-ONLY: nothing is changed.`);
L.push('');
L.push(`Jokers played on finished games: ${r.finished.length}, with 0 POINTS: ${r.zero.length}`);
L.push('');
L.push('JOKERS THAT GAVE 0 POINTS:');
if (r.zero.length === 0) L.push('  none'); else r.zero.forEach((x) => L.push(line(x)));
L.push('');
L.push('JOKERS THAT PAID:');
r.finished.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts).forEach((x) => L.push(line(x)));
if (r.pending.length) { L.push(''); L.push('JOKERS ON GAMES THAT HAVE NOT FINISHED YET:'); r.pending.forEach((x) => L.push(line(x))); }
console.log(L.join('\n'));

const out = path.resolve(args.out || 'exports');
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
const file = path.join(out, `jokers_${stamp}.csv`);
fs.writeFileSync(file, toCsv([['date', 'player', 'game', 'pick', 'result', 'status', 'points with the joker'], ...r.rows.map((x) => [x.day, x.name, `${team(x.t1)} - ${team(x.t2)}`, x.pick, x.result, x.status, x.pts ?? ''])]), 'utf8');
console.log(`\nAll the jokers of the range: ${file}`);
process.exit(0);
