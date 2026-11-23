import { describe, it, expect } from 'vitest';
import { jokerReport } from './jokerReport.js';

const G = (id, day, status = 'finished', extra = {}) => ({ id, round: 'RS', status, t1: 'BOS', t2: 'NYK', s1: status === 'finished' ? 110 : null, s2: status === 'finished' ? 100 : null, tipoffMs: Date.parse(`2026-11-${day}T18:00:00Z`), ...extra });
const home = { s1: 108, s2: 100 }; // the right winner (the home team won 110-100)
const away = { s1: 100, s2: 108 }; // the wrong winner
const base = { uids: ['a', 'b', 'c'], names: { a: 'דן', b: 'מאיה', c: 'נועה' }, countedRounds: ['RS'] };

describe('the joker report', () => {
  const games = [G('g1', '15'), G('g2', '16'), G('g3', '17', 'scheduled'), G('g4', '18', 'cancelled'), G('g5', '30')];
  const predictions = {
    a: { games: { g1: away, g2: home, g3: home, g4: home, g5: away }, jokers: { g1: true, g3: true, g4: true, g5: true } },
    b: { games: { g1: home, g2: away }, jokers: { g1: true, g2: true } },
    c: { games: { g1: home, g2: home }, jokers: {} },
  };
  const r = jokerReport({ ...base, games, predictions, from: '2026-11-15', to: '2026-11-21' });

  it('lists the jokers of the range: the finished ones with their points, the pending ones apart', () => {
    expect(r.rows.map((x) => `${x.name}:${x.id}`)).toEqual(['דן:g1', 'מאיה:g1', 'מאיה:g2', 'דן:g3']);
    expect(r.pending.map((x) => `${x.name}:${x.id}:${x.status}`)).toEqual(['דן:g3:scheduled']);
    expect(r.finished).toHaveLength(3);
  });
  it('a joker on the wrong winner gave 0 points, a joker on the right winner gave points WITH the doubling', () => {
    expect(r.zero.map((x) => `${x.name}:${x.id}`)).toEqual(['דן:g1', 'מאיה:g2']); // g1: a picked the away team, g2: b picked the away team
    const b1 = r.rows.find((x) => x.name === 'מאיה' && x.id === 'g1');
    expect(b1.pts).toBeGreaterThan(0);
    expect(b1.pts % 2).toBe(0); // doubled
    expect(b1).toMatchObject({ pick: '108-100', result: '110-100', finished: true });
  });
  it('a cancelled game, a game out of the range and a joker without a pick are not listed', () => {
    expect(r.rows.find((x) => x.id === 'g4')).toBeUndefined();
    expect(r.rows.find((x) => x.id === 'g5')).toBeUndefined();
    const noPick = jokerReport({ ...base, games, predictions: { a: { games: {}, jokers: { g1: true } } } });
    expect(noPick.rows).toEqual([]);
  });
  it('no range = every game; a player who played no joker is not in the report', () => {
    const all = jokerReport({ ...base, games, predictions });
    expect(all.rows.map((x) => x.id)).toContain('g5');
    expect(all.rows.every((x) => x.name !== 'נועה')).toBe(true);
  });
});
