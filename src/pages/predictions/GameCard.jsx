import TeamBadge from '../../components/TeamBadge.jsx';
import EveryonesPicks from '../../components/EveryonesPicks.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { formatCountdown, formatTime } from '../../utils/dates.js';

/** One game. Display only: all state lives in GamesTab (draft values, joker draft, rejection reasons). */
export default function GameCard({ game, nowMs, saved, draft, onEdit, jokerOn, jokerDisabled, onJoker, reason }) {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const tipMs = game.tipoff?.toMillis?.() ?? 0;
  const locked = game.status !== 'scheduled' || nowMs >= tipMs;
  const ready = !!(game.t1 && game.t2);
  const v1 = draft ? draft.s1 : saved ? String(saved.s1) : '';
  const v2 = draft ? draft.s2 : saved ? String(saved.s2) : '';
  const showResult = game.status === 'finished' || game.status === 'live';

  return (
    <div className={`pred-card ${locked ? 'is-locked' : ''}`}>
      <div className="pred-head">
        <span className="muted" dir="ltr">{formatTime(game.tipoff, lang, timezone)}</span>
        {game.status === 'cancelled' && <span className="badge">{t('status.cancelled')}</span>}
        {game.status !== 'cancelled' && (locked
          ? <span className="badge">🔒 {t('pred.locked')}</span>
          : <span className="muted small">{t('pred.locksIn', { time: formatCountdown(tipMs - nowMs) })}</span>)}
        {game.status === 'live' && <span className="badge live">{t('status.live')}</span>}
      </div>

      <div className="pred-body" dir="ltr">
        <div className="pred-team"><TeamBadge abbr={game.t1} /><small className="muted">{t('pred.home')}</small></div>
        {locked || !ready ? (
          <div className="pred-score" dir="ltr">
            <strong>{saved ? `${saved.s1} – ${saved.s2}` : '– – –'}</strong>
            {jokerOn && <span title={t('pred.joker')}> ⭐</span>}
          </div>
        ) : (
          <div className="pred-inputs" dir="ltr">
            <input className="input num" type="number" inputMode="numeric" min="0" max="200" value={v1} aria-label={t('pred.home')} onChange={(e) => onEdit('s1', e.target.value)} />
            <span>–</span>
            <input className="input num" type="number" inputMode="numeric" min="0" max="200" value={v2} aria-label={t('pred.away')} onChange={(e) => onEdit('s2', e.target.value)} />
          </div>
        )}
        <div className="pred-team"><TeamBadge abbr={game.t2} /><small className="muted">{t('pred.away')}</small></div>
      </div>

      {!ready && <p className="muted small">{t('pred.teamsTbd')}</p>}
      {locked && !saved && game.status !== 'cancelled' && <p className="muted small">{t('pred.noPick')}</p>}
      {showResult && (
        <p className="small" dir="ltr">
          {game.status === 'finished' ? t('pred.final') : t('status.live')}: <strong>{game.s1 ?? 0} – {game.s2 ?? 0}</strong>{game.ot > 0 ? ` (${t('results.ot')})` : ''}
        </p>
      )}
      {reason && <p className="error small" role="alert">{t(`pred.err.${reason}`)}</p>}

      {!locked && ready && (
        <div className="actions">
          <button className={`btn ${jokerOn ? '' : 'ghost'}`} disabled={jokerDisabled} onClick={onJoker} aria-pressed={jokerOn}>
            ⭐ {t('pred.joker')}
          </button>
        </div>
      )}
      {locked && game.status !== 'cancelled' && <EveryonesPicks gameId={game.id} result={game} />}
    </div>
  );
}
