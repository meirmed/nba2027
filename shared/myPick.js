// The "my pick" label on the Results card: its colour state.

/**
 * 'pts' (green) = I got points in this game; 'zero' (orange) = I got none (a miss, or I did not predict); 'pending' (grey) = it cannot be scored yet
 * (the published picks are not loaded, or the live game is tied right now).
 * hasPick: I made a pick; scoredPts: my points from the scoring (undefined = my pick is not among the scored picks); canScore: the game can be scored now.
 * -> {state, pts}   pts = null while unknown
 */
export function myPickState({ hasPick, scoredPts, canScore }) {
  if (hasPick) return scoredPts === undefined ? { state: 'pending', pts: null } : { state: scoredPts > 0 ? 'pts' : 'zero', pts: scoredPts };
  return { state: 'zero', pts: canScore ? 0 : null }; // I did not predict: no points
}
