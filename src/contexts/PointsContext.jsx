import { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';

const Ctx = createContext({ rows: [], allRows: [], loading: true });

/** points/{uid} for everyone (players in `rows`, admins only in `allRows`) (small summary docs written by Cloud Functions). One listener for the whole app. */
export function PointsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ rows: [], allRows: [], loading: true });
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, 'points'),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }));
        // rows = PAID PLAYERS only (admins and players the admin has not marked as paid don't take part: not in the leaderboard, Head to Head or any table); allRows keeps names for e.g. the audit log
        setState({ rows: all.filter((r) => !r.isAdmin && r.paid !== false), allRows: all, loading: false }); // players who have not paid are not in the competition
      },
      () => setState({ rows: [], allRows: [], loading: false }));
  }, [user]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const usePoints = () => useContext(Ctx);
