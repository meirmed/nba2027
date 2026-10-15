import { describe, it, expect } from 'vitest';
import { CANDIDATE_LISTS, planBulkImport } from './candidates.js';
import { DEFAULT_PLAYER_LISTS } from './lists.js';
import { TEAMS_BY_ABBR } from './teams.js';

describe('prepared candidate lists', () => {
  it('fills exactly the nine standard lists with the sizes of the owner\'s lists', () => {
    expect(CANDIDATE_LISTS.map((l) => l.listId).sort()).toEqual(DEFAULT_PLAYER_LISTS.map((l) => l.id).sort());
    const size = Object.fromEntries(CANDIDATE_LISTS.map((l) => [l.listId, l.entries.length]));
    expect(size).toEqual({ mvp: 10, coaches: 13, roy: 11, defense: 10, scoring: 10, rebounds: 9, assists: 10, steals: 13, blocks: 9 });
  });
  it('every team code is a real team and no list has the same person twice', () => {
    CANDIDATE_LISTS.forEach((l) => {
      l.entries.forEach((e) => { if (e.team) expect(TEAMS_BY_ABBR[e.team], `${e.name} ${e.team}`).toBeTruthy(); });
      expect(new Set(l.entries.map((e) => e.name)).size).toBe(l.entries.length);
    });
  });
  it('a person in several lists is created ONCE with all his lists', () => {
    const { creates, updates } = planBulkImport([], CANDIDATE_LISTS);
    expect(updates).toEqual([]);
    expect(new Set(creates.map((c) => c.name)).size).toBe(creates.length);
    const by = Object.fromEntries(creates.map((c) => [c.name, c.listIds.sort()]));
    expect(by['Nikola Jokic']).toEqual(['assists', 'mvp', 'rebounds', 'scoring']);
    expect(by['Giannis Antetokounmpo']).toHaveLength(7);
    expect(by.Other).toHaveLength(9);
    expect(by['Darko Rajaković']).toEqual(['coaches']);
    expect(creates.find((c) => c.name === 'Darko Rajaković').team).toBe('TOR');
  });
  it('existing people only get the lists they miss, and a second run changes nothing', () => {
    const existing = [{ id: 'p1', name: 'nikola jokic', team: null, listIds: ['mvp'] }];
    const first = planBulkImport(existing, CANDIDATE_LISTS);
    expect(first.updates).toEqual([{ id: 'p1', add: expect.arrayContaining(['scoring', 'rebounds', 'assists']) }]);
    expect(first.updates[0].add).not.toContain('mvp');
    expect(first.creates.find((c) => /jokic/i.test(c.name))).toBeUndefined(); // no duplicate
    // apply the result, run again
    const pool = [...existing.map((p) => ({ ...p, listIds: [...p.listIds, ...first.updates[0].add] })), ...first.creates.map((c, i) => ({ id: `n${i}`, ...c }))];
    const second = planBulkImport(pool, CANDIDATE_LISTS);
    expect(second).toEqual({ creates: [], updates: [] });
  });
});
