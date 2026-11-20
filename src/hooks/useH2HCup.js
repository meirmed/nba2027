import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { useGames } from './useGames.js';
import { useNow } from './useNow.js';
import { dayKey } from '../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { buildCup, cleanGroups } from '@shared/h2hCup.js';

/** h2hTournament/cup = { groups: {A..D: [uid..]}, windows: {G, R, QF, SF, F: {lo, hi}}, overrides: {groupTop, rTop, pairWinner}, updatedAt } or null. */
export function useH2HCupDoc() {
  const { user } = useAuth();
  const [state, setState] = useState({ data: null, loading: true });
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, 'h2hTournament', 'cup'),
      (s) => setState({ data: s.exists() ? s.data() : null, loading: false }),
      () => setState({ data: null, loading: false }));
  }, [user]);
  return state;
}

/** The whole Head to Head competition, derived from the stored configuration and the LIVE per-day points (so it moves with the live games). */
export function useH2HCup() {
  const settings = useSettings();
  const { data, loading } = useH2HCupDoc();
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
  const bracket = useMemo(() => buildCup({ cfg: data || {}, rowsByUid, todayKey, games: gameList }), [data, rowsByUid, todayKey, gameList]);
  return { cfg: data, groups, hasGroups: bracket.started, bracket, rowsByUid, todayKey, loading: loading || pointsLoading };
}
