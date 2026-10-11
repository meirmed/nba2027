import { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';

const Ctx = createContext({ questions: [], loading: true });

/** All bonus questions (signed-in read). One listener for the app; deadlineMs is derived for the shared helpers. */
export function BonusProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ questions: [], loading: true });
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, 'bonus'), (snap) => {
      const questions = snap.docs.map((d) => ({ id: d.id, ...d.data(), deadlineMs: d.data().deadline?.toMillis?.() ?? 0 }))
        .sort((a, b) => a.deadlineMs - b.deadlineMs);
      setState({ questions, loading: false });
    }, () => setState({ questions: [], loading: false }));
  }, [user]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const useBonus = () => useContext(Ctx);
