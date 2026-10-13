import { describe, it, expect } from 'vitest';
import { starOfNight } from './night.js';

// Israel is UTC+3 in October (before the clock change): 2026-10-12 22:00 Israel = 19:00 UTC
const at = (day, hh, mm = 0) => Date.UTC(2026, 9, day, hh, mm);
const G = (id, tipoffMs, status = 'finished') => ({ id, round: 'RS', status, tipoffMs });
const R = (byGame) => ({ byGame });
const cell = (pts, x = 0, u = 0) => ({ pts, x, u });

describe('starOfNight', () => {
  // night of the 12th: games at 20:00, 22:30 and 03:00 (after midnight, still "that night"); night of the 13th: one game
  const games = [G('a', at(12, 17)), G('b', at(12, 19, 30)), G('c', at(13, 0)), G('d', at(13, 17))];

  it('groups a game after midnight with the evening before and picks the top scorer', () => {
    const r = starOfNight({ games: games.slice(0, 3), results: {
      u1: R({ a: cell(5), b: cell(5), c: cell(5) }), u2: R({ a: cell(12, 1), b: cell(0), c: cell(5) }), u3: R({ a: cell(0), b: cell(0), c: cell(0) }),
    } });
    expect(r.night).toBe('2026-10-12');
    expect(r.games).toBe(3);
    expect(r.top.map((x) => [x.uid, x.pts])).toEqual([['u2', 17], ['u1', 15]]); // best first
    expect(r.top.find((x) => x.uid === 'u3')).toBeUndefined(); // 0 points = not a star
  });
  it('ignores a night that is still in progress and uses the latest COMPLETE one', () => {
    const live = [...games.slice(0, 3), G('d', at(13, 17), 'live')];
    const r = starOfNight({ games: live, results: { u1: R({ a: cell(5), b: cell(5), c: cell(5), d: cell(9) }) } });
    expect(r.night).toBe('2026-10-12');
    expect(r.top[0].pts).toBe(15); // game d (live) is not part of it
  });
  it('the newest complete night wins', () => {
    const r = starOfNight({ games, results: { u1: R({ a: cell(1), b: cell(1), c: cell(1), d: cell(7) }) } });
    expect(r.night).toBe('2026-10-13');
    expect(r.top).toEqual([{ uid: 'u1', pts: 7, exact: 0, unique: 0 }]);
  });
  it('ties: more exact hits, then more unique hits', () => {
    const r = starOfNight({ games: games.slice(0, 1), results: { u1: R({ a: cell(10, 0, 0) }), u2: R({ a: cell(10, 1, 0) }), u3: R({ a: cell(10, 1, 1) }) } });
    expect(r.top.map((x) => x.uid)).toEqual(['u3', 'u2', 'u1']);
  });
  it('no complete night / nobody scored', () => {
    expect(starOfNight({ games: [G('a', at(12, 17), 'live')], results: {} })).toBeNull();
    expect(starOfNight({ games: games.slice(0, 1), results: { u1: R({ a: cell(0) }) } }).top).toEqual([]);
  });
});
