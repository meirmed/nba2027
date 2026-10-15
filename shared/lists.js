// Named player lists for the "player" bonus questions (scoring leader, MVP, coaches...). A player can be in several lists (listIds).
import { normalizeName } from './names.js';

/** The standard lists the admin can create with one click (he / en names; the id is fixed so questions keep pointing at them). */
export const DEFAULT_PLAYER_LISTS = [
  { id: 'scoring', he: 'מלך הסלים', en: 'Scoring leader' },
  { id: 'rebounds', he: 'מלך הריבאונדים', en: 'Rebounds leader' },
  { id: 'assists', he: 'מלך האסיסטים', en: 'Assists leader' },
  { id: 'blocks', he: 'מלך החסימות', en: 'Blocks leader' },
  { id: 'steals', he: 'מלך החטיפות', en: 'Steals leader' },
  { id: 'coaches', he: 'רשימת המאמנים הראשיים', en: 'Head coaches' },
  { id: 'defense', he: 'שחקני הגנה', en: 'Defensive players' },
  { id: 'roy', he: 'רוקי העונה', en: 'Rookie of the Year' },
  { id: 'mvp', he: 'MVP', en: 'MVP' },
];

/** The players a question offers: its list, or EVERYONE when the question has no list (older questions). */
export const playersOfList = (players, listId) => (listId ? players.filter((p) => (p.listIds || []).includes(listId)) : players);

/**
 * Typed names -> what to write. parsed = [{name, team}]. A person already in the pool (same name + team) is NOT duplicated:
 * he just gets this list added. -> {creates: [{name, team, listIds}], updates: [{id, listIds}], skipped: n (already in the list)}
 */
export function planListAdd(existing, listId, parsed) {
  const keyOf = (name, team) => `${normalizeName(name)}|${team || ''}`;
  const byKey = new Map();
  existing.forEach((p) => { const k = keyOf(p.name, p.team); if (!byKey.has(k)) byKey.set(k, p); });
  const seen = new Set();
  const out = { creates: [], updates: [], skipped: 0 };
  parsed.forEach(({ name, team }) => {
    const k = keyOf(name, team);
    if (!normalizeName(name) || seen.has(k)) return;
    seen.add(k);
    const have = byKey.get(k);
    if (!have) { out.creates.push({ name, team: team || null, listIds: listId ? [listId] : [] }); return; }
    if (listId && !(have.listIds || []).includes(listId)) out.updates.push({ id: have.id, listIds: [...(have.listIds || []), listId] });
    else out.skipped += 1;
  });
  return out;
}
