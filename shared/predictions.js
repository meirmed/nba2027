// Pure prediction-save rules. Used by the savePredictions Cloud Function (authoritative) - unit-tested.
export const MAX_SCORE = 200;
const isScore = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;

/** Why a game can't take picks/jokers right now (null = open). `game.tipoffMs` is tip-off in epoch ms. */
export function gameOpenReason(game, nowMs, countedRounds = ['RS']) {
  if (!game) return 'not-found';
  if (!countedRounds.includes(game.round)) return 'not-counted';
  if (game.status !== 'scheduled') return 'closed';
  if (!(game.tipoffMs > nowMs)) return 'locked';
  if (!game.t1 || !game.t2) return 'teams-tbd';
  return null;
}

export const countJokers = (jokers) => Object.values(jokers || {}).filter(Boolean).length;

/**
 * Decide what to write. Never throws; bad items are returned in `rejected` with a reason key.
 * existing: { games:{id:{s1,s2}}, jokers:{id:true} }   games: { id: {round,status,t1,t2,tipoffMs} | undefined }
 * picks: { id:{s1,s2} }   jokers: { id: true|false } (desired state)
 */
export function planSave({ existing, games, picks, jokers, nowMs, maxJokers, countedRounds }) {
  const rejected = [];
  const accepted = {};
  const have = existing?.games || {};
  const live = { ...(existing?.jokers || {}) };
  const jokersOn = [];
  const jokersOff = [];

  Object.entries(picks || {}).forEach(([id, p]) => {
    const why = gameOpenReason(games[id], nowMs, countedRounds);
    if (why) rejected.push({ id, reason: why });
    else if (!isScore(p?.s1) || !isScore(p?.s2)) rejected.push({ id, reason: 'invalid-score' });
    else if (p.s1 === p.s2) rejected.push({ id, reason: 'tie' });
    else accepted[id] = { s1: p.s1, s2: p.s2 };
  });

  // removals first so a swap (off one, on another) fits inside the limit
  Object.entries(jokers || {}).forEach(([id, want]) => {
    if (want !== false || !live[id]) return;
    const why = gameOpenReason(games[id], nowMs, countedRounds);
    if (why) { rejected.push({ id, reason: why }); return; }
    delete live[id];
    jokersOff.push(id);
  });
  Object.entries(jokers || {}).forEach(([id, want]) => {
    if (want !== true || live[id]) return;
    const why = gameOpenReason(games[id], nowMs, countedRounds);
    if (why) rejected.push({ id, reason: why });
    else if (!accepted[id] && !have[id]) rejected.push({ id, reason: 'joker-needs-pick' });
    else if (countJokers(live) >= maxJokers) rejected.push({ id, reason: 'joker-limit' });
    else { live[id] = true; jokersOn.push(id); }
  });

  return { picks: accepted, jokersOn, jokersOff, rejected };
}
