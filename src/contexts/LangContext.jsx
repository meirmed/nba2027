import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import he from '../i18n/he.json';
import en from '../i18n/en.json';
import { interpolate } from '../utils/formatting.js';

const DICTS = { he, en };
const LangContext = createContext(null);

function initialLang() {
  try { return localStorage.getItem('lang') || 'he'; } catch { return 'he'; }
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch { /* storage unavailable */ }
  }, []);

  const t = useCallback((key, vars) => {
    const s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
    return vars ? interpolate(s, vars) : s;
  }, [lang]);

  const value = useMemo(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}
