import { useLang } from '../../contexts/LangContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useNow } from '../../hooks/useNow.js';
import GameBlock from './GameBlock.jsx';

/** Games in play right now (updates by itself). */
export default function LiveTab() {
  const { t } = useLang();
  const { games, loading } = useGames();
  const nowMs = useNow(5000);
  const live = games.filter((g) => g.status === 'live');
  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (live.length === 0) return <div className="empty"><div className="empty-icon">🏀</div><p>{t('results.noLive')}</p></div>;
  return <div>{live.map((g) => <GameBlock key={g.id} g={g} nowMs={nowMs} />)}</div>;
}
