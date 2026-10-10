import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';
import { DEFAULT_SETTINGS } from '@shared/constants.js';
import { mergeScoring } from '@shared/scoring.js';

const SettingsContext = createContext(null);

/** appSettings/main live, always merged over defaults ({...DEFAULTS, ...saved}). */
export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, 'appSettings', 'main'),
      (snap) => setSaved(snap.exists() ? snap.data() : {}),
      () => setSaved({}));
  }, [user]);

  const value = useMemo(() => {
    const s = saved || {};
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      features: { ...DEFAULT_SETTINGS.features, ...(s.features || {}) },
      scoring: mergeScoring(s.scoring),
      ready: saved !== null,
    };
  }, [saved]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
/** Central scoring hook - the ONLY way UI reads point values. */
export const useScoring = () => useSettings().scoring;
