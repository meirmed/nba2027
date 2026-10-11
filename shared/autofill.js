// Auto-fill for a player who made no pick: both scores 20..99 and the margin between 1 and 30 (owner-approved).
// Scored at the auto-fill factor (50%, floored) and NEVER eligible for the unique bonus (see scoring.js).
export const AUTOFILL = { min: 20, max: 99, minDiff: 1, maxDiff: 30 };

/** -> {s1, s2} (home, away). rng injectable for tests. Never a tie. */
export function makeAutoPick(rng = Math.random, cfg = AUTOFILL) {
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const diff = int(cfg.minDiff, cfg.maxDiff);
  const low = int(cfg.min, cfg.max - diff);
  const high = low + diff;
  return rng() < 0.5 ? { s1: high, s2: low } : { s1: low, s2: high };
}
