import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';
import { useGames } from './GamesContext.jsx';
import { useScoring, useSettings } from './SettingsContext.jsx';
import { useNow } from '../hooks/useNow.js';
import { applyLiveGames, liveGameIds } from '@shared/livePoints.js';

const Ctx = createContext({ rows: [], allRows: [], baseRows: [], loading: true, hasLive: false });

/**
 * points/{uid} for everyone (small summary docs written by Cloud Functions). One listener for the whole app, plus the LIVE overlay:
 *  - rows / allRows = the saved points + the provisional points of the games being played now (and of a game that finished a moment ago, until the
 *    server has saved it), so the leaderboard, Home and every rank move in real time. rows = paid players only (admins and unpaid players don't take part);
 *    allRows also keeps them (names, e.g. the audit log).
 *  - baseRows = the OFFICIAL saved points of the players (the Statistics tab uses them: those numbers only change when a game ends).
 */
export function PointsProvider({ children }) {
  const { user } = useAuth();
  const { games } = useGames();
  const scoring = useScoring();
  const settings = useSettings();
  const nowMs = useNow(30000); // lets the "just finished" window expire
  const [state, setState] = useState({ all: [], loading: true });
  const [picksByGame, setPicksByGame] = useState({});

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, 'points'),
      (snap) => setState({ all: snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() })), loading: false }),
      () => setState({ all: [], loading: false }));
  }, [user]);

  const lastRecalcMs = useMemo(() => state.all.reduce((m, r) => Math.max(m, r.updatedAt?.toMillis?.() ?? 0), 0), [state.all]);
  const gameInfo = useMemo(() => games.map((g) => ({ id: g.id, round: g.round, status: g.status, s1: g.s1, s2: g.s2, updatedMs: g.updatedAt?.toMillis?.() ?? 0 })), [games]);
  const idsKey = useMemo(() => liveGameIds({ games: gameInfo, countedRounds: settings.countedRounds, lastRecalcMs, nowMs }).sort().join(','), [gameInfo, settings.countedRounds, lastRecalcMs, nowMs]);

  // the published picks (picks/{gameId}, written at tip-off) of the games in play: one small listener each
  useEffect(() => {
    if (!user || !idsKey) { setPicksByGame({}); return undefined; }
    const unsubs = idsKey.split(',').map((id) => onSnapshot(doc(db, 'picks', id),
      (s) => setPicksByGame((m) => ({ ...m, [id]: s.exists() ? s.data().picks || {} : null })),
      () => setPicksByGame((m) => ({ ...m, [id]: null }))));
    return () => unsubs.forEach((u) => u());
  }, [user, idsKey]);

  const value = useMemo(() => {
    const competes = (r) => !r.isAdmin && r.paid !== false;
    const base = state.all.filter(competes);
    const liveRows = applyLiveGames({ rows: base, games: gameInfo, picksByGame, scoring, countedRounds: settings.countedRounds, lastRecalcMs, nowMs });
    const byUid = new Map(liveRows.map((r) => [r.uid, r]));
    return {
      rows: liveRows,
      allRows: state.all.map((r) => byUid.get(r.uid) ?? r),
      baseRows: base,
      loading: state.loading,
      hasLive: liveRows !== base,
    };
  }, [state, gameInfo, picksByGame, scoring, settings.countedRounds, lastRecalcMs, nowMs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const usePoints = () => useContext(Ctx);
