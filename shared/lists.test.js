import { describe, it, expect } from 'vitest';
import { DEFAULT_PLAYER_LISTS, planListAdd, playersOfList } from './lists.js';

describe('player lists', () => {
  it('the nine standard lists have unique ids and both names', () => {
    expect(DEFAULT_PLAYER_LISTS).toHaveLength(9);
    expect(new Set(DEFAULT_PLAYER_LISTS.map((l) => l.id)).size).toBe(9);
    DEFAULT_PLAYER_LISTS.forEach((l) => { expect(l.he).toBeTruthy(); expect(l.en).toBeTruthy(); });
    expect(DEFAULT_PLAYER_LISTS.map((l) => l.he)).toEqual(['מלך הסלים', 'מלך הריבאונדים', 'מלך האסיסטים', 'מלך החסימות', 'מלך החטיפות', 'רשימת המאמנים הראשיים', 'שחקני הגנה', 'רוקי העונה', 'MVP']);
  });
  const pool = [
    { id: 'p1', name: 'Nikola Jokic', team: 'DEN', normalizedName: 'nikola jokic', listIds: ['mvp'] },
    { id: 'p2', name: 'Jayson Tatum', team: 'BOS', listIds: ['scoring', 'mvp'] },
    { id: 'p3', name: 'Old Player', team: null }, // created before lists existed
  ];
  it('a question offers only the players of its list; no list = everyone', () => {
    expect(playersOfList(pool, 'mvp').map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(playersOfList(pool, 'scoring').map((p) => p.id)).toEqual(['p2']);
    expect(playersOfList(pool, 'steals')).toEqual([]);
    expect(playersOfList(pool, '')).toHaveLength(3);
    expect(playersOfList(pool, null)).toHaveLength(3);
  });
  it('typing an existing person adds the LIST to him instead of a duplicate', () => {
    const r = planListAdd(pool, 'scoring', [{ name: 'nikola  JOKIC', team: 'DEN' }, { name: 'Luka Doncic', team: 'DAL' }]);
    expect(r.updates).toEqual([{ id: 'p1', listIds: ['mvp', 'scoring'] }]);
    expect(r.creates).toEqual([{ name: 'Luka Doncic', team: 'DAL', listIds: ['scoring'] }]);
    expect(r.skipped).toBe(0);
  });
  it('already in the list = skipped; same name twice in the input = once; same name, other team = a different person', () => {
    const r = planListAdd(pool, 'mvp', [{ name: 'Jayson Tatum', team: 'BOS' }, { name: 'New Guy', team: null }, { name: 'new guy', team: null }, { name: 'Nikola Jokic', team: 'LAL' }]);
    expect(r.skipped).toBe(1);
    expect(r.creates.map((c) => c.name)).toEqual(['New Guy', 'Nikola Jokic']);
    expect(r.updates).toEqual([]);
  });
  it('without a list (the "all players" view) people are created unassigned and nothing is updated', () => {
    const r = planListAdd(pool, '', [{ name: 'Someone', team: null }, { name: 'Jayson Tatum', team: 'BOS' }]);
    expect(r.creates).toEqual([{ name: 'Someone', team: null, listIds: [] }]);
    expect(r.updates).toEqual([]);
    expect(r.skipped).toBe(1);
  });
});
