// Full-size load check: 60 players x ~1,230 games. Run:  node scripts/simulate-season.mjs
import { buildSeason } from './lib/simulate.mjs';
import { computeAllPoints, rankRows } from '../shared/standings.js';
import { computeBonusPoints } from '../shared/bonus.js';

const kb = (o) => Math.round(Buffer.byteLength(JSON.stringify(o)) / 1024);
const t0 = performance.now();
const s = buildSeason({ users: 60, days: 165, gamesPerDay: 7.5, seed: 2027 });
const tBuild = performance.now() - t0;

const t1 = performance.now();
const res = computeAllPoints({ games: s.games, predictions: s.predictions, uids: s.uids, scoring: undefined, countedRounds: ['RS'], timezone: 'Asia/Jerusalem' });
const bonus = computeBonusPoints({ questions: s.questions, predictions: s.predictions, uids: s.uids });
const tCompute = performance.now() - t1;

const rows = s.uids.map((u) => ({ uid: u, ...res[u], bonus: bonus[u].bonus, total: res[u].gamePts + bonus[u].bonus }));
const top = rankRows(rows, ['total', 'exactHits', 'uniqueHits', 'bonus']).slice(0, 5);
const u0 = s.uids[0];
const { byGame, byDay, ...summary } = res[u0];

console.log(`games: ${s.games.length}   players: ${s.uids.length}   picks: ${s.uids.length * s.games.length}   auto-filled: ${s.autoFilledCount}`);
console.log(`build: ${tBuild.toFixed(0)} ms   FULL RECOMPUTE (all points + bonus): ${tCompute.toFixed(0)} ms`);
console.log('document sizes (Firestore limit is 1024 KB):');
console.log(`  predictions/{uid}      ${kb(s.predictions[u0])} KB`);
console.log(`  pointsDetail/{uid}     ${kb({ byGame })} KB`);
console.log(`  points/{uid} (+byDay)  ${kb({ ...summary, byDay })} KB   <- every client downloads all ${s.uids.length} of these`);
console.log(`  all points docs        ${kb(Object.fromEntries(s.uids.map((u) => [u, { ...res[u], byGame: undefined }])))} KB`);
console.log('top 5:', top.map((r) => `${r.uid}=${r.total}`).join('  '));
