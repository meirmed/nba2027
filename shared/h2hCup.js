// "Head to Head" competition (ראש בראש), the owner's format:
//   G  group stage: 4 groups A-D, assigned BY THE ADMIN (23 players: 6 + 6 + 6 + 5); the top 4 of every group advance (16 players, 7 are out);
//   R  "שמינית הגמר" (round of 16): the 16 are placed in 4 NEW groups E-H by the rotation R_SLOTS (E = A1, D2, C3, B4 ...); the top 2 of every group advance (8);
//   QF / SF / F  the same knockout as the mid-season tournament (E1-F2, F1-E2, G1-H2, H1-G2; winner QF1 v QF3, QF2 v QF4; the final).
// Every stage starts from ZERO: only the GAME points inside its own window of days count (Israel dates, set later by the admin); bonus points and the JOKER's
// doubling never count (the 5th number of points/{uid}.byDay, like the mid-season tournament). Tie-breaks (all stages, the cut places included): points,
// correct winners, exact hits, unique hits, the overall main-table total; only a REAL tie is left to the admin. The "pairs for fun" are a separate thing (shared/h2h.js).
// The knockout half is the mid-season engine (buildBracket) run on the groups E-H, so both competitions follow exactly the same rules.
import { buildBracket, cleanGroups, compareStats, stageOver, stageStatus, windowStats } from './midTournament.js';

export const CUP_STAGES = ['G', 'R', 'QF', 'SF', 'F'];
export const CUP_GROUPS_1 = ['A', 'B', 'C', 'D'];
export const CUP_GROUPS_2 = ['E', 'F', 'G', 'H'];
export const CUP_ADVANCE_1 = 4; // of every group A-D
export const CUP_ADVANCE_2 = 2; // of every group E-H
/** Who plays in the new groups: 'A1' = the first of group A. Every new group has one player of every old group and one of every place (the places add up to 10). */
export const R_SLOTS = { E: ['A1', 'D2', 'C3', 'B4'], F: ['B1', 'A2', 'D3', 'C4'], G: ['C1', 'B2', 'A3', 'D4'], H: ['D1', 'C2', 'B3', 'A4'] };
export { cleanGroups };

const TO_MID = { E: 'A', F: 'B', G: 'C', H: 'D' }; // the knockout half is the mid-season engine, which names its groups A-D
const FROM_MID = { A: 'E', B: 'F', C: 'G', D: 'H' };
const FAR = { lo: '9999-12-31', hi: '9999-12-31' }; // a stage whose dates are not set yet
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he') || String(a.uid).localeCompare(String(b.uid));

/** The windows that are complete and valid ({lo, hi} day keys, lo <= hi); anything else is "not set yet". */
export function cleanWindows(windows = {}) {
  const out = {};
  CUP_STAGES.forEach((k) => { const w = windows?.[k]; if (w && DAY.test(w.lo || '') && DAY.test(w.hi || '') && w.lo <= w.hi) out[k] = { lo: w.lo, hi: w.hi }; });
  return out;
}
/** What is wrong with the dates the admin typed? null = fine. Stages must follow each other without overlapping (a stage may be left empty = not set yet). */
export function windowsProblem(windows = {}) {
  let prev = null;
  for (const k of CUP_STAGES) {
    const w = windows?.[k];
    if (!w || (!w.lo && !w.hi)) continue;
    if (!DAY.test(w.lo || '') || !DAY.test(w.hi || '')) return { code: 'format', stage: k };
    if (w.lo > w.hi) return { code: 'order', stage: k };
    if (prev && w.lo <= prev.hi) return { code: 'overlap', stage: k };
    prev = w;
  }
  return null;
}

/**
 * One group's table (best first, rank 1..N): `qualifiers` advance. `top` = the admin's decision, the ORDERED list of the places that advance.
 * needsDecision = two neighbours among the advancing places, or the last advancing place and the first one out, are a REAL tie (equal on every tie-break) and
 * no decision was made (the order matters: it decides who plays whom in the next round).
 */
export function cupGroupTable({ members = [], rowsByUid = {}, window, qualifiers, top }) {
  const stats = members.map((uid) => ({ uid, name: rowsByUid[uid]?.name ?? '', ...windowStats(rowsByUid[uid], window) }));
  let sorted = [...stats].sort((a, b) => compareStats(a, b) || byName(a, b));
  const need = Math.min(qualifiers, sorted.length);
  const decided = Array.isArray(top) && top.length === need && new Set(top).size === need && top.every((u) => members.includes(u));
  if (decided) sorted = [...top.map((u) => sorted.find((s) => s.uid === u)), ...sorted.filter((s) => !top.includes(s.uid))];
  const tieAt = (i) => sorted.length > i + 1 && compareStats(sorted[i], sorted[i + 1]) === 0;
  const needsDecision = !decided && Array.from({ length: Math.min(qualifiers, sorted.length - 1) }, (_, i) => i).some(tieAt);
  return { table: sorted.map((s, i) => ({ ...s, rank: i + 1, qualified: i < qualifiers })), needsDecision, decided };
}

/**
 * The whole competition from the stored configuration and the per-day points.
 * cfg = h2hTournament/cup: { groups: {A: [uid..], B, C, D}, windows: {G, R, QF, SF, F: {lo, hi}}, overrides: {groupTop: {A: [4 uids in order]}, rTop: {E: [first, second]}, pairWinner: {QF1: uid}} }
 * rowsByUid: {uid: {name, total, byDay}}; games: counted games [{dayKey, status}]. A round fills in when the round before it is over (and has no tie waiting for the admin).
 */
export function buildCup({ cfg = {}, rowsByUid = {}, todayKey, games = [] }) {
  const windows = cleanWindows(cfg?.windows);
  const groups = cleanGroups(cfg?.groups);
  const ov = cfg?.overrides || {};

  // ---- stage G: the four groups A-D ----
  const overG = windows.G ? stageOver(windows.G, todayKey, games) : false;
  const tablesG = {};
  CUP_GROUPS_1.forEach((g) => { tablesG[g] = cupGroupTable({ members: groups[g] || [], rowsByUid, window: windows.G || FAR, qualifiers: CUP_ADVANCE_1, top: ov.groupTop?.[g] }); });
  const decisionsG = overG ? CUP_GROUPS_1.filter((g) => tablesG[g].needsDecision) : [];
  const readyR = overG && decisionsG.length === 0;

  // ---- stage R: the new groups E-H (the rotation), then the knockout (the mid-season engine on E-H) ----
  const groupsR = {};
  CUP_GROUPS_2.forEach((e) => { groupsR[e] = readyR ? R_SLOTS[e].map((slot) => tablesG[slot[0]].table[Number(slot[1]) - 1]?.uid ?? null).filter(Boolean) : []; });
  const midOverrides = {
    groupTop: Object.fromEntries(CUP_GROUPS_2.map((e) => [TO_MID[e], ov.rTop?.[e]]).filter(([, v]) => v)),
    pairWinner: ov.pairWinner || {},
  };
  const B = buildBracket({
    groups: Object.fromEntries(CUP_GROUPS_2.map((e) => [TO_MID[e], groupsR[e]])), rowsByUid, overrides: midOverrides, todayKey, games,
    windows: { G: windows.R || FAR, QF: windows.QF || FAR, SF: windows.SF || FAR, F: windows.F || FAR },
  });
  const overR = readyR && !!windows.R && B.over.G;
  const status = {
    G: windows.G ? stageStatus(windows.G, todayKey, overG) : 'undated',
    R: windows.R ? (overR ? 'over' : B.status.G === 'over' ? 'live' : B.status.G) : 'undated',
    QF: windows.QF ? B.status.QF : 'undated', SF: windows.SF ? B.status.SF : 'undated', F: windows.F ? B.status.F : 'undated',
  };
  const over = { G: overG, R: overR, QF: !!windows.QF && B.over.QF, SF: !!windows.SF && B.over.SF, F: !!windows.F && B.over.F };
  const mapSlot = (s) => (/^[A-D][12]$/.test(s) ? FROM_MID[s[0]] + s[1] : s);
  const pairs = Object.fromEntries(Object.entries(B.pairs).map(([k, p]) => [k, { ...p, slots: p.slots.map(mapSlot) }]));
  const decisions = { G: decisionsG, R: overR ? B.groupDecisions.map((a) => FROM_MID[a]) : [], pairs: B.pairDecisions };

  return {
    windows, groups, status, over, started: Object.values(groups).flat().length > 0,
    tablesG, groupsR, tablesR: Object.fromEntries(CUP_GROUPS_2.map((e) => [e, B.tables[TO_MID[e]]])),
    pairs, champion: B.champion, decisions,
    pending: decisions.G.length + decisions.R.length + decisions.pairs.length,
    out: overG && decisionsG.length === 0 ? CUP_GROUPS_1.flatMap((g) => tablesG[g].table.filter((r) => !r.qualified)) : [], // those who are out after the group stage
  };
}
