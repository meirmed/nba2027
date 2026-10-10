import { describe, it, expect } from 'vitest';
import { parseApiGame, planGameUpdate } from './live.js';

const api = (o = {}) => ({ id: 1, status: 'Final', status_state: 'final', period: 4, time: 'Final', home_team_score: 110, visitor_team_score: 104,
  datetime: '2026-10-22T23:30:00.000Z', home_ot1: null, home_ot2: null, home_ot3: null, visitor_ot1: null, visitor_ot2: null, visitor_ot3: null, ...o });
const cur = (o = {}) => ({ status: 'scheduled', s1: null, s2: null, ot: 0, liveText: null, winner: null, t1: 'BOS', t2: 'NYK', tipoffMs: Date.parse('2026-10-22T23:30:00.000Z'), overridden: false, picksLocked: false, ...o });

describe('parseApiGame', () => {
  it('final with overtime counts OT and keeps the final score', () => {
    expect(parseApiGame(api({ period: 6, home_ot1: 11, visitor_ot1: 11, home_ot2: 10, visitor_ot2: 9 }))).toMatchObject({ status: 'finished', ot: 2, s1: 110, s2: 104 });
  });
  it('live quarter / halftime / overtime text', () => {
    expect(parseApiGame(api({ status: '3rd Qtr', status_state: 'in_progress', period: 3, time: '5:12' }))).toMatchObject({ status: 'live', liveText: 'Q3 5:12' });
    expect(parseApiGame(api({ status: 'Halftime', status_state: 'in_progress', period: 2, time: ' ' })).liveText).toBe('Half');
    expect(parseApiGame(api({ status: '1st OT', status_state: 'in_progress', period: 5, time: '2:10' })).liveText).toBe('OT1 2:10');
  });
  it('scheduled, canceled, and states we must not act on', () => {
    expect(parseApiGame(api({ status: '7:00 pm ET', status_state: 'scheduled', period: 0 })).status).toBe('scheduled');
    expect(parseApiGame(api({ status_state: 'canceled' })).status).toBe('cancelled');
    ['postponed', 'delayed', 'suspended', 'abandoned'].forEach((s) => expect(parseApiGame(api({ status_state: s })).status).toBeNull());
  });
  it('falls back to the status text when status_state is missing', () => {
    expect(parseApiGame(api({ status_state: undefined })).status).toBe('finished');
    expect(parseApiGame(api({ status_state: undefined, status: '2nd Qtr', period: 2 })).status).toBe('live');
  });
  it('rejects junk', () => { expect(parseApiGame(null)).toBeNull(); expect(parseApiGame({})).toBeNull(); });
});

describe('planGameUpdate', () => {
  it('scheduled -> live writes score + live text', () => {
    const p = planGameUpdate(cur(), parseApiGame(api({ status: '1st Qtr', status_state: 'in_progress', period: 1, time: '9:00', home_team_score: 4, visitor_team_score: 2 })));
    expect(p).toEqual({ status: 'live', s1: 4, s2: 2, liveText: 'Q1 9:00' });
  });
  it('live -> finished sets winner and clears live text', () => {
    const p = planGameUpdate(cur({ status: 'live', s1: 100, s2: 98, liveText: 'Q4 0:10' }), parseApiGame(api()));
    expect(p).toEqual({ status: 'finished', s1: 110, s2: 104, liveText: null, winner: 'BOS' });
  });
  it('away win sets the away team as winner', () => {
    expect(planGameUpdate(cur(), parseApiGame(api({ home_team_score: 90, visitor_team_score: 99 }))).winner).toBe('NYK');
  });
  it('no change -> null; never regresses a finished game', () => {
    const fin = cur({ status: 'finished', s1: 110, s2: 104, winner: 'BOS' });
    expect(planGameUpdate(fin, parseApiGame(api()))).toBeNull();
    expect(planGameUpdate(fin, parseApiGame(api({ status: '4th Qtr', status_state: 'in_progress', period: 4, time: '1:00' })))).toBeNull();
  });
  it('score corrections on a finished game are applied', () => {
    const fin = cur({ status: 'finished', s1: 110, s2: 104, winner: 'BOS' });
    expect(planGameUpdate(fin, parseApiGame(api({ home_team_score: 111 })))).toEqual({ s1: 111 });
  });
  it('manual override is respected unless forced', () => {
    expect(planGameUpdate(cur({ overridden: true }), parseApiGame(api()))).toBeNull();
    expect(planGameUpdate(cur({ overridden: true }), parseApiGame(api()), { force: true })).toMatchObject({ status: 'finished' });
  });
  it('refuses a tied or incomplete final', () => {
    expect(planGameUpdate(cur(), parseApiGame(api({ home_team_score: 100, visitor_team_score: 100 })))).toBeNull();
    expect(planGameUpdate(cur(), parseApiGame(api({ home_team_score: null })))).toBeNull();
  });
  it('reschedules only open, unlocked games to a later future time', () => {
    const sched = (iso, c = {}) => planGameUpdate(cur(c), parseApiGame(api({ status_state: 'scheduled', status: '8:00 pm ET', period: 0, datetime: iso })), { nowMs: Date.parse('2026-10-20T00:00:00Z') });
    expect(sched('2026-10-23T01:30:00.000Z')).toEqual({ tipoff: '2026-10-23T01:30:00.000Z' });
    expect(sched('2026-10-23T01:30:00.000Z', { picksLocked: true })).toBeNull();
    expect(sched('2026-10-22T23:30:20.000Z')).toBeNull(); // < 60 s difference
    expect(sched('2026-10-19T23:30:00.000Z')).toBeNull(); // in the past
  });
  it('cancelled game is cancelled, but not if already finished', () => {
    expect(planGameUpdate(cur(), parseApiGame(api({ status_state: 'canceled' })))).toEqual({ status: 'cancelled' });
    expect(planGameUpdate(cur({ status: 'finished' }), parseApiGame(api({ status_state: 'canceled' })))).toBeNull();
  });
});
