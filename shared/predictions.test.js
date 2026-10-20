import { describe, it, expect } from 'vitest';
import { planSave, gameOpenReason, countJokers, pickIssue, countActiveJokers, isActiveJokerGame, countSpentJokers } from './predictions.js';

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

describe('pickIssue', () => {
  it('valid, tie, and out-of-range / non-integer', () => {
    expect(pickIssue({ s1: 100, s2: 90 })).toBeNull();
    expect(pickIssue({ s1: 90, s2: 90 })).toBe('tie');
    expect(pickIssue({ s1: -1, s2: 90 })).toBe('invalid-score');
    expect(pickIssue({ s1: 201, s2: 90 })).toBe('invalid-score');
    expect(pickIssue({ s1: 1.5, s2: 90 })).toBe('invalid-score');
    expect(pickIssue(null)).toBe('invalid-score');
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

describe('jokers on deleted or cancelled games are free again', () => {
  const NOW = 1_000_000;
  const open = (id) => ({ round: 'RS', status: 'scheduled', t1: 'BOS', t2: 'NYK', tipoffMs: NOW + 3_600_000, id });
  const plan = (existingJokers, games, jokers) => planSave({
    existing: { games: { g5: { s1: 100, s2: 90 } }, jokers: existingJokers }, games, picks: {}, jokers, nowMs: NOW, maxJokers: 3, countedRounds: ['RS'],
  });

  it('only jokers on games that exist and count are used', () => {
    const games = { ok1: { round: 'RS', status: 'finished' }, cancelled1: { round: 'RS', status: 'cancelled' }, po1: { round: 'R1', status: 'scheduled' } };
    expect(countActiveJokers({ ok1: true, cancelled1: true, deleted1: true, po1: true }, games, ['RS'])).toBe(1);
    expect(countActiveJokers({ ok1: true, off: false }, { ok1: games.ok1, off: games.ok1 }, ['RS'])).toBe(1); // false = not a joker
    expect(isActiveJokerGame(undefined)).toBe(false);
  });
  it('a joker left on a deleted game and one on a cancelled game do not block a new joker', () => {
    // 3 jokers recorded: one on a DELETED game (missing from `games`), one on a CANCELLED game, one on a normal game
    const games = { g5: open('g5'), cancelled1: { round: 'RS', status: 'cancelled' }, live1: { round: 'RS', status: 'finished' } };
    const r = plan({ deleted1: true, cancelled1: true, live1: true }, games, { g5: true });
    expect(r.rejected).toEqual([]);
    expect(r.jokersOn).toEqual(['g5']);
  });
  it('the limit still applies to jokers on games that count', () => {
    const games = { g5: open('g5'), a: { round: 'RS', status: 'finished' }, b: { round: 'RS', status: 'finished' }, c: { round: 'RS', status: 'finished' } };
    const r = plan({ a: true, b: true, c: true }, games, { g5: true });
    expect(r.rejected).toEqual([{ id: 'g5', reason: 'joker-limit' }]);
  });
  it('a cancelled game that is scheduled again uses its joker again', () => {
    const games = { g5: open('g5'), a: { round: 'RS', status: 'finished' }, b: { round: 'RS', status: 'finished' }, c: { round: 'RS', status: 'scheduled' } };
    expect(plan({ a: true, b: true, c: true }, games, { g5: true }).rejected).toEqual([{ id: 'g5', reason: 'joker-limit' }]);
  });
});

describe('jokers SPENT (shown in the leaderboard)', () => {
  const NOW = 5_000_000;
  const games = {
    done: { round: 'RS', status: 'finished', tipoffMs: NOW - 9_000_000 }, live: { round: 'RS', status: 'live', tipoffMs: NOW - 1000 },
    started: { round: 'RS', status: 'scheduled', tipoffMs: NOW - 5000 }, // tip-off passed, the API has not said "live" yet
    soon: { round: 'RS', status: 'scheduled', tipoffMs: NOW + 5000 }, cancelled: { round: 'RS', status: 'cancelled', tipoffMs: NOW - 5000 }, po: { round: 'R1', status: 'finished', tipoffMs: NOW - 5000 },
  };
  it('only jokers on games that have started count as spent', () => {
    const jokers = { done: true, live: true, started: true, soon: true, cancelled: true, po: true, deleted: true, off: false };
    expect(countSpentJokers(jokers, { ...games, off: games.done }, ['RS'], NOW)).toBe(3); // done + live + started; not soon / cancelled / other round / deleted / false
  });
  it('an upcoming joker becomes spent exactly at tip-off', () => {
    expect(countSpentJokers({ soon: true }, games, ['RS'], NOW)).toBe(0);
    expect(countSpentJokers({ soon: true }, games, ['RS'], NOW + 5000)).toBe(1);
  });
  it('no jokers = 0', () => {
    expect(countSpentJokers(undefined, games, ['RS'], NOW)).toBe(0);
    expect(countSpentJokers({}, games, ['RS'], NOW)).toBe(0);
  });
});
