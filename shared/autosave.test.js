import { describe, it, expect } from 'vitest';
import { AUTOSAVE_IDLE_MS, AUTOSAVE_TYPING_MS, autosaveDelay, draftsAfterSave, jokerDraftsAfterSave } from './autosave.js';

describe('when the autosave fires', () => {
  it('2 seconds while the player is typing in the score boxes, a quarter of a second once he has left them', () => {
    expect(AUTOSAVE_TYPING_MS).toBe(2000);
    expect(AUTOSAVE_IDLE_MS).toBe(250);
    expect(autosaveDelay(true)).toBe(2000);
    expect(autosaveDelay('g1')).toBe(2000); // the id of the game being edited
    expect(autosaveDelay(null)).toBe(250);
  });
});

describe('what is forgotten after a save (the lost digit)', () => {
  it('a draft that is exactly what was sent is finished', () => {
    const d = draftsAfterSave({ g1: { s1: '110', s2: '102' }, g2: { s1: '99', s2: '95' } }, { g1: { s1: 110, s2: 102 }, g2: { s1: 99, s2: 95 } }, ['g1', 'g2']);
    expect(d).toEqual({});
  });

  it('REGRESSION: "12" was sent, and the player typed "3" while the save was on its way: the draft "123" must stay', () => {
    const typedMeanwhile = { g1: { s1: '123', s2: '98' } };
    const kept = draftsAfterSave(typedMeanwhile, { g1: { s1: 12, s2: 98 } }, ['g1']);
    expect(kept).toEqual({ g1: { s1: '123', s2: '98' } }); // before the fix this draft was deleted and the field went back to 12
  });

  it('a game the server rejected, or a draft that was not sent, stays', () => {
    const d = { g1: { s1: '110', s2: '102' }, g2: { s1: '5', s2: '' } };
    expect(draftsAfterSave(d, { g1: { s1: 110, s2: 102 } }, [])).toEqual(d); // rejected (locked, tie ...)
    expect(draftsAfterSave(d, { g1: { s1: 110, s2: 102 } }, ['g1'])).toEqual({ g2: { s1: '5', s2: '' } });
  });

  it('an incomplete or non-numeric draft is never treated as sent', () => {
    expect(draftsAfterSave({ g1: { s1: '', s2: '102' } }, { g1: { s1: 0, s2: 102 } }, ['g1'])).toEqual({ g1: { s1: '', s2: '102' } });
  });

  it('jokers: a switch tapped again during the save stays; one that is still what was sent is finished', () => {
    expect(jokerDraftsAfterSave({ g1: true }, { g1: true }, ['g1'])).toEqual({});
    expect(jokerDraftsAfterSave({ g1: false }, { g1: true }, ['g1'])).toEqual({ g1: false }); // turned off again while "on" was being saved
    expect(jokerDraftsAfterSave({ g1: true, g2: true }, { g1: true, g2: true }, ['g1'])).toEqual({ g2: true }); // g2 was rejected
  });
});
