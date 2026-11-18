// READ-ONLY report: what the change of the courage (risk) bonus did (update 125: the percentage counts the players' OWN picks only, an auto-filled pick never gets the
// bonus). It compares the OLD rule with the rule that runs now. It reads the database with the Admin SDK and CHANGES NOTHING.
// After "Recalculate all points" the line "Check against the database" must say OK (the stored points are those of the new rule).
//
//   node scripts/risk-impact.mjs --key "C:\path\to\key.json"
//   node scripts/risk-impact.mjs --demo            (a simulated season, no key needed)
// Options: --out <folder> (default exports)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { groupsImpact, riskImpact } from '../shared/riskImpact.js';
import { dayKeyOfMs } from '../shared/daykeys.js';
import { countsForStandings } from '../shared/games.js';
import { computeAllPoints } from '../shared/standings.js';
import { MID_WINDOWS } from '../shared/midTournament.js';
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
if (args.help) { console.log('Usage: node scripts/risk-impact.mjs --key <service-account.json> [--out folder]\n       node scripts/risk-impact.mjs --demo'); process.exit(0); }

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
  const [g, p, pts, set, midDoc] = await Promise.all([db.collection('games').get(), db.collection('predictions').get(), db.collection('points').get(), db.doc('appSettings/main').get(), db.doc('midTournament/main').get()]);
  const settings = set.exists ? set.data() : {};
  const points = pts.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((x) => x.isAdmin !== true && x.paid !== false);
  const preds = Object.fromEntries(p.docs.map((d) => [d.id, { games: d.data().games || {}, jokers: d.data().jokers || {} }]));
  return {
    games: g.docs.map((d) => { const x = d.data(); return { id: d.id, round: x.round, status: x.status, t1: x.t1, t2: x.t2, s1: x.s1 ?? null, s2: x.s2 ?? null, tipoffMs: ms(x.tipoff) }; }).filter((x) => x.tipoffMs),
    predictions: preds, uids: points.map((x) => x.uid), names: Object.fromEntries(points.map((x) => [x.uid, x.name || x.uid])),
    totals: Object.fromEntries(points.map((x) => [x.uid, x.total ?? 0])), storedGamePts: Object.fromEntries(points.map((x) => [x.uid, x.gamePts ?? 0])),
    scoring: settings.scoring, countedRounds: settings.countedRounds || ['RS'], timezone: settings.timezone || 'Asia/Jerusalem',
    pointsRows: points, mid: midDoc.exists ? midDoc.data() : null,
  };
}
function demoData() {
  const s = buildSeason({ users: 23, days: 60, gamesPerDay: 1.5, seed: 5 });
  const res = computeAllPoints({ games: s.games, predictions: s.predictions, uids: s.uids, scoring: undefined, countedRounds: ['RS'] });
  return { games: s.games, predictions: s.predictions, uids: s.uids, names: Object.fromEntries(s.uids.map((u, i) => [u, `Player ${i + 1}`])),
    totals: Object.fromEntries(s.uids.map((u) => [u, res[u].gamePts])), storedGamePts: Object.fromEntries(s.uids.map((u) => [u, res[u].gamePts])), scoring: undefined, countedRounds: ['RS'], timezone: 'Asia/Jerusalem',
    pointsRows: s.uids.map((u, i) => ({ uid: u, name: `Player ${i + 1}`, byDay: res[u].byDay, total: res[u].gamePts })),
    mid: { groups: { A: s.uids.slice(0, 4), B: s.uids.slice(4, 8), C: s.uids.slice(8, 12), D: s.uids.slice(12, 16) } } };
}

const d = args.demo ? demoData() : await realData();
const r = riskImpact({ games: d.games, predictions: d.predictions, uids: d.uids, scoring: d.scoring, countedRounds: d.countedRounds, timezone: d.timezone, totals: d.totals, storedGamePts: d.storedGamePts });
const s = r.summary;
const name = (u) => d.names[u] || u;
const sign = (x) => (x > 0 ? `+${x}` : `${x}`);
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '0%');
const L = [];
L.push(`${args.demo ? '[DEMO DATA] ' : ''}RISK (COURAGE) BONUS: what the change did (OLD rule -> the rule that runs now: real picks only). READ-ONLY: nothing is changed by this report.`);
L.push('');
L.push(`Games checked (finished, counted):            ${s.gamesChecked}`);
L.push(`  with at least one auto-filled pick:         ${s.gamesWithAuto}`);
L.push(`  whose points the change CHANGES:            ${s.gamesAffected}`);
L.push(`Picks checked: ${s.picksChecked}, auto-filled: ${s.autoPicks} (${pct(s.autoPicks, s.picksChecked)})`);
L.push('');
L.push(`Courage bonuses with the old rule: ${s.riskBonusesOld}  ->  now: ${s.riskBonusesNew}`);
L.push(`  auto-filled picks that lose it:             ${s.autoLost}`);
L.push(`  real picks that GAIN it (autos no longer dilute the %):  ${s.realGained}`);
L.push(`  real picks that LOSE it (autos had lowered the %):       ${s.realLost}`);
L.push(`Points removed: ${s.pointsRemoved}, added: ${s.pointsAdded}, net: ${sign(Math.round((s.pointsAdded - s.pointsRemoved) * 100) / 100)}`);
L.push(`Unique bonuses changed: ${s.uniqueChanged} (should be 0)`);
L.push('');
if (r.check) L.push(r.check.mismatches.length === 0 ? `Check against the database: OK (the stored game points of all ${r.check.players} players equal the rule that runs now: the recalculation was done and this report is reliable)`
  : `Check against the database: MISMATCH for ${r.check.mismatches.length} of ${r.check.players} players (${r.check.mismatches.slice(0, 5).map(name).join(', ')}): the stored points are not those of the new rule yet. Run Admin -> Scoring -> "Recalculate all points" (after deploying the functions) and run this report again`);
L.push('');
const people = Object.entries(r.byPlayer).filter(([, x]) => x.delta !== 0).sort((a, b) => a[1].delta - b[1].delta);
L.push(`Players whose total the change changes: ${people.length} of ${d.uids.length}`);
people.forEach(([u, x]) => L.push(`  ${name(u).padEnd(22)} ${sign(x.delta).padStart(7)} points  (${x.games} games; bonuses lost ${x.autoLost + x.realLost}, gained ${x.realGained})`));
L.push('');
L.push(`Main table (current totals + the change; if the recalculation was done the current totals already include it): players who would change place: ${r.rankChanges.length}`);
r.rankChanges.forEach((c) => L.push(`  ${name(c.uid).padEnd(22)} place ${c.from} -> ${c.to}   (${c.total} -> ${c.after})`));
L.push('');
Object.entries(MID_WINDOWS).forEach(([k, w]) => {
  const rows = Object.entries(r.byPlayer).map(([u, x]) => [u, Object.entries(x.byDay).filter(([day]) => day >= w.lo && day <= w.hi).reduce((a, [, v]) => a + v.noJoker, 0)]).filter(([, v]) => Math.round(v * 100) !== 0);
  if (rows.length) { L.push(`Mid-season tournament, stage ${k} (${w.lo} .. ${w.hi}, points WITHOUT the joker): players whose window points would change: ${rows.length}`); rows.sort((a, b) => a[1] - b[1]).forEach(([u, v]) => L.push(`  ${name(u).padEnd(22)} ${sign(Math.round(v * 100) / 100).padStart(7)}`)); }
});
// the mid-season tournament groups under both rules
const todayKey = dayKeyOfMs(Date.now(), d.timezone);
const bracketGames = d.games.filter((g) => countsForStandings(g, d.countedRounds)).map((g) => ({ dayKey: dayKeyOfMs(g.tipoffMs, d.timezone), status: g.status }));
const gi = groupsImpact({ mid: d.mid, pointsRows: d.pointsRows, byPlayer: r.byPlayer, todayKey, bracketGames });
L.push('');
if (!gi) L.push('Mid-season tournament GROUPS: no groups are set in the database (nothing to compare).');
else {
  L.push(`Mid-season tournament GROUPS (group stage is "${gi.status}", today ${todayKey}): does any group change its order?  ${gi.anyOrderChange ? 'YES' : 'NO'}.  Do the two qualifying places change?  ${gi.anyTopTwoChange ? 'YES' : 'NO'}.`);
  gi.groups.filter((x) => x.touched || x.orderChanged).forEach((x) => {
    L.push(`  Group ${x.group}: order ${x.orderChanged ? 'CHANGES' : 'does not change'}; qualifiers ${x.topTwoChanged ? 'CHANGE' : 'do not change'}; gap 2nd-3rd place ${x.gapBefore} -> ${x.gapAfter}${x.tieBefore || x.tieAfter ? '; a tie at the qualifying line (needs the admin)' : ''}`);
    x.before.forEach((b) => { const a = x.after.find((y) => y.uid === b.uid); L.push(`     ${String(b.rank).padStart(2)}. ${String(b.name).padEnd(20)} ${String(b.pts).padStart(6)} -> ${String(a.pts).padStart(6)}   place ${b.rank} -> ${a.rank}${b.rank <= 2 ? '  (qualifies)' : ''}`); });
  });
}
console.log(L.join('\n'));

const out = path.resolve(args.out || 'exports');
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
const team = (a) => TEAMS_BY_ABBR[a]?.shortHe || a || '';
const rows = [['date', 'game', 'picks', 'auto-filled', 'bonuses lost by auto-filled', 'bonuses gained by real picks', 'bonuses lost by real picks', 'points change (all players)', 'players affected'],
  ...r.games.map((g) => [g.day, `${team(g.t1)} - ${team(g.t2)}`, g.picks, g.autos, g.autoLost, g.realGained, g.realLost, g.delta, g.players])];
const file = path.join(out, `risk-impact-games_${stamp}.csv`);
fs.writeFileSync(file, toCsv(rows), 'utf8');
console.log(`\nThe affected games (one row each): ${file}`);
process.exit(0);
