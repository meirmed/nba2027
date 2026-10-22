import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useNow } from '../../hooks/useNow.js';
import { useWeekGames } from '../../hooks/useWeekGames.js';
import { formatDay } from '../../utils/dates.js';
import GameCard from './GameCard.jsx';
import { SaveBar, usePredictionEditor } from './PredictionEditor.jsx';

/** The next 7 days (today + 6) in ONE list, grouped by day. Same cards, autosave, jokers and save bar as the Games tab. */
export default function WeekTab() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const nowMs = useNow(1000);
  const ed = usePredictionEditor();
  const { groups, games, hidden, loading } = useWeekGames(nowMs);

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (games.length === 0) return <p className="muted">{t(hidden > 0 ? 'pred.noOpenGames' : 'pred.noGamesWeek')}</p>;
  return (
    <div>
      <p className="muted small">{t('pred.jokersLeft', { n: ed.jokersLeft, max: ed.jokersMax })}</p>
      {groups.map(([k, list]) => (
        <section key={k}>
          <h3 className="bq-title">{formatDay(list[0].tipoff, lang, timezone)}</h3>
          {list.map((g) => <GameCard key={g.id} game={g} nowMs={nowMs} {...ed.cardProps(g)} />)}
        </section>
      ))}
      <SaveBar games={games} />
    </div>
  );
}
