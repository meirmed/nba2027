import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import TeamBadge from '../../components/TeamBadge.jsx';
import BonusCard from '../predictions/BonusCard.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { usePlayers } from '../../hooks/usePlayers.js';
import { usePredictionsOf } from '../../hooks/usePredictionsOf.js';
import { dayKey, formatTime } from '../../utils/dates.js';
import { pickIssue } from '@shared/predictions.js';

const call = (data) => httpsCallable(functions, 'adminEditPredictions')(data).then((r) => r.data);

/**
 * Admin: set / change / remove ANY pick, joker or bonus answer of a player, at any time (even after tip-off or a deadline).
 * Everyone is rescored. Only the audit log records the edit (nothing is shown to other players).
 */
export default function AdminPredictionEditor({ uid }) {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { games } = useGames();
  const { questions } = useBonus();
  const preds = usePredictionsOf(uid);
  const { players, byId } = usePlayers(questions.some((q) => q.type === 'player'));

  const [day, setDay] = useState(() => dayKey(new Date(), timezone));
  const [gameId, setGameId] = useState('');
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [joker, setJoker] = useState(false);
  const [qid, setQid] = useState('');
  const [ans, setAns] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const dayGames = useMemo(() => games.filter((g) => g.t1 && g.t2 && dayKey(g.tipoff, timezone) === day), [games, day, timezone]);
  const bonusList = useMemo(() => [...questions].filter((q) => q.type !== 'ranking').reverse(), [questions]);
  const question = questions.find((q) => q.id === qid);

  useEffect(() => { // load the current pick when a game is selected (not while typing)
    const p = preds.games[gameId];
    setS1(p ? String(p.s1) : ''); setS2(p ? String(p.s2) : ''); setJoker(!!preds.jokers[gameId]);
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAns(preds.bonus[qid]?.answer || []); }, [qid]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { const r = await fn(); setMsg(r.rejected?.length ? t(`pred.err.${r.rejected[0].reason}`) : `✓ ${t('ae.saved')}`); } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };
  const savePick = () => run(async () => {
    const p = { s1: Number(s1), s2: Number(s2) };
    const issue = s1 === '' || s2 === '' ? 'invalid-score' : pickIssue(p);
    if (issue) return { rejected: [{ reason: issue }] };
    return call({ uid, picks: { [gameId]: p }, jokers: { [gameId]: joker } });
  });
  const removePick = () => run(() => call({ uid, picks: { [gameId]: null } }));
  const saveAnswer = () => run(() => call({ uid, bonus: { [qid]: ans } }));
  const removeAnswer = () => run(() => call({ uid, bonus: { [qid]: null } }));

  return (
    <div className="card">
      <h3>{t('ae.title')}</h3>
      <p className="muted small">{t('ae.note')}</p>

      <h4>{t('ae.pickTitle')}</h4>
      <div className="grid-form">
        <label className="field">{t('ae.day')}<input className="input" dir="ltr" type="date" value={day} onChange={(e) => { setDay(e.target.value); setGameId(''); }} /></label>
        <label className="field">{t('ae.game')}
          <select className="input" dir="auto" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="" />
            {dayGames.map((g) => <option key={g.id} value={g.id}>{formatTime(g.tipoff, lang, timezone)} · {g.t1} – {g.t2}</option>)}
          </select></label>
      </div>
      {gameId && (
        <>
          <div className="inline">
            <TeamBadge abbr={games.find((g) => g.id === gameId)?.t1} />
            <input className="input num" dir="ltr" inputMode="numeric" aria-label={t('pred.home')} value={s1} onChange={(e) => setS1(e.target.value)} />
            <span>–</span>
            <input className="input num" dir="ltr" inputMode="numeric" aria-label={t('pred.away')} value={s2} onChange={(e) => setS2(e.target.value)} />
            <TeamBadge abbr={games.find((g) => g.id === gameId)?.t2} />
          </div>
          <label className="check"><input type="checkbox" checked={joker} onChange={(e) => setJoker(e.target.checked)} /> ⭐ {t('pred.joker', { n: 2 })}</label>
          <div className="actions">
            <button className="btn" disabled={busy} onClick={savePick}>{t('ae.save')}</button>
            {preds.games[gameId] && <button className="btn ghost" disabled={busy} onClick={removePick}>{t('ae.remove')}</button>}
          </div>
        </>
      )}

      <h4>{t('ae.bonusTitle')}</h4>
      <label className="field">{t('ae.question')}
        <select className="input" dir="auto" value={qid} onChange={(e) => setQid(e.target.value)}>
          <option value="" />
          {bonusList.map((q) => <option key={q.id} value={q.id}>{q.question?.[lang] || q.question?.en}</option>)}
        </select></label>
      {question && (
        <>
          <BonusCard q={{ ...question, answer: [] }} nowMs={0} closedReason={null} hideLock value={ans} onChange={setAns} status={null} reason={null} players={players} playersById={byId} savedAnswer={ans} />
          <div className="actions">
            <button className="btn" disabled={busy} onClick={saveAnswer}>{t('ae.saveAnswer')}</button>
            {preds.bonus[qid]?.answer?.length > 0 && <button className="btn ghost" disabled={busy} onClick={removeAnswer}>{t('ae.removeAnswer')}</button>}
          </div>
        </>
      )}
      <p className={msg.startsWith('✓') ? 'save-ok' : 'muted'}>{msg}</p>
    </div>
  );
}
