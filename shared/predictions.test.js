import { describe, it, expect } from 'vitest';
import { planSave, gameOpenReason, countJokers } from './predictions.js';

const NOW = 1_000_000;
const open = { round: 'RS', status: 'scheduled', t1: 'BOS', t2: 'NYK', tipoffMs: NOW + 60_000 };
const base = (over = {}) => ({ existing: { games: {}, jokers: {} }, games: { a: open, b: { ...open }, c: { ...open }, d: { ...open }, e: { ...open } }, picks: {}, jokers: {}, nowMs: NOW, maxJokers: 3, countedRounds: ['RS'], ...over });

describe('gameOpenReason', () => {
  it('open game', () => expect(gameOpenReason(open, NOW)).toBeNull());
  it('locks at tip-off (inclusive) and after', () => {
    expect(gameOpenReason({ ...open, tipoffMs: NOW }, NOW)).toBe('locked');
    expect(gameOpenReason({ ...open, tipoffMs: NOW - 1 }, NOW)).toBe('locked');
  });
  it('closed / not counted / tbd / missing', () => {
    expect(gameOpenReason({ ...open, status: 'live' }, NOW)).toBe('closed');
    expect(gameOpenReason({ ...open, status: 'cancelled' }, NOW)).toBe('closed');
    expect(gameOpenReason({ ...open, round: 'R1' }, NOW)).toBe('not-counted');
    expect(gameOpenReason({ ...open, t2: null }, NOW)).toBe('teams-tbd');
    expect(gameOpenReason(undefined, NOW)).toBe('not-found');
  });
});

describe('planSave picks', () => {
  it('accepts valid picks, rejects ties, bad scores and locked games', () => {
    const r = planSave(base({
      games: { a: open, b: open, c: open, d: { ...open, tipoffMs: NOW - 5 } },
      picks: { a: { s1: 110, s2: 100 }, b: { s1: 100, s2: 100 }, c: { s1: -1, s2: 90 }, d: { s1: 90, s2: 80 }, z: { s1: 1, s2: 2 } },
    }));
    expect(r.picks).toEqual({ a: { s1: 110, s2: 100 } });
    expect(Object.fromEntries(r.rejected.map((x) => [x.id, x.reason]))).toEqual({ b: 'tie', c: 'invalid-score', d: 'locked', z: 'not-found' });
  });
  it('rejects non-integers and scores above 200', () => {
    const r = planSave(base({ picks: { a: { s1: 100.5, s2: 90 }, b: { s1: 201, s2: 90 }, c: { s1: '100', s2: 90 } } }));
    expect(r.picks).toEqual({});
    expect(r.rejected).toHaveLength(3);
  });
});

describe('planSave jokers', () => {
  it('needs a pick first (new or existing)', () => {
    expect(planSave(base({ jokers: { a: true } })).rejected).toEqual([{ id: 'a', reason: 'joker-needs-pick' }]);
    expect(planSave(base({ jokers: { a: true }, picks: { a: { s1: 100, s2: 90 } } })).jokersOn).toEqual(['a']);
    expect(planSave(base({ jokers: { a: true }, existing: { games: { a: { s1: 1, s2: 2 } }, jokers: {} } })).jokersOn).toEqual(['a']);
  });
  it('enforces the season limit', () => {
    const picks = { a: { s1: 2, s2: 1 }, b: { s1: 2, s2: 1 }, c: { s1: 2, s2: 1 }, d: { s1: 2, s2: 1 } };
    const r = planSave(base({ picks, jokers: { a: true, b: true, c: true, d: true } }));
    expect(r.jokersOn).toEqual(['a', 'b', 'c']);
    expect(r.rejected).toEqual([{ id: 'd', reason: 'joker-limit' }]);
  });
  it('allows swapping a joker in one request when at the limit', () => {
    const existing = { games: { a: {}, b: {}, c: {}, d: {} }, jokers: { a: true, b: true, c: true } };
    const r = planSave(base({ existing, jokers: { a: false, d: true } }));
    expect(r.jokersOff).toEqual(['a']);
    expect(r.jokersOn).toEqual(['d']);
    expect(r.rejected).toEqual([]);
  });
  it('cannot remove or add a joker on a locked game', () => {
    const games = { a: { ...open, tipoffMs: NOW - 1 }, b: { ...open, tipoffMs: NOW - 1 } };
    const r = planSave(base({ games, existing: { games: { b: {} }, jokers: { a: true } }, jokers: { a: false, b: true } }));
    expect(r.jokersOff).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['locked', 'locked']);
  });
  it('countJokers ignores falsy entries', () => expect(countJokers({ a: true, b: false, c: true })).toBe(2));
});
