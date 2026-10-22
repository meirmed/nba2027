import { useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { useGames } from './useGames.js';
import { useNow } from './useNow.js';
import { useMidTournament } from './useMidTournament.js';
import { dayKey } from '../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { buildBracket, cleanGroups, MID_GROUPS } from '@shared/midTournament.js';

/** The whole mid-season tournament, derived from the stored groups + decisions and the LIVE per-day points (so it moves with the live games). */
export function useMidBracket() {
  const settings = useSettings();
  const { data, loading } = useMidTournament();
  const { dayRows, allRows, loading: pointsLoading } = usePoints();
  const { games } = useGames();
  const nowMs = useNow(60000);
  const tz = settings.timezone;
  const todayKey = dayKey(new Date(nowMs), tz);

  const rowsByUid = useMemo(() => { // names of everybody + the live per-day points of the players
    const m = {};
    allRows.forEach((r) => { m[r.uid] = r; });
    dayRows.forEach((r) => { m[r.uid] = r; });
    return m;
  }, [allRows, dayRows]);
  const gameList = useMemo(() => games.filter((g) => countsForStandings(g, settings.countedRounds)).map((g) => ({ dayKey: dayKey(g.tipoff, tz), status: g.status })), [games, settings.countedRounds, tz]);
  const groups = useMemo(() => cleanGroups(data?.groups), [data]);
  const bracket = useMemo(
    () => buildBracket({ groups, rowsByUid, overrides: data?.overrides || {}, todayKey, games: gameList }),
    [groups, rowsByUid, data, todayKey, gameList],
  );
  return { cfg: data, groups, hasGroups: MID_GROUPS.some((g) => groups[g].length > 0), bracket, rowsByUid, todayKey, loading: loading || pointsLoading };
}
