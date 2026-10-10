import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings, useScoring } from '../../contexts/SettingsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useNow } from '../../hooks/useNow.js';
import { useMyPredictions } from '../../contexts/MyPredictionsContext.jsx';
import { dayKey, formatDay } from '../../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import GameCard from './GameCard.jsx';

const isNum = (v) => v !== '' && v !== undefined && Number.isInteger(Number(v));

/** Day-by-day predictions. Edits are staged locally (draft) and sent in ONE callable call ("Save"). */
export default function GamesTab() {
  const { t, lang } = useLang();
  const settings = useSettings();
  const scoring = useScoring();
  const { games, loading } = useGames();
  const mine = useMyPredictions();
  const nowMs = useNow(1000);
  const tz = settings.timezone;

  const [selKey, setSelKey] = useState(null);
  const [draft, setDraft] = useState({}); // id -> {s1,s2} strings
  const [jokerDraft, setJokerDraft] = useState({}); // id -> bool (desired)
  const [reasons, setReasons] = useState({}); // id -> reason key
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

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

  const savedOf = (id) => mine.games[id];
  const draftValid = (id) => { const d = draft[id]; return d && isNum(d.s1) && isNum(d.s2); };
  const hasPick = (id) => !!savedOf(id) || draftValid(id);
  const jokerIsOn = (id) => (id in jokerDraft ? jokerDraft[id] : !!mine.jokers[id]);

  const usedJokers = useMemo(() => {
    const s = new Set(Object.keys(mine.jokers).filter((k) => mine.jokers[k]));
    Object.entries(jokerDraft).forEach(([id, v]) => { if (v) s.add(id); else s.delete(id); });
    return s.size;
  }, [mine.jokers, jokerDraft]);
  const jokersLeft = scoring.jokersPerSeason - usedJokers;

  const changedPicks = Object.entries(draft).filter(([id, d]) => draftValid(id)
    && (!savedOf(id) || String(savedOf(id).s1) !== String(Number(d.s1)) || String(savedOf(id).s2) !== String(Number(d.s2))));
  const changedJokers = Object.entries(jokerDraft).filter(([id, v]) => v !== !!mine.jokers[id]);
  const dirty = new Set([...changedPicks.map(([id]) => id), ...changedJokers.map(([id]) => id)]).size;

  const edit = (id, side, value) => setDraft((d) => {
    const cur = d[id] || { s1: savedOf(id) ? String(savedOf(id).s1) : '', s2: savedOf(id) ? String(savedOf(id).s2) : '' };
    return { ...d, [id]: { ...cur, [side]: value } };
  });
  const toggleJoker = (id) => setJokerDraft((j) => ({ ...j, [id]: !jokerIsOn(id) }));

  const save = async () => {
    setBusy(true); setMsg(''); setReasons({});
    try {
      const picks = {};
      changedPicks.forEach(([id, d]) => { picks[id] = { s1: Number(d.s1), s2: Number(d.s2) }; });
      const jokers = {};
      changedJokers.forEach(([id, v]) => { jokers[id] = v; });
      const r = (await httpsCallable(functions, 'savePredictions')({ picks, jokers })).data;
      const done = new Set([...r.saved, ...r.jokersOn, ...r.jokersOff]);
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !r.saved.includes(id))));
      setJokerDraft((j) => Object.fromEntries(Object.entries(j).filter(([id]) => !r.jokersOn.includes(id) && !r.jokersOff.includes(id))));
      setReasons(Object.fromEntries(r.rejected.map((x) => [x.id, x.reason])));
      setMsg(r.rejected.length ? t('pred.partial', { ok: done.size, bad: r.rejected.length }) : t('pred.saved'));
    } catch (e) { console.error(e); setMsg(t('pred.saveFailed')); }
    setBusy(false);
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
          onJoker={() => toggleJoker(g.id)} reason={reasons[g.id]} />
      ))}

      <div className="save-bar">
        <button className="btn" onClick={save} disabled={busy || dirty === 0}>{t('pred.saveAll', { n: dirty })}</button>
        <span className="muted">{msg}</span>
      </div>
    </div>
  );
}
