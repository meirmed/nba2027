import { describe, it, expect } from 'vitest';
import { mapScheduleGame, validateImportItem } from './schedule.js';

const api = { id: 18447000, datetime: '2026-10-22T23:30:00.000Z', postseason: false, ist_stage: null,
  home_team: { abbreviation: 'BOS' }, visitor_team: { abbreviation: 'NYK' } };

describe('mapScheduleGame', () => {
  it('maps home->t1, visitor->t2 and builds the id', () => {
    expect(mapScheduleGame(api)).toMatchObject({ apiGameId: 18447000, t1: 'BOS', t2: 'NYK', tipoff: '2026-10-22T23:30:00.000Z', known: true, id: 'RS-20261022-BOS-NYK' });
  });
  it('flags missing tip-off, unknown teams, playoffs and NBA Cup', () => {
    expect(mapScheduleGame({ ...api, datetime: null }).id).toBeNull();
    expect(mapScheduleGame({ ...api, home_team: { abbreviation: 'XXX' } }).known).toBe(false);
    expect(mapScheduleGame({ ...api, postseason: true }).postseason).toBe(true);
    expect(mapScheduleGame({ ...api, ist_stage: 'East Group A' }).cup).toBe(true);
  });
});

describe('validateImportItem', () => {
  const ok = { apiGameId: 1, t1: 'BOS', t2: 'NYK', tipoff: '2026-10-22T23:30:00Z' };
  it('accepts a good item and normalizes it', () => expect(validateImportItem(ok)).toMatchObject({ id: 'RS-20261022-BOS-NYK', tipoff: '2026-10-22T23:30:00.000Z' }));
  it('rejects bad input', () => {
    expect(validateImportItem({ ...ok, t2: 'BOS' })).toBeNull();
    expect(validateImportItem({ ...ok, t1: 'ZZZ' })).toBeNull();
    expect(validateImportItem({ ...ok, tipoff: 'nope' })).toBeNull();
    expect(validateImportItem({ ...ok, apiGameId: '1' })).toBeNull();
    expect(validateImportItem(null)).toBeNull();
  });
});
