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

/** null = valid pick; otherwise the reason key. Same rule for the UI (before autosave) and the server. */
export function pickIssue(p) {
  if (!isScore(p?.s1) || !isScore(p?.s2)) return 'invalid-score';
  if (p.s1 === p.s2) return 'tie';
  return null;
}

export const countJokers = (jokers) => Object.values(jokers || {}).filter(Boolean).length;

/**
 * A joker is only "used" while its game EXISTS and still COUNTS (not cancelled, a counted round). A joker left on a deleted or cancelled game
 * is free again, so the player never loses one. games: {id: {round, status}} of the games that exist (a missing id = a deleted game).
 */
export const isActiveJokerGame = (game, countedRounds = ['RS']) => !!game && game.status !== 'cancelled' && countedRounds.includes(game.round);
/**
 * Jokers already SPENT = on a game that exists, still counts, and has STARTED (live / finished, or its tip-off has passed).
 * A joker on an upcoming game is not spent yet (it can still be moved), so the leaderboard never reveals where players put their jokers before tip-off.
 */
export const countSpentJokers = (jokers, games, countedRounds = ['RS'], nowMs = Date.now()) => Object.entries(jokers || {}).filter(([id, on]) => {
  const g = games?.[id];
  return on && isActiveJokerGame(g, countedRounds) && (g.status === 'live' || g.status === 'finished' || (g.tipoffMs ?? Infinity) <= nowMs);
}).length;
export const countActiveJokers = (jokers, games, countedRounds = ['RS']) => Object.entries(jokers || {}).filter(([id, on]) => on && isActiveJokerGame(games?.[id], countedRounds)).length;

/**
 * Decide what to write. Never throws; bad items are returned in `rejected` with a reason key.
 * existing: { games:{id:{s1,s2}}, jokers:{id:true} }   games: { id: {round,status,t1,t2,tipoffMs} | undefined } - the requested games AND the games
 * of the player's existing jokers (so jokers on deleted / cancelled games are not counted against the limit)
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
    else if (pickIssue(p)) rejected.push({ id, reason: pickIssue(p) });
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
    else if (countActiveJokers(live, games, countedRounds) >= maxJokers) rejected.push({ id, reason: 'joker-limit' });
    else { live[id] = true; jokersOn.push(id); }
  });

  return { picks: accepted, jokersOn, jokersOff, rejected };
}
