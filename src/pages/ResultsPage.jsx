import { useMemo } from 'react';
import PageShell from '../components/PageShell.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import Score from '../components/Score.jsx';
import PeriodFilter from '../components/PeriodFilter.jsx';
import EveryonesPicks from '../components/EveryonesPicks.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { usePeriod } from '../hooks/usePeriod.js';
import { useNow } from '../hooks/useNow.js';
import { dayKey, formatDay, formatTime } from '../utils/dates.js';
import { inRange } from '@shared/period.js';

export default function ResultsPage() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { games, loading, error } = useGames();
  const period = usePeriod(timezone);
  const nowMs = useNow(5000);

  const groups = useMemo(() => {
    const m = new Map();
    games.forEach((g) => {
      const k = dayKey(g.tipoff, timezone);
      if (!inRange(k, period.range)) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g); // games arrive sorted by tip-off: each day stays in time order
    });
    const asc = period.preset === 'upcoming'; // upcoming: soonest first; otherwise newest day first
    return [...m.entries()].sort((a, b) => (asc ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])));
  }, [games, timezone, period.range, period.preset]);

  return (
    <PageShell titleKey="nav.results">
      <PeriodFilter period={period} />
      {loading && <p className="muted">{t('common.loading')}</p>}
      {error && <p className="error">{t('common.error')}</p>}
      {!loading && !error && games.length === 0 && <p className="muted">{t('results.empty')}</p>}
      {!loading && !error && games.length > 0 && groups.length === 0 && <p className="muted">{t('results.noneInRange')}</p>}
      {groups.map(([k, list]) => (
        <div key={k} className="day">
          <h3>{formatDay(list[0].tipoff, lang, timezone)}</h3>
          {list.map((g) => {
            const started = g.status !== 'scheduled' || nowMs >= (g.tipoff?.toMillis?.() ?? 0);
            return (
              <div key={g.id} className="game-block">
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
          })}
        </div>
      ))}
    </PageShell>
  );
}
