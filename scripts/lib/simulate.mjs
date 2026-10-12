// Season simulator: builds a fake season (games, picks, auto-fill, jokers, bonus answers) with a seeded RNG.
// Used by shared/simulation.test.js (small, runs in CI) and scripts/simulate-season.mjs (full size, prints timings + document sizes).
import { TEAMS } from '../../shared/teams.js';
import { makeAutoPick } from '../../shared/autofill.js';

/** Deterministic RNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const QUESTIONS = [
  { id: 'q-num1', category: 'season', type: 'numeric', pts: 6, answer: ['20'] },
  { id: 'q-num2', category: 'general', type: 'numeric', pts: 4, answer: ['7'] },
  { id: 'q-close1', category: 'season', type: 'closest', pts: 10, penalty: 1, answer: ['55'] },
  { id: 'q-close2', category: 'month', month: '2026-11', type: 'closest', pts: 8, penalty: 0.5, answer: ['120'] },
  { id: 'q-choice', category: 'general', type: 'choice', pts: 5, options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], answer: ['b'] },
  { id: 'q-dyn', category: 'season', type: 'dynamic_score', pts: 0, options: [{ id: 'a', pts: 4 }, { id: 'b', pts: 12 }, { id: 'c', pts: 30 }], answer: ['c'] },
  { id: 'q-team', category: 'season', type: 'team', pts: 3, multi: true, maxPicks: 4, answer: ['BOS', 'DEN', 'OKC', 'NYK'] },
  { id: 'q-text', category: 'general', type: 'text', pts: 4, answer: ['jokic'] },
];

/** -> {uids, games, predictions, questions, autoFilledCount}. Every game is FINISHED and every pick already locked/auto-filled. */
export function buildSeason({ users = 60, days = 165, gamesPerDay = 7.5, seed = 1, answerRate = 0.92 } = {}) {
  const r = rng(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const uids = Array.from({ length: users }, (_, i) => `u${i}`);
  const base = Date.UTC(2026, 9, 21, 23, 0, 0);

  const games = [];
  for (let d = 0; d < days; d += 1) {
    const n = Math.max(1, Math.round(gamesPerDay + (r() - 0.5) * 6));
    const used = new Set();
    for (let k = 0; k < n && used.size < 28; k += 1) {
      let a; let b;
      do { a = TEAMS[int(0, 29)].abbr; b = TEAMS[int(0, 29)].abbr; } while (a === b || used.has(a) || used.has(b));
      used.add(a); used.add(b);
      let s1 = int(88, 132); const s2 = int(88, 132);
      if (s1 === s2) s1 += 1;
      games.push({ id: `RS-${d}-${k}`, round: 'RS', status: 'finished', t1: a, t2: b, s1, s2, tipoffMs: base + d * 86400000 + int(0, 4) * 3600000 + int(0, 1) * 1800000 });
    }
  }

  const answerFor = (q) => {
    if (q.type === 'numeric' || q.type === 'closest') return [String(int(0, q.type === 'closest' && q.answer[0] > 100 ? 160 : 70))];
    if (q.type === 'text') return [r() < 0.3 ? 'Jokic' : 'someone else'];
    if (q.type === 'team') return [TEAMS[int(0, 29)].abbr, TEAMS[int(0, 29)].abbr];
    return [q.options[int(0, q.options.length - 1)].id];
  };

  let autoFilledCount = 0;
  const predictions = {};
  uids.forEach((uid) => {
    const gm = {};
    const humanIds = [];
    games.forEach((g) => {
      if (r() < answerRate) {
        let s1 = int(85, 130); const s2 = int(85, 130);
        if (s1 === s2) s1 += 2;
        gm[g.id] = { s1, s2 };
        humanIds.push(g.id);
      } else { // nobody predicted -> lockGamePicks auto-fills
        gm[g.id] = { ...makeAutoPick(r), autoFilled: true };
        autoFilledCount += 1;
      }
    });
    const jokers = {};
    for (let j = 0; j < 3 && humanIds.length; j += 1) jokers[humanIds[int(0, humanIds.length - 1)]] = true;
    const bonus = {};
    QUESTIONS.forEach((q) => { if (r() < 0.95) bonus[q.id] = { answer: answerFor(q) }; });
    predictions[uid] = { games: gm, jokers, bonus };
  });
  return { uids, games, predictions, questions: QUESTIONS, autoFilledCount };
}

/** Applies a dotted-path patch ('stages.K1.endDay': v, 'stages.K2': {...}) to a plain object, like Firestore update(). */
export function applyPatch(obj, patch) {
  const out = JSON.parse(JSON.stringify(obj));
  Object.entries(patch).forEach(([path, value]) => {
    const keys = path.split('.');
    let cur = out;
    keys.slice(0, -1).forEach((k) => { cur[k] = cur[k] ?? {}; cur = cur[k]; });
    cur[keys[keys.length - 1]] = value;
  });
  return out;
}
