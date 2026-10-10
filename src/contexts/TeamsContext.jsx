import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';
import { TEAMS_BY_ABBR } from '@shared/teams.js';

const TeamsContext = createContext(null);

/** Static teams, overridden by admin-edited teams/{abbr} docs when present. One listener for the whole app. */
export function TeamsProvider({ children }) {
  const { user } = useAuth();
  const [remote, setRemote] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, 'teams'), (snap) => {
      const m = {};
      snap.forEach((d) => {
        const x = d.data();
        const o = { abbr: d.id };
        if (x.nameEn) o.en = x.nameEn;
        if (x.nameHe) o.he = x.nameHe;
        if (x.conf) o.conf = x.conf;
        if (x.color) o.color = x.color;
        m[d.id] = o;
      });
      setRemote(m);
    }, () => setRemote({}));
  }, [user]);

  const value = useMemo(() => {
    const teams = { ...TEAMS_BY_ABBR };
    Object.entries(remote || {}).forEach(([k, v]) => { teams[k] = { ...(TEAMS_BY_ABBR[k] || {}), ...v }; });
    return { teams, seeded: !!remote && Object.keys(remote).length > 0 };
  }, [remote]);

  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>;
}
export function useTeams() {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error('useTeams must be used inside TeamsProvider');
  return ctx;
}
