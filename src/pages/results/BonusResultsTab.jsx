import { useState } from 'react';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { useTeams } from '../../contexts/TeamsContext.jsx';
import { useMyPredictions } from '../../contexts/MyPredictionsContext.jsx';
import { useBonusPicks } from '../../hooks/useBonusPicks.js';
import { usePlayers } from '../../hooks/usePlayers.js';
import { useNow } from '../../hooks/useNow.js';
import { formatCountdown } from '../../utils/dates.js';
import { bonusStats, maxBonusPoints, scoreBonus } from '@shared/bonus.js';
import { normalizeName } from '@shared/names.js';
import { answerLabel } from '../predictions/BonusCard.jsx';

const OTHER_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#38bdf8'];
const GREEN = '#22c55e';

/** One horizontal bar per answer: name | bar | % of the players who chose it. The correct answer is green. */
function Distribution({ q, stats, ctx }) {
  const { t } = useLang();
  if (stats.numeric) {
    return (
      <div className="bonus-avg">
        <strong>{t('rb.avg', { n: stats.numeric.avg })}</strong>
        <span className="muted small" dir="ltr"> {t('rb.range', { min: stats.numeric.min, max: stats.numeric.max })}</span>
      </div>
    );
  }
  const correct = (q.answer || []).map((a) => (q.type === 'text' ? normalizeName(a) : String(a)));
  let other = 0;
  return (
    <div className="bars">
      {stats.buckets.slice(0, 8).map((b) => {
        const ok = correct.includes(b.value);
        const color = ok ? GREEN : OTHER_COLORS[other++ % OTHER_COLORS.length];
        return (
          <div key={b.value} className="bar-row">
            <span className="bar-name" dir="auto" style={ok ? { color: GREEN, fontWeight: 700 } : undefined}>{q.type === 'text' ? b.label : answerLabel(q, [b.value], ctx)}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(b.pct, 2)}%`, background: color }} /></span>
            <span className="bar-pct" style={{ color }} dir="ltr">{b.pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** "All answers (n)": every player's answer and the points they got. */
function AllAnswers({ q, picks, ctx }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const answered = (q.answer || []).length > 0;
  const rows = Object.entries(picks || {}).map(([uid, p]) => ({ uid, ...p, pts: answered ? scoreBonus(q, p.answer).pts : null }))
    .sort((a, b) => ((b.pts ?? 0) - (a.pts ?? 0)) || (a.name || '').localeCompare(b.name || '', 'he'));
  if (rows.length === 0) return null;
  return (
    <div className="bonus-foot-wrap">
      <button className="bonus-foot" onClick={() => setOpen((o) => !o)}>{open ? '▲' : '▼'} {t('rb.allAnswers', { n: rows.length })}</button>
      {open && (
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

/** Bonus results, World Cup style: per question a card with the correct answer, a max-points pill, the answer distribution and all answers. */
export default function BonusResultsTab() {
  const { t, lang } = useLang();
  const { questions, loading } = useBonus();
  const { teams } = useTeams();
  const mine = useMyPredictions();
  const allPicks = useBonusPicks();
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
        const picks = allPicks[q.id];
        const stats = bonusStats(q, picks);
        const my = mine.bonus[q.id]?.answer;
        return (
          <div key={q.id} className="bonus-card">
            <div className="bonus-head">
              <div className="bonus-title" dir="auto">{q.question?.[lang] || q.question?.en}</div>
              <div className="bonus-meta">
                {answered
                  ? <span className="bonus-ok" dir="auto">{t('bq.correctAnswer')}: ✅ {answerLabel(q, q.answer, ctx)}</span>
                  : <span className="muted small">{closed ? `🔒 ${t('rb.waiting')}` : `${t('rb.open')} · ${t('bq.locksIn', { time: formatCountdown(q.deadlineMs - nowMs) })}`}</span>}
                <span className="pill-max">{t('rb.max', { n: maxBonusPoints(q) })}</span>
              </div>
            </div>
            {closed && stats.n > 0 && <div className="bonus-body"><Distribution q={q} stats={stats} ctx={ctx} /></div>}
            {closed && stats.n === 0 && <div className="bonus-body muted small">{picks === undefined ? t('rb.soon') : t('rb.noAnswers')}</div>}
            {closed && (
              <div className="bonus-mine small">
                {t('bq.yourAnswer')}: <strong dir="auto">{my?.length ? answerLabel(q, my, ctx) : t('bq.noAnswer')}</strong>
                {answered && my?.length ? <span className={scoreBonus(q, my).pts > 0 ? 'save-ok' : 'muted'}> · {t('bq.earned', { n: scoreBonus(q, my).pts })}</span> : null}
              </div>
            )}
            {closed && <AllAnswers q={q} picks={picks} ctx={ctx} />}
          </div>
        );
      })}
    </div>
  );
}
