import { describe, it, expect } from 'vitest';
import { buildGameId, validateGame, seriesIdOf, buildRegularSeasonId, countsForStandings } from './games.js';
import { TEAMS } from './teams.js';

const ok = { round: 'R1', seriesKey: 'E-1', gameNum: 1, t1: 'BOS', t2: 'MIA', status: 'scheduled', tipoff: new Date(), s1: null, s2: null };

describe('games', () => {
  it('builds ids', () => {
    expect(buildGameId('R1', 'E-1', 3)).toBe('R1-E-1_G3');
    expect(seriesIdOf('F', 'F')).toBe('F-F');
  });
  it('accepts a valid scheduled game', () => expect(validateGame(ok)).toEqual([]));
  it('rejects ties and bad scores when finished', () => {
    expect(validateGame({ ...ok, status: 'finished', s1: 100, s2: 100 })).toContain('err.tie');
    expect(validateGame({ ...ok, status: 'finished', s1: -1, s2: 90 })).toContain('err.score');
    expect(validateGame({ ...ok, status: 'finished', s1: 101, s2: 99 })).toEqual([]);
  });
  it('rejects same team, bad game number, bad round', () => {
    expect(validateGame({ ...ok, t2: 'BOS' })).toContain('err.sameTeam');
    expect(validateGame({ ...ok, gameNum: 8 })).toContain('err.gameNum');
    expect(validateGame({ ...ok, round: 'R3' })).toContain('err.round');
  });
});

describe('regular season games', () => {
  const rs = { round: 'RS', seriesKey: 'RS', gameNum: null, t1: 'BOS', t2: 'NYK', status: 'scheduled', tipoff: new Date('2026-10-22T23:30:00Z'), s1: null, s2: null };
  it('needs no series key / game number but requires both teams', () => {
    expect(validateGame(rs)).toEqual([]);
    expect(validateGame({ ...rs, t2: '' })).toContain('err.teams');
  });
  it('builds ids from UTC date + teams', () => {
    expect(buildRegularSeasonId(rs.tipoff, 'BOS', 'NYK')).toBe('RS-20261022-BOS-NYK');
  });
});

describe('countsForStandings', () => {
  it('counts regular season only by default; ignores cancelled', () => {
    expect(countsForStandings({ round: 'RS', status: 'finished' })).toBe(true);
    expect(countsForStandings({ round: 'R1', status: 'finished' })).toBe(false);
    expect(countsForStandings({ round: 'RS', status: 'cancelled' })).toBe(false);
    expect(countsForStandings({ round: 'R1', status: 'finished' }, ['RS', 'R1'])).toBe(true);
  });
});

describe('teams', () => {
  it('has 30 unique teams, 15 per conference', () => {
    expect(TEAMS).toHaveLength(30);
    expect(new Set(TEAMS.map((t) => t.abbr)).size).toBe(30);
    expect(TEAMS.filter((t) => t.conf === 'E')).toHaveLength(15);
  });
});
