import { useMemo } from 'react';
import PageShell from '../components/PageShell.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { formatDateTime } from '../utils/dates.js';

// Skeleton (Phase 2): my pick vs result per game. Points columns arrive with scoring in Phase 3.
export default function MyPointsPage() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { games } = useGames();
  const mine = useMyPredictions();
  const rows = useMemo(() => games.filter((g) => mine.games[g.id]).reverse(), [games, mine.games]);

  return (
    <PageShell titleKey="nav.myPoints">
      {rows.length === 0 && <p className="muted">{t('mp.empty')}</p>}
      {rows.map((g) => {
        const p = mine.games[g.id];
        return (
          <div key={g.id} className="row">
            <div className="grow">
              <div><TeamBadge abbr={g.t1} /> <span className="muted">–</span> <TeamBadge abbr={g.t2} /></div>
              <div className="muted small">{formatDateTime(g.tipoff, lang, timezone)}</div>
            </div>
            <div dir="ltr">
              <div>{t('mp.myPick')}: <strong>{p.s1} – {p.s2}</strong>{mine.jokers[g.id] ? ' ⭐' : ''}</div>
              <div className="muted small">{g.status === 'finished' ? `${t('pred.final')}: ${g.s1} – ${g.s2}` : t('mp.pending')}</div>
            </div>
          </div>
        );
      })}
      <p className="muted small">{t('mp.pointsSoon')}</p>
    </PageShell>
  );
}
