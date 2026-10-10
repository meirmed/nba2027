// Single source of truth shared by client and Cloud Functions.
export const ROUNDS = ['R1', 'R2', 'CF', 'F'];
// Rounds a GAME can belong to. 'RS' = regular season (not a playoff round: never part of PREV_ROUND / H2H stages).
export const GAME_ROUNDS = ['RS', ...ROUNDS];

// Explicit previous-round map. NEVER use ROUNDS[i-1] (WC lesson #3).
export const PREV_ROUND = { R1: null, R2: 'R1', CF: 'R2', F: 'CF' };

export const BONUS_CATEGORIES = ['general', 'round1', 'round2', 'cf', 'finals'];
export const BONUS_TYPES = ['numeric', 'choice', 'team', 'player', 'dynamic_score', 'text'];

// !!! PLACEHOLDER VALUES - owner must confirm (Blueprint §12 Q2). Real values live in appSettings/main.scoring.
export const DEFAULT_SCORING = {
  winner: 2,
  exact: 5,
  // margin-error tiers (|predicted margin - actual margin|), applied when winner is correct. CONFIRM tiers.
  diffBonus: [
    { maxErr: 0, pts: 3 },
    { maxErr: 3, pts: 2 },
    { maxErr: 6, pts: 1 },
  ],
  // risk bonus: winner correct and pick shared by <= maxPickPct % of users. CONFIRM definition.
  risk: { maxPickPct: 15, pts: 2 },
  unique: 3, // only user with the exact score
  roundMultipliers: { RS: 1, R1: 1, R2: 1, CF: 1, F: 1 },
  jokersPerSeason: 3,
  jokerMultiplier: 2,
  autoFillFactor: 0.5, // floor-reduced
  tiebreakers: ['total', 'exactHits', 'uniqueHits', 'bonus'], // CONFIRM order (Blueprint §12 Q9)
};

export const DEFAULT_SETTINGS = {
  registrationOpen: false,
  seasonStarted: false,
  season: '2026-27',
  // Rounds whose games count toward the standings. Regular season only for now; playoffs = a separate future competition.
  countedRounds: ['RS'],
  timezone: 'Asia/Jerusalem',
  features: { jokers: true, autoFill: true },
  announcement: { he: '', en: '' },
};
