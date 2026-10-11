import { FieldValue } from 'firebase-admin/firestore';
import { computeAllPoints } from '../shared/standings.js';
import { computeBonusPoints } from '../shared/bonus.js';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

/** Reads RAW data only: games + predictions (+ stored points for bonus/names) + settings. */
export async function loadState(db) {
  const [g, p, pts, s, b] = await Promise.all([
    db.collection('games').get(), db.collection('predictions').get(), db.collection('points').get(), db.doc('appSettings/main').get(), db.collection('bonus').get(),
  ]);
  const games = g.docs.map((d) => {
    const x = d.data();
    return { id: d.id, round: x.round, status: x.status, t1: x.t1, t2: x.t2, s1: x.s1, s2: x.s2, tipoffMs: x.tipoff?.toMillis?.() ?? 0 };
  });
  const predictions = {};
  p.forEach((d) => { const x = d.data(); predictions[d.id] = { games: x.games || {}, jokers: x.jokers || {}, bonus: x.bonus || {} }; });
  const stored = {};
  pts.forEach((d) => { stored[d.id] = d.data(); });
  const settings = s.data() || {};
  const uids = [...new Set([...Object.keys(predictions), ...Object.keys(stored)])];
  const questions = b.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { games, predictions, stored, uids, questions, scoring: settings.scoring, countedRounds: settings.countedRounds || DEFAULT_SETTINGS.countedRounds };
}

/** Full recompute of every user's points from raw data (idempotent): game points + bonus points. total = gamePts + bonus. */
export async function recalcAllPoints(db) {
  const st = await loadState(db);
  const res = computeAllPoints(st);
  const bon = computeBonusPoints({ questions: st.questions, predictions: st.predictions, uids: st.uids });
  const writes = [];
  st.uids.forEach((uid) => {
    const { byGame, ...stats } = res[uid];
    const data = { ...stats, bonus: bon[uid].bonus, bonusByCategory: bon[uid].byCategory, total: Math.round((stats.gamePts + bon[uid].bonus) * 100) / 100, updatedAt: FieldValue.serverTimestamp() };
    // mergeFields replaces each listed field WHOLE (so gamePtsByRound can't keep stale round keys)
    writes.push({ ref: db.doc(`points/${uid}`), data, opts: { mergeFields: Object.keys(data) } });
    writes.push({ ref: db.doc(`pointsDetail/${uid}`), data: { byGame, bonus: bon[uid].byQuestion, updatedAt: FieldValue.serverTimestamp() }, opts: undefined });
  });
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((w) => (w.opts ? batch.set(w.ref, w.data, w.opts) : batch.set(w.ref, w.data)));
    await batch.commit();
  }
  return { users: st.uids.length, games: st.games.length };
}

const FIELDS = ['gamePts', 'gameHits', 'exactHits', 'winnerCorrect', 'uniqueHits', 'riskHits', 'gamesPlayed', 'bestStreak', 'curStreak', 'bestMiss', 'curMiss'];
const sortedJson = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b))));

/** Stored points/{uid} vs a fresh recompute from raw data. Expected: 0 mismatches. */
export async function reconcileAll(db) {
  const st = await loadState(db);
  const res = computeAllPoints(st);
  const bon = computeBonusPoints({ questions: st.questions, predictions: st.predictions, uids: st.uids });
  const mismatches = [];
  st.uids.forEach((uid) => {
    const name = st.stored[uid]?.name || uid;
    const stored = st.stored[uid];
    if (!stored) { mismatches.push({ uid, name, field: 'points doc', stored: 'missing', expected: 'present' }); return; }
    const exp = res[uid];
    FIELDS.forEach((f) => { if ((stored[f] ?? 0) !== exp[f]) mismatches.push({ uid, name, field: f, stored: stored[f] ?? 0, expected: exp[f] }); });
    if ((stored.bonus ?? 0) !== bon[uid].bonus) mismatches.push({ uid, name, field: 'bonus', stored: stored.bonus ?? 0, expected: bon[uid].bonus });
    if (sortedJson(stored.bonusByCategory) !== sortedJson(bon[uid].byCategory)) mismatches.push({ uid, name, field: 'bonusByCategory', stored: sortedJson(stored.bonusByCategory), expected: sortedJson(bon[uid].byCategory) });
    const expTotal = Math.round((exp.gamePts + bon[uid].bonus) * 100) / 100;
    if ((stored.total ?? 0) !== expTotal) mismatches.push({ uid, name, field: 'total', stored: stored.total ?? 0, expected: expTotal });
    if (sortedJson(stored.gamePtsByRound) !== sortedJson(exp.gamePtsByRound)) mismatches.push({ uid, name, field: 'gamePtsByRound', stored: sortedJson(stored.gamePtsByRound), expected: sortedJson(exp.gamePtsByRound) });
  });
  return { users: st.uids.length, ok: mismatches.length === 0, mismatches: mismatches.slice(0, 200), mismatchCount: mismatches.length };
}
