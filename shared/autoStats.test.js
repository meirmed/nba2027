import { describe, it, expect } from 'vitest';
import { autoRows, autoStatsOf } from './autoStats.js';

const game = (a, w, pts) => ({ a, w, pts, s1: 100, s2: 90 });

describe('the 🎲 tab: random (auto-filled) results', () => {
  it('counts only the auto-filled picks: how many, their points and the right winners', () => {
    expect(autoStatsOf({ g1: game(1, 1, 4), g2: game(1, 0, 0), g3: game(0, 1, 11), g4: game(1, 1, 2.5) })).toEqual({ games: 3, pts: 6.5, winners: 2 });
  });
  it('a player without any auto-filled pick, or without details, has zeros', () => {
    expect(autoStatsOf({ g1: game(0, 1, 11) })).toEqual({ games: 0, pts: 0, winners: 0 });
    expect(autoStatsOf(undefined)).toEqual({ games: 0, pts: 0, winners: 0 });
    expect(autoStatsOf({})).toEqual({ games: 0, pts: 0, winners: 0 });
  });
  const players = [{ uid: 'a', name: 'דן' }, { uid: 'b', name: 'מאיה' }, { uid: 'c', name: 'נועה' }, { uid: 'd', name: 'אורי' }, { uid: 'e', name: 'יוסי' }];
  const detail = {
    a: { byGame: { g1: game(1, 1, 4), g2: game(1, 0, 0) } }, // 2 games, 4 points, 50%
    b: { byGame: { g1: game(1, 1, 4), g2: game(1, 1, 2), g3: game(1, 0, 0) } }, // 3 games, 6 points, 67%
    c: { byGame: { g1: game(1, 1, 5), g2: game(1, 1, 5), g3: game(1, 1, 5) } }, // 3 games, 15 points, 100%
    d: { byGame: { g1: game(0, 1, 11) } }, // no random result
    // e: no details at all
  };
  it('sorted from the most random games to the fewest, ties by points; the players without any are last', () => {
    const rows = autoRows(players, detail);
    expect(rows.map((r) => r.name)).toEqual(['נועה', 'מאיה', 'דן', 'אורי', 'יוסי']); // c and b both have 3 games: c has more points; d and e have 0 (by name)
    expect(rows.map((r) => r.games)).toEqual([3, 3, 2, 0, 0]);
  });
  it('the % of right winners is winners / games', () => {
    const rows = autoRows(players, detail);
    expect(rows.find((r) => r.uid === 'a').pct).toBeCloseTo(0.5, 6);
    expect(rows.find((r) => r.uid === 'b').pct).toBeCloseTo(2 / 3, 6);
    expect(rows.find((r) => r.uid === 'c').pct).toBe(1);
    expect(rows.find((r) => r.uid === 'e').pct).toBe(0);
  });
  it('the other fields of a player (photo, ...) are kept', () => {
    expect(autoRows([{ uid: 'a', name: 'דן', photoURL: 'x' }], detail)[0]).toMatchObject({ uid: 'a', photoURL: 'x', games: 2, pts: 4, winners: 1 });
  });
});
