// Dry run of a whole (smaller) season with the REAL scoring, bonus, auto-fill and Head to Head code. Seeded: fully reproducible.
import { describe, it, expect } from 'vitest';
import { buildSeason, applyPatch, rng } from '../scripts/lib/simulate.mjs';
import { computeAllPoints, rankRows } from './standings.js';
import { computeBonusPoints } from './bonus.js';
import { scoreGamePicks } from './standings.js';
import { windowStats, drawGroups, rankGroup, seedQualifiers, pairSeeds, resolvePair, closeStagePatch, activeStageId } from './h2h.js';
import { addDaysToKey } from './daykeys.js';

const TZ = 'Asia/Jerusalem';
const season = buildSeason({ users: 40, days: 60, seed: 7 });
const run = (s = season, uids = s.uids) => computeAllPoints({ games: s.games, predictions: s.predictions, uids, scoring: undefined, countedRounds: ['RS'], timezone: TZ });
const res = run();
const sum = (o, f) => Object.values(o).reduce((n, v) => n + f(v), 0);

describe('season dry run: points are internally consistent', () => {
  it('every user: per-game, per-day and per-round totals all equal gamePts', () => {
    season.uids.forEach((u) => {
      const r = res[u];
      expect(sum(r.byGame, (g) => g.pts)).toBe(r.gamePts);
      expect(sum(r.byDay, (d) => d[0])).toBe(r.gamePts);
      expect(sum(r.byDay, (d) => d[1])).toBe(r.exactHits);
      expect(sum(r.byDay, (d) => d[2])).toBe(r.uniqueHits);
      expect(r.gamePtsByRound.RS ?? 0).toBe(r.gamePts);
      expect(Object.keys(r.byGame).length).toBe(r.gamesPlayed);
      expect(Number.isInteger(r.gamePts)).toBe(true);
      expect(r.winnerCorrect).toBe(r.gameHits);
      expect(r.winnerCorrect).toBeLessThanOrEqual(r.gamesPlayed);
    });
  });
  it('is deterministic and independent of user order', () => {
    expect(run()).toEqual(res);
    const reversed = run(season, [...season.uids].reverse());
    season.uids.forEach((u) => expect(reversed[u]).toEqual(res[u]));
  });
  it('at most one unique bonus per game, and never for an auto-filled pick', () => {
    const perGame = {};
    season.uids.forEach((u) => Object.entries(res[u].byGame).forEach(([gid, g]) => {
      if (g.u) {
        perGame[gid] = (perGame[gid] || 0) + 1;
        expect(season.predictions[u].games[gid].autoFilled).toBeFalsy();
      }
    }));
    Object.values(perGame).forEach((n) => expect(n).toBe(1));
    expect(Object.keys(perGame).length).toBeGreaterThan(0);
  });
  it('jokers (3 per player) and auto-fill (never more than half of a normal pick) behave', () => {
    season.uids.forEach((u) => expect(Object.keys(season.predictions[u].jokers).length).toBeLessThanOrEqual(3));
    season.games.slice(0, 40).forEach((g) => {
      const picks = season.uids.map((uid) => ({ uid, p: season.predictions[uid].games[g.id], joker: !!season.predictions[uid].jokers[g.id] }));
      const out = scoreGamePicks({ game: g, picks, scoring: undefined });
      picks.filter((x) => x.p.autoFilled).forEach((x) => expect(out[x.uid].uniquePts).toBe(0));
      Object.values(out).forEach((o) => expect(o.pts).toBeGreaterThanOrEqual(0));
    });
  });
  it('the auto-fill produced a realistic share of picks', () => {
    const total = season.uids.length * season.games.length;
    expect(season.autoFilledCount / total).toBeGreaterThan(0.04);
    expect(season.autoFilledCount / total).toBeLessThan(0.12);
  });
});

describe('season dry run: leaderboard and bonus', () => {
  const bonus = computeBonusPoints({ questions: season.questions, predictions: season.predictions, uids: season.uids });
  const rows = season.uids.map((u) => ({ uid: u, ...res[u], bonus: bonus[u].bonus, total: Math.round((res[u].gamePts + bonus[u].bonus) * 100) / 100 }));
  it('bonus points add up per question and category', () => {
    season.uids.forEach((u) => {
      const b = bonus[u];
      expect(Math.round(sum(b.byQuestion, (x) => x) * 100) / 100).toBe(b.bonus);
      expect(Math.round(sum(b.byCategory, (x) => x) * 100) / 100).toBe(b.bonus);
      expect(b.bonus).toBeGreaterThanOrEqual(0);
    });
  });
  it('ranks are sorted, ties share a rank, total = games + bonus', () => {
    const ranked = rankRows(rows, ['total', 'exactHits', 'uniqueHits', 'bonus']);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i].rank).toBeGreaterThanOrEqual(ranked[i - 1].rank);
      expect(ranked[i].total).toBeLessThanOrEqual(ranked[i - 1].total);
    }
    expect(ranked[0].rank).toBe(1);
    rows.forEach((r) => expect(r.total).toBeCloseTo(r.gamePts + r.bonus, 5));
  });
});

describe('season dry run: Head to Head from the daily totals', () => {
  const firstDay = '2026-10-22';
  const stats = (uid, from = null, to = null) => windowStats(res[uid].byDay, from, to);

  it('windows partition the season exactly (nothing lost, nothing counted twice)', () => {
    season.uids.forEach((u) => {
      const a = stats(u, null, addDaysToKey(firstDay, 19));
      const b = stats(u, addDaysToKey(firstDay, 20), addDaysToKey(firstDay, 39));
      const c = stats(u, addDaysToKey(firstDay, 40), null);
      expect(a.pts + b.pts + c.pts).toBe(res[u].gamePts);
      expect(a.exactHits + b.exactHits + c.exactHits).toBe(res[u].exactHits);
      expect(stats(u, null, null).uniqueHits).toBe(res[u].uniqueHits);
    });
  });

  it('plays a whole tournament: groups -> 16 qualifiers -> knockout -> champion', () => {
    const r = rng(11);
    const groups = drawGroups(season.uids, 4, r);
    expect(Object.values(groups).flat().length).toBe(40);
    const tables = Object.fromEntries(Object.entries(groups).map(([g, m]) => [g, rankGroup(m, (u) => stats(u, null, addDaysToKey(firstDay, 29)))]));
    const seeds = seedQualifiers(tables, 4);
    expect(seeds.length).toBe(16);
    expect(new Set(seeds.map((s) => s.uid)).size).toBe(16);

    let t = { status: 'knockout', stages: { K1: { stageNum: 1, startDay: addDaysToKey(firstDay, 30), endDay: null, pairs: pairSeeds(seeds) } } };
    let day = addDaysToKey(firstDay, 30);
    const sizes = [];
    for (let guard = 0; guard < 6 && t.status !== 'finished'; guard += 1) {
      const id = activeStageId(t.stages);
      const stage = t.stages[id];
      sizes.push(Object.keys(stage.pairs).length);
      const nextDay = addDaysToKey(day, 7);
      const results = Object.fromEntries(Object.entries(stage.pairs).map(([pid, p]) => {
        let rr = resolvePair(p, (u) => stats(u, stage.startDay, addDaysToKey(nextDay, -1)));
        if (!rr.winnerUid) rr = { ...rr, winnerUid: p.a }; // unresolved tie: admin override
        return [pid, rr];
      }));
      const out = closeStagePatch(t, results, nextDay);
      expect(out.error).toBeUndefined();
      t = applyPatch(t, out.patch);
      day = nextDay;
    }
    expect(sizes).toEqual([8, 4, 2, 1]);
    expect(t.status).toBe('finished');
    expect(seeds.map((s) => s.uid)).toContain(t.championUid);
  });
});
