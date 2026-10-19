// Single source of truth shared by client and Cloud Functions.
export const ROUNDS = ['R1', 'R2', 'CF', 'F'];
// Rounds a GAME can belong to. 'RS' = regular season (not a playoff round: never part of PREV_ROUND / H2H stages).
export const GAME_ROUNDS = ['RS', ...ROUNDS];

// Explicit previous-round map. NEVER use ROUNDS[i-1] (WC lesson #3).
export const PREV_ROUND = { R1: null, R2: 'R1', CF: 'R2', F: 'CF' };

// Bonus questions: category = general | season | month (+ month 'YYYY-MM'). 'ranking' = rank the 15 East + 15 West teams (final standings).
export const BONUS_CATEGORIES = ['general', 'season', 'month'];
export const BONUS_TYPES = ['numeric', 'closest', 'choice', 'team', 'player', 'dynamic_score', 'text', 'ranking', 'division_team', 'conference_team'];

// Owner-approved values (risk.pts is still a PLACEHOLDER - owner has not given it yet). Live values: appSettings/main.scoring.
export const DEFAULT_SCORING = {
  winner: 5, // correct winner
  // The margin (difference between the teams) pays when the winner is right: diffExact if it is EXACT, else the tier of the error below.
  // An exact SCORE (both teams) = winner 5 + exact margin 6 + exact 6 = 17 (it also has the exact margin).
  diffExact: 6, // exact margin (error 0)
  exact: 6, // exact score of both teams: ADDED on top of the winner and the exact margin
  // margin tiers for an error of 1 or more: error = |predicted margin - actual margin|
  diffBonus: [
    { maxErr: 1, pts: 4 },
    { maxErr: 2, pts: 3 },
    { maxErr: 3, pts: 2 },
    { maxErr: 4, pts: 1 },
  ],
  // risk bonus: winner correct AND <= maxPickPct % of the picks on that game chose that winner. pts = PLACEHOLDER
  risk: { maxPickPct: 10, pts: 2 },
  unique: 5, // only (non-auto-filled) user with the exact score. Auto-filled picks never earn it.
  roundMultipliers: { RS: 1, R1: 1, R2: 1, CF: 1, F: 1 },
  jokersPerSeason: 3,
  jokerMultiplier: 2,
  autoFillFactor: 0.5, // floor-reduced
  tiebreakers: ['total', 'exactHits', 'uniqueHits', 'bonus'],
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
