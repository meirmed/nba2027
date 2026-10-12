import { useMemo } from 'react';
import PeriodFilter from '../../components/PeriodFilter.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useNow } from '../../hooks/useNow.js';
import { usePeriod } from '../../hooks/usePeriod.js';
import { dayKey, formatDay } from '../../utils/dates.js';
import { inRange } from '@shared/period.js';
import GameBlock from './GameBlock.jsx';

const PRESETS = ['7', '30', 'all', 'custom'];

/** Finished games by day (newest day first). Default = last 7 days. */
export default function FinishedTab() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { games, loading } = useGames();
  const nowMs = useNow(5000);
  const period = usePeriod(timezone);

  const groups = useMemo(() => {
    const m = new Map();
    games.filter((g) => g.status === 'finished').forEach((g) => {
      const k = dayKey(g.tipoff, timezone);
      if (!inRange(k, period.range)) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [games, timezone, period.range]);

  return (
    <div>
      <PeriodFilter period={period} presets={PRESETS} />
      {loading && <p className="muted">{t('common.loading')}</p>}
      {!loading && groups.length === 0 && <p className="muted">{t('results.noFinished')}</p>}
      {groups.map(([k, list]) => (
        <div key={k} className="day">
          <h3>{formatDay(list[0].tipoff, lang, timezone)}</h3>
          {list.map((g) => <GameBlock key={g.id} g={g} nowMs={nowMs} />)}
        </div>
      ))}
    </div>
  );
}
