// "Mid-season tournament" (טורניר אמצע): 4 groups assigned by the admin -> the top 2 of every group -> quarter finals -> semi finals -> final.
// Everything is DERIVED from the per-day game points (points/{uid}.byDay[day] = [game points, exact hits, unique hits], day = Israel date of the tip-off)
// plus two things the admin stores: the groups, and decisions for REAL ties (overrides). Bonus points never count. Pure functions, unit-tested.

/** The time window (Israel dates, inclusive) in which games count for each stage. */
export const MID_WINDOWS = {
  G: { lo: '2026-11-09', hi: '2026-12-06' }, // group stage, 4 weeks
  QF: { lo: '2026-12-07', hi: '2026-12-13' },
  SF: { lo: '2026-12-14', hi: '2026-12-20' },
  F: { lo: '2026-12-21', hi: '2026-12-27' },
};
export const MID_STAGES = ['G', 'QF', 'SF', 'F'];
export const MID_GROUPS = ['A', 'B', 'C', 'D'];
export const QUALIFIERS_PER_GROUP = 2;
// quarter finals: the first of a group against the second of another group; the slots 'A1' = first place of group A, 'B2' = second place of group B
export const QF_SLOTS = { QF1: ['A1', 'B2'], QF2: ['C1', 'D2'], QF3: ['B1', 'A2'], QF4: ['D1', 'C2'] };
// semi finals / final: the winners of earlier pairs (A1 and A2 end up in opposite halves of the bracket)
export const SF_SLOTS = { SF1: ['QF1', 'QF2'], SF2: ['QF3', 'QF4'] };
export const F_SLOTS = { F: ['SF1', 'SF2'] };
export const PAIR_KEYS = ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F'];

const r2 = (x) => Math.round(x * 100) / 100;
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he') || String(a.uid).localeCompare(String(b.uid));

/** Game points / exact hits / unique hits of one player inside a window (day keys, inclusive). */
export function windowStats(row, { lo, hi }) {
  let pts = 0; let exact = 0; let unique = 0;
  Object.entries(row?.byDay || {}).forEach(([day, c]) => { if (day >= lo && day <= hi) { pts += c[0] || 0; exact += c[1] || 0; unique += c[2] || 0; } });
  return { pts: r2(pts), exact, unique };
}
/** Better first: points, then exact hits, then unique hits. 0 = a real tie. */
export const compareStats = (a, b) => (b.pts - a.pts) || (b.exact - a.exact) || (b.unique - a.unique);

/**
 * One group's table (best first, rank 1..N). `top` = the admin's decision [first, second] for a real tie. needsDecision = the order of places 1-2 or the
 * cut between 2 and 3 is a real tie (equal on points, exact and unique hits) and no decision was made: it matters for who advances and for the bracket.
 */
export function groupTable({ members = [], rowsByUid = {}, window, top }) {
  const stats = members.map((uid) => ({ uid, name: rowsByUid[uid]?.name ?? '', ...windowStats(rowsByUid[uid], window) }));
  let sorted = [...stats].sort((a, b) => compareStats(a, b) || byName(a, b));
  const decided = Array.isArray(top) && top.length === 2 && top[0] !== top[1] && top.every((u) => members.includes(u));
  if (decided) sorted = [...top.map((u) => sorted.find((s) => s.uid === u)), ...sorted.filter((s) => !top.includes(s.uid))];
  const tieAt = (i) => sorted.length > i + 1 && compareStats(sorted[i], sorted[i + 1]) === 0;
  const needsDecision = !decided && (tieAt(0) || tieAt(1));
  return { table: sorted.map((s, i) => ({ ...s, rank: i + 1, qualified: i < QUALIFIERS_PER_GROUP })), needsDecision, decided };
}

/** A stage is OVER when its last day has passed and none of its games is still waiting / being played. games: [{dayKey, status}] (counted games) */
export function stageOver(window, todayKey, games = []) {
  if (todayKey <= window.hi) return false;
  return !games.some((g) => g.dayKey >= window.lo && g.dayKey <= window.hi && (g.status === 'scheduled' || g.status === 'live'));
}
export const stageStatus = (window, todayKey, isOver) => (isOver ? 'over' : todayKey < window.lo ? 'upcoming' : 'live');

/** Two players head to head inside a window. winner only once the stage is over (a real tie needs the admin's decision). */
export function pairState({ aUid, bUid, rowsByUid = {}, window, over = false, winnerOverride = null }) {
  const side = (uid) => (uid ? { uid, name: rowsByUid[uid]?.name ?? '', ...windowStats(rowsByUid[uid], window) } : null);
  const a = side(aUid);
  const b = side(bUid);
  if (!a || !b) return { a, b, leader: null, tied: false, winner: null, needsDecision: false };
  const c = compareStats(a, b);
  const leader = c < 0 ? 'a' : c > 0 ? 'b' : null;
  let winner = null;
  let needsDecision = false;
  if (over) {
    if (winnerOverride === a.uid || winnerOverride === b.uid) winner = winnerOverride;
    else if (leader) winner = leader === 'a' ? a.uid : b.uid;
    else needsDecision = true;
  }
  return { a, b, leader, tied: c === 0, winner, needsDecision };
}

/**
 * The whole tournament from the stored groups and decisions.
 * groups {A:[uid..], B.., C.., D..}; overrides {groupTop: {A:[first, second]}, pairWinner: {QF1: uid, ...}}; games: counted games [{dayKey, status}].
 * Before the group stage is over the quarter-final slots are empty; each later round fills in when the round before it is over.
 */
export function buildBracket({ groups = {}, rowsByUid = {}, overrides = {}, todayKey, games = [], windows = MID_WINDOWS }) {
  const over = Object.fromEntries(MID_STAGES.map((k) => [k, stageOver(windows[k], todayKey, games)]));
  const status = Object.fromEntries(MID_STAGES.map((k) => [k, stageStatus(windows[k], todayKey, over[k])]));
  const tables = {};
  MID_GROUPS.forEach((g) => { tables[g] = groupTable({ members: groups[g] || [], rowsByUid, window: windows.G, top: overrides.groupTop?.[g] }); });
  const seed = (slot) => (over.G ? tables[slot[0]].table[Number(slot[1]) - 1]?.uid ?? null : null);

  const pairs = {};
  const winnerOf = (key) => pairs[key]?.winner ?? null;
  const build = (key, slots, stage, resolve) => {
    pairs[key] = { key, stage, slots, ...pairState({ aUid: resolve(slots[0]), bUid: resolve(slots[1]), rowsByUid, window: windows[stage], over: over[stage], winnerOverride: overrides.pairWinner?.[key] ?? null }) };
  };
  Object.entries(QF_SLOTS).forEach(([k, s]) => build(k, s, 'QF', seed));
  Object.entries(SF_SLOTS).forEach(([k, s]) => build(k, s, 'SF', winnerOf));
  build('F', F_SLOTS.F, 'F', winnerOf);

  return {
    over, status, tables, pairs,
    groupDecisions: over.G ? MID_GROUPS.filter((g) => tables[g].needsDecision) : [], // groups where the admin must pick places 1 and 2
    pairDecisions: PAIR_KEYS.filter((k) => pairs[k].needsDecision), // pairs that ended in a real tie
    champion: pairs.F.winner,
  };
}

/** The groups as stored: every player at most once; drops unknown groups. */
export function cleanGroups(groups = {}) {
  const seen = new Set();
  const out = {};
  MID_GROUPS.forEach((g) => { out[g] = (groups[g] || []).filter((u) => typeof u === 'string' && u && !seen.has(u) && seen.add(u)); });
  return out;
}
