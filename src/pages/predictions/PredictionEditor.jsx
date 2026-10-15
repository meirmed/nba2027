import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useScoring, useSettings } from '../../contexts/SettingsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useMyPredictions } from '../../contexts/MyPredictionsContext.jsx';
import { isActiveJokerGame, pickIssue } from '@shared/predictions.js';

const isNum = (v) => v !== '' && v !== undefined && Number.isInteger(Number(v));
const omit = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([k]) => !ids.includes(k)));
const AUTOSAVE_MS = 800;
const Ctx = createContext(null);

/**
 * ONE editing state for every games tab (Games, Next 7 days): typed scores, joker changes, autosave, rejection reasons.
 * Lives above the tabs, so switching tabs never loses what you typed. A complete, valid score saves itself (debounced,
 * ONE callable call; the server still enforces the tip-off lock).
 */
export function PredictionEditorProvider({ children }) {
  const { t } = useLang();
  const scoring = useScoring();
  const settings = useSettings();
  const { games } = useGames();
  const mine = useMyPredictions();

  const [draft, setDraft] = useState({}); // id -> {s1,s2} strings being typed
  const [jokerDraft, setJokerDraft] = useState({}); // id -> bool (desired)
  const [opt, setOpt] = useState({ games: {}, jokers: {} }); // just-saved values, shown until the Firestore snapshot catches up
  const [reasons, setReasons] = useState({}); // id -> server rejection reason
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const savingRef = useRef(false);
  const saveRef = useRef(null);

  // saved value = optimistic ?? Firestore
  const savedOf = (id) => opt.games[id] ?? mine.games[id];
  const savedJoker = (id) => (id in opt.jokers ? opt.jokers[id] : !!mine.jokers[id]);
  const jokerIsOn = (id) => (id in jokerDraft ? jokerDraft[id] : savedJoker(id));
  const draftNums = (id) => { const d = draft[id]; return d && isNum(d.s1) && isNum(d.s2) ? { s1: Number(d.s1), s2: Number(d.s2) } : null; };
  const issueOf = (id) => { const n = draftNums(id); return n ? pickIssue(n) : null; };
  const hasPick = (id) => !!savedOf(id) || (!!draftNums(id) && !issueOf(id));

  const usedJokers = useMemo(() => {
    const s = new Set(Object.keys(mine.jokers).filter((k) => mine.jokers[k]));
    [opt.jokers, jokerDraft].forEach((o) => Object.entries(o).forEach(([id, v]) => { if (v) s.add(id); else s.delete(id); }));
    if (games.length === 0) return s.size; // games not loaded yet
    // only jokers on games that still exist and count: a joker on a deleted / cancelled game is free again
    const byId = Object.fromEntries(games.map((g) => [g.id, g]));
    return [...s].filter((id) => isActiveJokerGame(byId[id], settings.countedRounds)).length;
  }, [mine.jokers, opt.jokers, jokerDraft, games, settings.countedRounds]);
  const jokersLeft = scoring.jokersPerSeason - usedJokers;

  const changedPicks = Object.keys(draft).map((id) => [id, draftNums(id)])
    .filter(([id, n]) => n && !pickIssue(n) && (!savedOf(id) || savedOf(id).s1 !== n.s1 || savedOf(id).s2 !== n.s2));
  const changedJokers = Object.entries(jokerDraft).filter(([id, v]) => v !== savedJoker(id));
  const pendingIds = new Set([...changedPicks.map(([id]) => id), ...changedJokers.map(([id]) => id)]);
  const pendingKey = JSON.stringify([changedPicks, changedJokers]);

  // drop optimistic entries once the real snapshot shows the same value
  useEffect(() => {
    setOpt((o) => {
      const g = Object.fromEntries(Object.entries(o.games).filter(([id, v]) => !(mine.games[id] && mine.games[id].s1 === v.s1 && mine.games[id].s2 === v.s2)));
      const j = Object.fromEntries(Object.entries(o.jokers).filter(([id, v]) => !!mine.jokers[id] !== v));
      return Object.keys(g).length === Object.keys(o.games).length && Object.keys(j).length === Object.keys(o.jokers).length ? o : { games: g, jokers: j };
    });
  }, [mine]);

  const save = async (manual) => {
    if (savingRef.current) return;
    const picks = {};
    changedPicks.forEach(([id, n]) => { picks[id] = n; });
    const jokers = {};
    changedJokers.forEach(([id, v]) => { jokers[id] = v; });
    if (Object.keys(picks).length === 0 && Object.keys(jokers).length === 0) {
      if (manual) {
        const stuck = Object.keys(draft).some((id) => !(draftNums(id) && !issueOf(id))) || Object.keys(reasons).length > 0;
        setMsg(stuck ? t('pred.fixIssues') : t('pred.allSaved'));
      }
      return;
    }
    savingRef.current = true; setBusy(true); setMsg('');
    try {
      const r = (await httpsCallable(functions, 'savePredictions')({ picks, jokers })).data;
      setOpt((o) => ({
        games: { ...o.games, ...Object.fromEntries(r.saved.map((id) => [id, picks[id]])) },
        jokers: { ...o.jokers, ...Object.fromEntries([...r.jokersOn.map((id) => [id, true]), ...r.jokersOff.map((id) => [id, false])]) },
      }));
      setDraft((d) => omit(d, r.saved));
      setJokerDraft((j) => omit(j, [...r.jokersOn, ...r.jokersOff]));
      setReasons(Object.fromEntries(r.rejected.map((x) => [x.id, x.reason])));
      setMsg(r.rejected.length ? t('pred.partial', { ok: r.saved.length + r.jokersOn.length + r.jokersOff.length, bad: r.rejected.length }) : `✓ ${t('pred.saved')}`);
    } catch (e) { console.error(e); setMsg(t('pred.saveFailed')); }
    savingRef.current = false; setBusy(false);
  };
  saveRef.current = save;

  useEffect(() => { // autosave: wait for the user to stop typing, then send everything valid in ONE call
    if (pendingKey === '[[],[]]') return undefined;
    const timer = setTimeout(() => saveRef.current?.(false), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [pendingKey]);

  const edit = (id, side, value) => {
    setReasons((r) => omit(r, [id]));
    setDraft((d) => {
      const cur = d[id] || { s1: savedOf(id) ? String(savedOf(id).s1) : '', s2: savedOf(id) ? String(savedOf(id).s2) : '' };
      return { ...d, [id]: { ...cur, [side]: value } };
    });
  };
  const toggleJoker = (id) => { setReasons((r) => omit(r, [id])); setJokerDraft((j) => ({ ...j, [id]: !jokerIsOn(id) })); };
  const statusOf = (id) => {
    if (reasons[id] || issueOf(id)) return null;
    if (pendingIds.has(id)) return 'saving';
    return savedOf(id) ? 'saved' : null;
  };

  /** Everything a GameCard needs about ONE game's editing state. */
  const cardProps = (g) => ({
    saved: savedOf(g.id), draft: draft[g.id], onEdit: (side, v) => edit(g.id, side, v),
    jokerOn: jokerIsOn(g.id), jokerDisabled: !hasPick(g.id) || (!jokerIsOn(g.id) && jokersLeft <= 0), onJoker: () => toggleJoker(g.id),
    reason: reasons[g.id] || issueOf(g.id), status: statusOf(g.id),
  });

  const value = { savedOf, hasPick, jokersLeft, jokersMax: scoring.jokersPerSeason, cardProps, save, busy, msg };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePredictionEditor() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePredictionEditor must be used inside PredictionEditorProvider');
  return ctx;
}

/** Save button (always visible) + status. The count = how many of the games SHOWN in this tab have a saved pick. */
export function SaveBar({ games }) {
  const { t } = useLang();
  const ed = usePredictionEditor();
  const savedCount = games.filter((g) => ed.savedOf(g.id)).length;
  return (
    <div className="save-bar">
      <button className="btn" onClick={() => ed.save(true)} disabled={ed.busy}>{t('pred.saveAll', { n: savedCount })}</button>
      <span className={ed.msg.startsWith('✓') ? 'save-ok' : 'muted'}>{ed.busy ? t('pred.saving') : ed.msg}</span>
    </div>
  );
}
