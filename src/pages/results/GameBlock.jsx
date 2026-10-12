import TeamBadge from '../../components/TeamBadge.jsx';
import Score from '../../components/Score.jsx';
import EveryonesPicks from '../../components/EveryonesPicks.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { formatTime } from '../../utils/dates.js';

/** One game row + "Everyone's picks" (only once the game has started). */
export default function GameBlock({ g, nowMs }) {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const started = g.status !== 'scheduled' || nowMs >= (g.tipoff?.toMillis?.() ?? 0);
  return (
    <div className="game-block">
      <div className={`game-row status-${g.status}`}>
        <span className="muted time" dir="ltr">{formatTime(g.tipoff, lang, timezone)}</span>
        <span className="teams"><TeamBadge abbr={g.t1} /> <span className="muted">–</span> <TeamBadge abbr={g.t2} /></span>
        <span className="res-score">
          {g.status === 'finished' || g.status === 'live' ? <Score a={g.s1 ?? 0} b={g.s2 ?? 0} /> : ''}
          {g.status === 'live' && g.liveText && <small className="muted" dir="ltr"> {g.liveText}</small>}
          {g.ot > 0 && <small> {t('results.ot')}{g.ot > 1 ? g.ot : ''}</small>}
        </span>
        <span className={`badge ${g.status}`}>{t(`status.${g.status}`)}</span>
      </div>
      {started && g.status !== 'cancelled' && <EveryonesPicks gameId={g.id} result={g} />}
    </div>
  );
}
