import { useLang } from '../contexts/LangContext.jsx';
import { useBonus } from '../contexts/BonusContext.jsx';
import { useTeams } from '../contexts/TeamsContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { usePredictionsOf } from '../hooks/usePredictionsOf.js';
import { usePlayers } from '../hooks/usePlayers.js';
import { useNow } from '../hooks/useNow.js';
import { formatCountdown } from '../utils/dates.js';
import { maxBonusPoints, scoreBonus } from '@shared/bonus.js';
import { answerLabel } from './predictions/BonusCard.jsx';

/** Bonus tracking of ONE player (me, or any player for the admin): answers, correct answers and points per question + the total. */
export default function UserBonusView({ uid, self = false, publicOnly = false }) {
  const { t, lang } = useLang();
  const { questions, loading } = useBonus();
  const { teams } = useTeams();
  const { rows } = usePoints();
  const mine = usePredictionsOf(uid, { publicOnly });
  const nowMs = useNow(1000);
  // another player's page shows CLOSED questions only (open questions stay private until their deadline)
  const list = [...questions].filter((q) => q.type !== 'ranking' && (!publicOnly || (q.answer || []).length > 0 || nowMs >= q.deadlineMs)).reverse();
  const { byId: playersById } = usePlayers(list.some((q) => q.type === 'player'));
  const ctx = { lang, teams, playersById };
  const total = rows.find((r) => r.uid === uid)?.bonus ?? 0;
  const answeredCount = list.filter((q) => mine.bonus[q.id]?.answer?.length).length;

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (list.length === 0) return <p className="muted">{t('bq.empty')}</p>;
  return (
    <div>
      <div className="card mp-summary">
        <strong>{t('ub.total')}: <span className="pts-bonus">{total}</span></strong>
        <span className="muted">{t('ub.answered', { n: answeredCount, total: list.length })}</span>
      </div>
      {list.map((q) => {
        const done = (q.answer || []).length > 0;
        const closed = done || nowMs >= q.deadlineMs;
        const my = mine.bonus[q.id]?.answer;
        const pts = done && my?.length ? scoreBonus(q, my).pts : null;
        return (
          <div key={q.id} className="bonus-card">
            <div className="bonus-head">
              <div className="bonus-title" dir="auto">{q.question?.[lang] || q.question?.en}</div>
              <div className="bonus-meta">
                <span className="muted small">{done ? `✓ ${t('rb.answered')}` : closed ? `🔒 ${t('rb.waiting')}` : `${t('rb.open')} · ${t('bq.locksIn', { time: formatCountdown(q.deadlineMs - nowMs) })}`}</span>
                <span className="pill-max">{t('rb.max', { n: maxBonusPoints(q) })}</span>
              </div>
            </div>
            <div className="bonus-mine small">
              <div>{t('bq.yourAnswer')}: <strong dir="auto">{my?.length ? answerLabel(q, my, ctx) : t('bq.noAnswer')}</strong></div>
              {done && <div>{t('bq.correctAnswer')}: <strong dir="auto" className="save-ok">{answerLabel(q, q.answer, ctx)}</strong></div>}
              {pts !== null && <div className={pts > 0 ? 'save-ok' : 'muted'}>{t('bq.earned', { n: pts })}</div>}
              {!self && !closed && !my?.length && <div className="muted">{t('ub.notYet')}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
