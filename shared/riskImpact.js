// READ-ONLY ANALYSIS (the app does not use it): what did / would the change of the courage (risk) bonus do? From update 125 the percentage "who picked the winner"
// is counted among the players' OWN picks only and an auto-filled pick never gets the bonus (shared/standings.js scoreGamePicks). Before it, every valid pick
// (auto-filled included) was counted and an auto-filled pick could get the bonus at half. This module keeps a frozen copy of the OLD rule to compare the two.
import { mergeScoring, scoreGame } from './scoring.js';
import { computeAllPoints, scoreGamePicks } from './standings.js';
import { countsForStandings } from './games.js';
import { dayKeyOfMs } from './daykeys.js';
import { buildBracket, MID_WINDOWS } from './midTournament.js';

const sideOf = (a, b) => (a > b ? 1 : a < b ? 2 : 0);
const validPick = (p) => p && Number.isInteger(p.s1) && Number.isInteger(p.s2) && p.s1 !== p.s2;
const r2 = (x) => Math.round(x * 100) / 100;

/** THE OLD RULE (before update 125), a frozen copy used only by this report and its tests: the percentage counts ALL valid picks, an auto-filled pick can get the bonus. */
export function scoreGamePicksLegacy({ game, picks, scoring }) {
  const sc = mergeScoring(scoring);
  const valid = picks.filter(({ p }) => validPick(p));
  const out = {};
  if (valid.length === 0) return out;
  const counts = { 1: 0, 2: 0 };
  valid.forEach(({ p }) => { counts[sideOf(p.s1, p.s2)] += 1; });
  const exactManual = valid.filter(({ p }) => !p.autoFilled && p.s1 === game.s1 && p.s2 === game.s2);
  const uniqueUid = exactManual.length === 1 ? exactManual[0].uid : null;
  const realMargin = game.s1 - game.s2;
  const marginManual = valid.filter(({ p }) => !p.autoFilled && realMargin !== 0 && p.s1 - p.s2 === realMargin);
  const uniqueMarginUid = marginManual.length === 1 ? marginManual[0].uid : null;
  valid.forEach(({ uid, p, joker }) => {
    out[uid] = scoreGame(p, { s1: game.s1, s2: game.s2, status: 'finished' }, {
      round: game.round, joker: !!joker, pickPct: (100 * counts[sideOf(p.s1, p.s2)]) / valid.length, isUniqueExact: uid === uniqueUid, isUniqueMargin: uid === uniqueMarginUid, scoring: sc,
    });
  });
  return out;
}

/** The rule that runs now (= scoreGamePicks); kept under this name for the tests. */
export const scoreGamePicksProposed = scoreGamePicks;

/**
 * Compare the OLD rule (scoreGamePicksLegacy) with the rule that runs now (scoreGamePicks) over every finished counted game = what the change did to the points.
 * games: [{id, round, status, s1, s2, tipoffMs, t1?, t2?}]  predictions: {uid: {games, jokers}}  uids: the competitors  totals: {uid: current main-table total} (optional)
 * storedGamePts: {uid: points.gamePts stored in the database} (optional: equal to the points of the rule that runs now once "Recalculate all points" was run after update 125)
 */
export function riskImpact({ games, predictions, uids, scoring, countedRounds, timezone = 'Asia/Jerusalem', totals = null, storedGamePts = null }) {
  const sc = mergeScoring(scoring);
  const finished = games
    .filter((g) => g.status === 'finished' && countsForStandings(g, countedRounds) && Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.s1 !== g.s2)
    .sort((a, b) => (a.tipoffMs - b.tipoffMs) || a.id.localeCompare(b.id));

  const summary = { gamesChecked: finished.length, gamesWithAuto: 0, gamesAffected: 0, picksChecked: 0, autoPicks: 0,
    riskBonusesOld: 0, riskBonusesNew: 0, autoLost: 0, realGained: 0, realLost: 0, pointsRemoved: 0, pointsAdded: 0, uniqueChanged: 0 };
  const byPlayer = {};
  const touched = [];
  const get = (uid) => (byPlayer[uid] ||= { delta: 0, deltaNoJoker: 0, games: 0, autoLost: 0, realGained: 0, realLost: 0, byDay: {} });

  finished.forEach((g) => {
    const picks = [];
    uids.forEach((uid) => { const p = predictions[uid]?.games?.[g.id]; if (validPick(p)) picks.push({ uid, p, joker: !!predictions[uid]?.jokers?.[g.id] }); });
    if (picks.length === 0) return;
    const day = dayKeyOfMs(g.tipoffMs, timezone);
    const oldRes = scoreGamePicksLegacy({ game: g, picks, scoring: sc });
    const newRes = scoreGamePicks({ game: g, picks, scoring: sc });
    const autos = picks.filter(({ p }) => p.autoFilled).length;
    summary.picksChecked += picks.length; summary.autoPicks += autos;
    if (autos > 0) summary.gamesWithAuto += 1;
    const row = { id: g.id, day, t1: g.t1, t2: g.t2, picks: picks.length, autos, autoLost: 0, realGained: 0, realLost: 0, delta: 0, players: 0 };
    picks.forEach(({ uid, p }) => {
      const o = oldRes[uid]; const n = newRes[uid];
      if (!o || !n) return;
      const riskOld = o.riskPts > 0; const riskNew = n.riskPts > 0;
      if (riskOld) summary.riskBonusesOld += 1;
      if (riskNew) summary.riskBonusesNew += 1;
      if (!!o.uniquePts !== !!n.uniquePts) summary.uniqueChanged += 1;
      const d = r2(n.pts - o.pts); const dn = r2(n.ptsNoJoker - o.ptsNoJoker);
      if (d === 0 && dn === 0 && riskOld === riskNew) return;
      const x = get(uid);
      x.delta = r2(x.delta + d); x.deltaNoJoker = r2(x.deltaNoJoker + dn); x.games += 1;
      const dd = (x.byDay[day] ||= { pts: 0, noJoker: 0 }); dd.pts = r2(dd.pts + d); dd.noJoker = r2(dd.noJoker + dn);
      if (riskOld && !riskNew) { if (p.autoFilled) { x.autoLost += 1; row.autoLost += 1; summary.autoLost += 1; } else { x.realLost += 1; row.realLost += 1; summary.realLost += 1; } }
      if (!riskOld && riskNew) { x.realGained += 1; row.realGained += 1; summary.realGained += 1; }
      if (d < 0) summary.pointsRemoved = r2(summary.pointsRemoved - d); else summary.pointsAdded = r2(summary.pointsAdded + d);
      row.delta = r2(row.delta + d); row.players += 1;
    });
    if (row.players > 0) { summary.gamesAffected += 1; touched.push(row); }
  });

  // a check that this replica of today's rule equals the database
  let check = null;
  if (storedGamePts) {
    const today = computeAllPoints({ games, predictions, uids, scoring: sc, countedRounds, timezone });
    const bad = uids.filter((u) => r2(today[u]?.gamePts ?? 0) !== r2(storedGamePts[u] ?? 0));
    check = { players: uids.length, mismatches: bad };
  }

  // the main table: who would change place
  let rankChanges = [];
  if (totals) {
    const rank = (m) => { const l = uids.map((u) => [u, m[u] ?? 0]); return Object.fromEntries(l.map(([u, v]) => [u, 1 + l.filter(([, w]) => w > v).length])); };
    const after = Object.fromEntries(uids.map((u) => [u, r2((totals[u] ?? 0) + (byPlayer[u]?.delta ?? 0))]));
    const rb = rank(totals); const ra = rank(after);
    rankChanges = uids.filter((u) => rb[u] !== ra[u]).map((u) => ({ uid: u, from: rb[u], to: ra[u], total: totals[u] ?? 0, after: after[u] })).sort((a, b) => a.from - b.from);
  }
  return { summary, byPlayer, games: touched, check, rankChanges };
}

/**
 * The mid-season tournament group tables under both rules (the group stage is running): would any group change its ORDER, or the two places that qualify?
 * mid: midTournament/main ({groups, overrides}); pointsRows: points docs ({uid, name, byDay, total}); byPlayer: riskImpact().byPlayer; todayKey: Israel day key.
 */
export function groupsImpact({ mid, pointsRows, byPlayer, todayKey, bracketGames = [] }) {
  if (!mid?.groups || Object.values(mid.groups).flat().length === 0) return null;
  const rowsFor = (apply) => Object.fromEntries(pointsRows.map((p) => {
    const delta = apply ? byPlayer[p.uid] : null;
    const byDay = { ...(p.byDay || {}) };
    if (delta) {
      Object.entries(delta.byDay).forEach(([day, v]) => {
        const c = byDay[day] ? [...byDay[day]] : [0, 0, 0, 0, 0];
        const noJoker = c[4] ?? c[0] ?? 0;
        c[0] = (c[0] ?? 0) + v.pts; c[4] = noJoker + v.noJoker; byDay[day] = c; // the tournament counts the points WITHOUT the joker (the 5th number)
      });
    }
    return [p.uid, { uid: p.uid, name: p.name, byDay, total: (p.total ?? 0) + (delta?.delta ?? 0) }];
  }));
  const build = (apply) => buildBracket({ groups: mid.groups, rowsByUid: rowsFor(apply), overrides: mid.overrides || {}, todayKey, games: bracketGames });
  const A = build(false); const B = build(true);
  const W = MID_WINDOWS.G;
  const inWindow = (uid) => Object.entries(byPlayer[uid]?.byDay || {}).filter(([d]) => d >= W.lo && d <= W.hi).reduce((s, [, v]) => s + v.noJoker, 0);
  const gap = (t) => (t.length >= 3 ? r2(t[1].pts - t[2].pts) : null);
  const groups = Object.keys(A.tables).map((g) => {
    const a = A.tables[g].table; const b = B.tables[g].table;
    const same = (x, y) => x.map((r) => r.uid).join() === y.map((r) => r.uid).join();
    return { group: g, touched: a.some((r) => Math.round(inWindow(r.uid) * 100) !== 0), before: a, after: b,
      orderChanged: !same(a, b), topTwoChanged: [...a.slice(0, 2)].map((r) => r.uid).sort().join() !== [...b.slice(0, 2)].map((r) => r.uid).sort().join(),
      gapBefore: gap(a), gapAfter: gap(b), tieBefore: A.tables[g].needsDecision, tieAfter: B.tables[g].needsDecision };
  }).filter((x) => x.before.length > 0);
  return { status: A.status.G, groups, anyOrderChange: groups.some((x) => x.orderChanged), anyTopTwoChange: groups.some((x) => x.topTwoChanged) };
}
