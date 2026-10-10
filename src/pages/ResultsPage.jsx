import { useMemo } from 'react';
import PageShell from '../components/PageShell.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { dayKey, formatDay, formatTime } from '../utils/dates.js';

export default function ResultsPage() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { games, loading, error } = useGames();

  const groups = useMemo(() => {
    const m = new Map();
    games.forEach((g) => {
      const k = dayKey(g.tipoff, timezone);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    return [...m.entries()];
  }, [games, timezone]);

  return (
    <PageShell titleKey="nav.results">
      {loading && <p className="muted">{t('common.loading')}</p>}
      {error && <p className="error">{t('common.error')}</p>}
      {!loading && !error && groups.length === 0 && <p className="muted">{t('results.empty')}</p>}
      {groups.map(([k, list]) => (
        <div key={k} className="day">
          <h3>{formatDay(list[0].tipoff, lang, timezone)}</h3>
          {list.map((g) => (
            <div key={g.id} className={`game-row status-${g.status}`}>
              <span className="muted time" dir="ltr">{formatTime(g.tipoff, lang, timezone)}</span>
              <span className="teams"><TeamBadge abbr={g.t1} /> <span className="muted">–</span> <TeamBadge abbr={g.t2} /></span>
              <span className="score" dir="ltr">
                {g.status === 'finished' || g.status === 'live' ? `${g.s1 ?? 0} – ${g.s2 ?? 0}` : ''}
                {g.ot > 0 && <small> {t('results.ot')}{g.ot > 1 ? g.ot : ''}</small>}
              </span>
              <span className={`badge ${g.status}`}>{t(`status.${g.status}`)}</span>
            </div>
          ))}
        </div>
      ))}
    </PageShell>
  );
}
