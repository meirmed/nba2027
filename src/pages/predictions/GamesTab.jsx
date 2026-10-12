import { useMemo, useState } from 'react';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useNow } from '../../hooks/useNow.js';
import { dayKey, formatDay } from '../../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import GameCard from './GameCard.jsx';
import { SaveBar, usePredictionEditor } from './PredictionEditor.jsx';

/** Day-by-day predictions (arrows jump between days that have games). Editing state is shared with the Next 7 days tab. */
export default function GamesTab() {
  const { t, lang } = useLang();
  const settings = useSettings();
  const { games, loading } = useGames();
  const nowMs = useNow(1000);
  const ed = usePredictionEditor();
  const tz = settings.timezone;
  const [selKey, setSelKey] = useState(null);

  const days = useMemo(() => {
    const m = new Map();
    games.filter((g) => countsForStandings(g, settings.countedRounds)).forEach((g) => {
      const k = dayKey(g.tipoff, tz);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [games, settings.countedRounds, tz]);

  const todayKey = dayKey(new Date(nowMs), tz);
  const defaultKey = (days.find(([k]) => k >= todayKey) || days[days.length - 1] || [null])[0];
  const activeKey = selKey && days.some(([k]) => k === selKey) ? selKey : defaultKey;
  const idx = days.findIndex(([k]) => k === activeKey);
  const dayGames = idx >= 0 ? days[idx][1] : [];

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (days.length === 0) return <p className="muted">{t('pred.noGames')}</p>;

  return (
    <div>
      <div className="day-nav">
        <button className="btn ghost" disabled={idx <= 0} onClick={() => setSelKey(days[idx - 1][0])} aria-label={t('pred.prev')}>{lang === 'he' ? '▶' : '◀'}</button>
        <div className="day-title">
          <strong>{dayGames[0] ? formatDay(dayGames[0].tipoff, lang, tz) : ''}</strong>
          {activeKey !== defaultKey && <button className="btn ghost" onClick={() => setSelKey(null)}>{t('pred.today')}</button>}
        </div>
        <button className="btn ghost" disabled={idx < 0 || idx >= days.length - 1} onClick={() => setSelKey(days[idx + 1][0])} aria-label={t('pred.next')}>{lang === 'he' ? '◀' : '▶'}</button>
      </div>
      <p className="muted small">{t('pred.jokersLeft', { n: ed.jokersLeft, max: ed.jokersMax })}</p>
      {dayGames.map((g) => <GameCard key={g.id} game={g} nowMs={nowMs} {...ed.cardProps(g)} />)}
      <SaveBar games={dayGames} />
    </div>
  );
}
