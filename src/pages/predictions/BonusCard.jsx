import { useLang } from '../../contexts/LangContext.jsx';
import { useTeams } from '../../contexts/TeamsContext.jsx';
import PlayerPicker from '../../components/PlayerPicker.jsx';
import TeamPicker from '../../components/TeamPicker.jsx';
import RankingInput from '../../components/RankingInput.jsx';
import { DIVISIONS } from '@shared/teams.js';
import RankingTable from '../../components/RankingTable.jsx';
import { formatCountdown } from '../../utils/dates.js';
import { isOptionType, scopeTeams, scoreBonus } from '@shared/bonus.js';

/** Human-readable answer (option / team / player names). Used for my answer and the correct answer. */
export function answerLabel(q, list, { lang, teams, playersById }) {
  if (q.type === 'ranking') { // short form: the top 3 of each conference
    const nm = (a) => (teams[a] ? (lang === 'he' ? teams[a].shortHe : teams[a].shortEn) || teams[a][lang] : a);
    return `${(list || []).slice(0, 3).map(nm).join(', ')} … | ${(list || []).slice(15, 18).map(nm).join(', ')} …`;
  }
  return (list || []).map((v) => {
    if (isOptionType(q.type)) { const o = (q.options || []).find((x) => x.id === v); return o ? o[lang] || o.en : v; }
    if (q.type === 'team' || q.type === 'division_team' || q.type === 'conference_team') return teams[v] ? teams[v][lang] || teams[v].en : v;
    if (q.type === 'player') return playersById[v]?.name || '…';
    return v;
  }).join(', ');
}

/** A player's answer as text; a RANKING opens as a table with the final place and the places missed per team (once the final order is set). */
export function AnswerView({ q, answer, ctx }) {
  const { t } = useLang();
  if (!answer?.length) return <strong>{t('bq.noAnswer')}</strong>;
  if (q.type !== 'ranking') return <strong dir="auto">{answerLabel(q, answer, ctx)}</strong>;
  return (
    <details className="rank-details">
      <summary>{t('rk.myRank')}</summary>
      <RankingTable order={answer} actual={(q.answer || []).length ? q.answer : null} />
    </details>
  );
}

/** One bonus question. Display only: draft/save state lives in BonusTab. */
export default function BonusCard({ q, nowMs, closedReason, value, onChange, status, reason, players, playersById, savedAnswer, hideLock = false }) {
  const { t, lang } = useLang();
  const { teams } = useTeams();
  const ctx = { lang, teams, playersById };
  const closed = !!closedReason;
  const maxPicks = q.multi ? (Number.isInteger(q.maxPicks) && q.maxPicks > 0 ? q.maxPicks : Infinity) : 1;
  const multi = q.multi && q.type !== 'numeric';

  const info = (() => {
    if (q.type === 'closest') return t('bq.closestInfo', { n: q.pts, p: q.penalty ?? 1 });
    if (q.type === 'ranking') return t('bq.rankInfo', { n: q.pts, p: q.penalty ?? 0.5 });
    if (q.type === 'dynamic_score') return t('bq.dynamicInfo');
    if (q.multi) return t('bq.ptsPerPickInfo', { n: q.pts });
    return t('bq.ptsInfo', { n: q.pts });
  })();
  // "Division: Atlantic" / "Conference: East" for the two scope types
  const scopeTitle = q.type === 'division_team' ? `${t('bq.scopeDivision')}: ${DIVISIONS[q.scope]?.[lang] || ''}` : q.type === 'conference_team' ? `${t('bq.scopeConference')}: ${t(q.scope === 'E' ? 'rk.east' : 'rk.west')}` : '';

  const toggle = (id) => {
    const has = value.includes(id);
    if (!multi) { onChange([id]); return; }
    if (has) onChange(value.filter((x) => x !== id));
    else if (value.length < maxPicks) onChange([...value, id]);
  };

  const input = (() => {
    if (q.type === 'ranking') return <RankingInput value={value} onChange={onChange} />;
    if (q.type === 'division_team' || q.type === 'conference_team') return <TeamPicker value={value} onChange={onChange} max={1} only={scopeTeams(q)} />;
    if (q.type === 'numeric' || q.type === 'closest') return <input className="input num wide" dir="ltr" type="number" inputMode="decimal" value={value[0] ?? ''} onChange={(e) => onChange([e.target.value])} />;
    if (q.type === 'text') return <input className="input" dir="auto" maxLength={200} value={value[0] ?? ''} onChange={(e) => onChange([e.target.value])} />;
    if (q.type === 'player') return <PlayerPicker players={players} value={value} onChange={onChange} max={maxPicks} />;
    if (q.type === 'team') return <TeamPicker value={value} onChange={onChange} max={maxPicks} />;
    const list = (q.options || []).map((o) => ({ id: o.id, label: `${o[lang] || o.en}${q.type === 'dynamic_score' ? ` (+${o.pts})` : ''}` }));
    return (
      <div className="bq-options">
        {list.map((o) => (
          <label key={o.id} className="check">
            <input type={multi ? 'checkbox' : 'radio'} name={q.id} checked={value.includes(o.id)} disabled={multi && !value.includes(o.id) && value.length >= maxPicks} onChange={() => toggle(o.id)} /> {o.label}
          </label>
        ))}
      </div>
    );
  })();

  const answered = (q.answer || []).length > 0;
  const mine = savedAnswer || [];
  const score = answered ? scoreBonus(q, mine) : null;

  return (
    <div className={`bq-card ${closed ? 'is-locked' : ''}`}>
      <div className="pred-head">
        <strong>{q.question?.[lang] || q.question?.en}</strong>
      </div>
      <div className="muted small">
        {scopeTitle && <strong dir="auto">{scopeTitle} · </strong>}{info}
        {multi && Number.isFinite(maxPicks) ? ` · ${t('bq.pickUpTo', { n: maxPicks })}` : ''}
        {!hideLock && ' · '}
        {!hideLock && (closed ? `🔒 ${t('pred.locked')}` : t('bq.locksIn', { time: formatCountdown(q.deadlineMs - nowMs) }))}
      </div>

      {!closed && input}
      {!closed && status === 'saved' && <span className="save-ok">✓ {t('pred.savedShort')}</span>}
      {!closed && status === 'saving' && <span className="muted small">{t('pred.saving')}</span>}
      {reason && <p className="error small" role="alert">{t(`bq.err.${reason}`)}</p>}

      {closed && (
        <div className="small">
          <div>{t('bq.yourAnswer')}: <AnswerView q={q} answer={mine} ctx={ctx} /></div>
          {answered && <div>{t('bq.correctAnswer')}: <strong dir="auto">{answerLabel(q, q.answer, ctx)}</strong></div>}
          {answered && <div className={score.pts > 0 ? 'save-ok' : 'muted'}>{t('bq.earned', { n: score.pts })}</div>}
        </div>
      )}
    </div>
  );
}
