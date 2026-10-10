// Pure helpers for importing games from balldontlie (used by the Cloud Function; unit-tested).
import { TEAMS_BY_ABBR } from './teams.js';
import { buildRegularSeasonId } from './games.js';

/** balldontlie game object -> importable row. home = t1, visitor = t2. */
export function mapScheduleGame(g) {
  const t1 = g?.home_team?.abbreviation ?? null;
  const t2 = g?.visitor_team?.abbreviation ?? null;
  const ms = g?.datetime ? Date.parse(g.datetime) : NaN;
  const tipoff = Number.isNaN(ms) ? null : new Date(ms).toISOString();
  const known = !!(TEAMS_BY_ABBR[t1] && TEAMS_BY_ABBR[t2] && t1 !== t2);
  return {
    apiGameId: g?.id ?? null, t1, t2, tipoff,
    postseason: !!g?.postseason, cup: !!g?.ist_stage, known,
    id: tipoff && known ? buildRegularSeasonId(tipoff, t1, t2) : null,
  };
}

/** Server-side re-validation of what the admin client sends back. Returns a clean item or null. */
export function validateImportItem(x) {
  if (!x || !Number.isSafeInteger(x.apiGameId)) return null;
  if (!TEAMS_BY_ABBR[x.t1] || !TEAMS_BY_ABBR[x.t2] || x.t1 === x.t2) return null;
  const ms = typeof x.tipoff === 'string' ? Date.parse(x.tipoff) : NaN;
  if (Number.isNaN(ms)) return null;
  const tipoff = new Date(ms).toISOString();
  return { apiGameId: x.apiGameId, t1: x.t1, t2: x.t2, tipoff, id: buildRegularSeasonId(tipoff, x.t1, x.t2) };
}
