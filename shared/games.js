import { GAME_ROUNDS } from './constants.js';

export const GAME_STATUSES = ['scheduled', 'live', 'finished', 'cancelled'];
export const seriesIdOf = (round, seriesKey) => `${round}-${seriesKey}`;
export const buildGameId = (round, seriesKey, gameNum) => `${seriesIdOf(round, seriesKey)}_G${gameNum}`;

/** True if this game's points count toward the current competition (appSettings.countedRounds, default ['RS']). */
export function countsForStandings(game, countedRounds = ['RS']) {
  return !!game && game.status !== 'cancelled' && countedRounds.includes(game.round);
}

/** Regular-season ids have no series: RS-YYYYMMDD(UTC)-HOME-AWAY. */
export function buildRegularSeasonId(tipoff, t1, t2) {
  const d = tipoff instanceof Date ? tipoff : new Date(tipoff);
  return `RS-${d.toISOString().slice(0, 10).replace(/-/g, '')}-${t1}-${t2}`;
}

/** Returns a list of error keys (empty = valid). Policy: final score INCLUDING OT; ties are impossible. */
export function validateGame(g) {
  const errs = [];
  const rs = g.round === 'RS';
  if (!GAME_ROUNDS.includes(g.round)) errs.push('err.round');
  if (rs) {
    if (!g.t1 || !g.t2) errs.push('err.teams');
  } else {
    if (!/^[A-Za-z0-9-]+$/.test(g.seriesKey || '')) errs.push('err.seriesKey');
    if (!Number.isInteger(g.gameNum) || g.gameNum < 1 || g.gameNum > 7) errs.push('err.gameNum');
  }
  if (g.t1 && g.t1 === g.t2) errs.push('err.sameTeam');
  if (!GAME_STATUSES.includes(g.status)) errs.push('err.status');
  if (!g.tipoff) errs.push('err.tipoff');
  const hasScore = g.s1 !== null && g.s1 !== undefined && g.s2 !== null && g.s2 !== undefined;
  if (g.status === 'finished' || g.status === 'live' || hasScore) {
    if (![g.s1, g.s2].every((n) => Number.isInteger(n) && n >= 0 && n <= 250)) errs.push('err.score');
    else if (g.status === 'finished' && g.s1 === g.s2) errs.push('err.tie');
  }
  if (g.status === 'finished' && (!g.t1 || !g.t2) && !errs.includes('err.teams')) errs.push('err.teams');
  return errs;
}
