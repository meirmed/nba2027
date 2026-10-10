import { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings, useScoring } from '../../contexts/SettingsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useNow } from '../../hooks/useNow.js';
import { useMyPredictions } from '../../contexts/MyPredictionsContext.jsx';
import { dayKey, formatDay } from '../../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { pickIssue } from '@shared/predictions.js';
import GameCard from './GameCard.jsx';

const isNum = (v) => v !== '' && v !== undefined && Number.isInteger(Number(v));
const omit = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([k]) => !ids.includes(k)));
const AUTOSAVE_MS = 800;

/**
 * Day-by-day predictions. Typing a complete, valid score saves it automatically (debounced, batched into ONE callable
 * call; the server still enforces the tip-off lock). The Save button stays: it saves anything pending and shows the
 * number of games saved on this day.
 */
export default function GamesTab() {
  const { t, lang } = useLang();
  const settings = useSettings();
  const scoring = useScoring();
  const { games, loading } = useGames();
  const mine = useMyPredictions();
  const nowMs = useNow(1000);
  const tz = settings.timezone;

  const [selKey, setSelKey] = useState(null);
  const [draft, setDraft] = useState({}); // id -> {s1,s2} strings being typed
  const [jokerDraft, setJokerDraft] = useState({}); // id -> bool (desired)
  const [opt, setOpt] = useState({ games: {}, jokers: {} }); // just-saved values, shown until the Firestore snapshot catches up
  const [reasons, setReasons] = useState({}); // id -> server rejection reason
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const savingRef = useRef(false);
  const saveRef = useRef(null);

  const days = useMemo(() => {
    const m = new Map();
    games.filter((g) => countsForStandings(g, settings.countedRounds)).forEach((g) => {
      const k = dayKey(g.tipoff, tz);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [games, settings.countedRounds, tz]);

  const todayKey = dayKey(new Date(nowMs), tz);
  const defaultKey = (days.find(([k]) => k >= todayKey) || days[days.length - 1] || [null])[0];
  const activeKey = selKey && days.some(([k]) => k === selKey) ? selKey : defaultKey;
  const idx = days.findIndex(([k]) => k === activeKey);
  const dayGames = idx >= 0 ? days[idx][1] : [];

  // ---- derived state (saved value = optimistic ?? Firestore) ----
  const savedOf = (id) => opt.games[id] ?? mine.games[id];
  const savedJoker = (id) => (id in opt.jokers ? opt.jokers[id] : !!mine.jokers[id]);
  const jokerIsOn = (id) => (id in jokerDraft ? jokerDraft[id] : savedJoker(id));
  const draftNums = (id) => { const d = draft[id]; return d && isNum(d.s1) && isNum(d.s2) ? { s1: Number(d.s1), s2: Number(d.s2) } : null; };
  const issueOf = (id) => { const n = draftNums(id); return n ? pickIssue(n) : null; };
  const hasPick = (id) => !!savedOf(id) || (!!draftNums(id) && !issueOf(id));

  const usedJokers = useMemo(() => {
    const s = new Set(Object.keys(mine.jokers).filter((k) => mine.jokers[k]));
    [opt.jokers, jokerDraft].forEach((o) => Object.entries(o).forEach(([id, v]) => { if (v) s.add(id); else s.delete(id); }));
    return s.size;
  }, [mine.jokers, opt.jokers, jokerDraft]);
  const jokersLeft = scoring.jokersPerSeason - usedJokers;

  const changedPicks = Object.keys(draft).map((id) => [id, draftNums(id)])
    .filter(([id, n]) => n && !pickIssue(n) && (!savedOf(id) || savedOf(id).s1 !== n.s1 || savedOf(id).s2 !== n.s2));
  const changedJokers = Object.entries(jokerDraft).filter(([id, v]) => v !== savedJoker(id));
  const pendingIds = new Set([...changedPicks.map(([id]) => id), ...changedJokers.map(([id]) => id)]);
  const pendingKey = JSON.stringify([changedPicks, changedJokers]);
  const savedToday = dayGames.filter((g) => savedOf(g.id)).length;

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

  // autosave: wait for the user to stop typing, then send everything valid in ONE call
  useEffect(() => {
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

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (days.length === 0) return <p className="muted">{t('pred.noGames')}</p>;

  return (
    <div>
      <div className="day-nav">
        <button className="btn ghost" disabled={idx <= 0} onClick={() => setSelKey(days[idx - 1][0])} aria-label={t('pred.prev')}>{lang === 'he' ? '▶' : '◀'}</button>
        <div className="day-title">
          <strong>{dayGames[0] ? formatDay(dayGames[0].tipoff, lang, tz) : ''}</strong>
          {activeKey !== defaultKey && <button className="btn ghost" onClick={() => setSelKey(null)}>{t('pred.today')}</button>}
        </div>
        <button className="btn ghost" disabled={idx < 0 || idx >= days.length - 1} onClick={() => setSelKey(days[idx + 1][0])} aria-label={t('pred.next')}>{lang === 'he' ? '◀' : '▶'}</button>
      </div>
      <p className="muted small">{t('pred.jokersLeft', { n: jokersLeft, max: scoring.jokersPerSeason })}</p>

      {dayGames.map((g) => (
        <GameCard key={g.id} game={g} nowMs={nowMs}
          saved={savedOf(g.id)} draft={draft[g.id]} onEdit={(side, v) => edit(g.id, side, v)}
          jokerOn={jokerIsOn(g.id)} jokerDisabled={!hasPick(g.id) || (!jokerIsOn(g.id) && jokersLeft <= 0)}
          onJoker={() => toggleJoker(g.id)} reason={reasons[g.id] || issueOf(g.id)} status={statusOf(g.id)} />
      ))}

      <div className="save-bar">
        <button className="btn" onClick={() => save(true)} disabled={busy}>{t('pred.saveAll', { n: savedToday })}</button>
        <span className={msg.startsWith('✓') ? 'save-ok' : 'muted'}>{busy ? t('pred.saving') : msg}</span>
      </div>
    </div>
  );
}
