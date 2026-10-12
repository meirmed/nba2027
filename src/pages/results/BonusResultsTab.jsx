import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { useTeams } from '../../contexts/TeamsContext.jsx';
import { useMyPredictions } from '../../contexts/MyPredictionsContext.jsx';
import { usePlayers } from '../../hooks/usePlayers.js';
import { useNow } from '../../hooks/useNow.js';
import { formatCountdown } from '../../utils/dates.js';
import { scoreBonus } from '@shared/bonus.js';
import { answerLabel } from '../predictions/BonusCard.jsx';

/** "Everyone's answers" of ONE closed question (bonusPicks/{id}, published when it closes). */
function EveryoneAnswers({ q, ctx }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(undefined);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data) { try { const s = await getDoc(doc(db, 'bonusPicks', q.id)); setData(s.exists() ? s.data() : null); } catch { setData(null); } }
  };
  const answered = (q.answer || []).length > 0;
  const rows = data ? Object.entries(data.picks || {}).map(([uid, p]) => ({ uid, ...p, pts: answered ? scoreBonus(q, p.answer).pts : null }))
    .sort((a, b) => ((b.pts ?? 0) - (a.pts ?? 0)) || (a.name || '').localeCompare(b.name || '', 'he')) : [];
  return (
    <div className="everyone">
      <button className="btn ghost" onClick={toggle}>{open ? t('rb.hide') : t('rb.everyone')}</button>
      {open && data === undefined && <p className="muted">{t('common.loading')}</p>}
      {open && data === null && <p className="muted">{t('rb.soon')}</p>}
      {open && data && rows.length === 0 && <p className="muted">{t('rb.noAnswers')}</p>}
      {open && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table"><tbody>
            {rows.map((r) => (
              <tr key={r.uid} className={r.uid === user?.uid ? 'me' : ''}>
                <td dir="auto">{r.name}{r.uid === user?.uid ? ` ${t('pred.you')}` : ''}</td>
                <td dir="auto">{answerLabel(q, r.answer, ctx)}</td>
                <td dir="ltr">{r.pts === null ? '' : <strong className={r.pts > 0 ? 'save-ok' : 'muted'}>{r.pts}</strong>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

/** Every bonus question: status, the correct answer, my answer + points, and (once closed) everyone's answers. */
export default function BonusResultsTab() {
  const { t, lang } = useLang();
  const { questions, loading } = useBonus();
  const { teams } = useTeams();
  const mine = useMyPredictions();
  const nowMs = useNow(1000);
  const list = [...questions].filter((q) => q.type !== 'ranking').reverse(); // latest deadline first
  const { byId: playersById } = usePlayers(list.some((q) => q.type === 'player'));
  const ctx = { lang, teams, playersById };

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (list.length === 0) return <p className="muted">{t('bq.empty')}</p>;
  return (
    <div>
      {list.map((q) => {
        const answered = (q.answer || []).length > 0;
        const closed = answered || nowMs >= q.deadlineMs;
        const my = mine.bonus[q.id]?.answer;
        const score = answered && my?.length ? scoreBonus(q, my).pts : null;
        return (
          <div key={q.id} className={`bq-card ${closed ? 'is-locked' : ''}`}>
            <strong dir="auto">{q.question?.[lang] || q.question?.en}</strong>
            <div className="muted small">
              {answered ? `✓ ${t('rb.answered')}` : closed ? `🔒 ${t('rb.waiting')}` : `${t('rb.open')} · ${t('bq.locksIn', { time: formatCountdown(q.deadlineMs - nowMs) })}`}
            </div>
            {answered && <div className="small">{t('bq.correctAnswer')}: <strong dir="auto">{answerLabel(q, q.answer, ctx)}</strong></div>}
            {closed && <div className="small">{t('bq.yourAnswer')}: <strong dir="auto">{my?.length ? answerLabel(q, my, ctx) : t('bq.noAnswer')}</strong>{score !== null && <span className={score > 0 ? 'save-ok' : 'muted'}> · {t('bq.earned', { n: score })}</span>}</div>}
            {closed && <EveryoneAnswers q={q} ctx={ctx} />}
          </div>
        );
      })}
    </div>
  );
}
