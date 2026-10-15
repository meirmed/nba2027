import { describe, it, expect } from 'vitest';
import { managerCanAddGame, managerCanChangeGame, MANAGER_STATUSES } from './gamesAccess.js';

const NOW = 1_000_000;
describe('games manager limits', () => {
  it('may change / cancel / delete only games that have not started', () => {
    expect(managerCanChangeGame({ status: 'scheduled', tipoffMs: NOW + 1 }, NOW)).toBe(true);
    expect(managerCanChangeGame({ status: 'cancelled', tipoffMs: NOW + 1 }, NOW)).toBe(true);
    expect(managerCanChangeGame({ status: 'scheduled', tipoffMs: NOW }, NOW)).toBe(false); // tip-off reached
    expect(managerCanChangeGame({ status: 'scheduled', tipoffMs: NOW - 1 }, NOW)).toBe(false);
    expect(managerCanChangeGame({ status: 'live', tipoffMs: NOW + 5000 }, NOW)).toBe(false);
    expect(managerCanChangeGame({ status: 'finished', tipoffMs: NOW - 5000 }, NOW)).toBe(false);
    expect(managerCanChangeGame(null, NOW)).toBe(false);
  });
  it('may add / import only future games, and set only scheduled or cancelled', () => {
    expect(managerCanAddGame(NOW + 60_000, NOW)).toBe(true);
    expect(managerCanAddGame(NOW - 1, NOW)).toBe(false);
    expect(managerCanAddGame(NaN, NOW)).toBe(false);
    expect(MANAGER_STATUSES).toEqual(['scheduled', 'cancelled']);
  });
});
