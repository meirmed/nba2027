import { describe, it, expect } from 'vitest';
import { myPickState } from './myPick.js';

describe('colour of the "my pick" label', () => {
  it('points -> green', () => {
    expect(myPickState({ hasPick: true, scoredPts: 5, canScore: true })).toEqual({ state: 'pts', pts: 5 });
    expect(myPickState({ hasPick: true, scoredPts: 0.5, canScore: true }).state).toBe('pts');
  });
  it('a pick with no points (wrong winner) -> orange', () => {
    expect(myPickState({ hasPick: true, scoredPts: 0, canScore: true })).toEqual({ state: 'zero', pts: 0 });
  });
  it('did not predict -> orange, with 0 points once the game can be scored', () => {
    expect(myPickState({ hasPick: false, canScore: true })).toEqual({ state: 'zero', pts: 0 });
    expect(myPickState({ hasPick: false, canScore: false })).toEqual({ state: 'zero', pts: null });
  });
  it('a pick that cannot be scored yet (picks not loaded, live tie) -> grey, no points shown', () => {
    expect(myPickState({ hasPick: true, scoredPts: undefined, canScore: false })).toEqual({ state: 'pending', pts: null });
    expect(myPickState({ hasPick: true, scoredPts: undefined, canScore: true })).toEqual({ state: 'pending', pts: null });
  });
});
