import { useMemo } from 'react';
import PageShell from '../components/PageShell.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useSettings, useScoring } from '../contexts/SettingsContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { formatDateTime } from '../utils/dates.js';

// Skeleton (Phase 2): my pick vs result per game. Points columns arrive with scoring in Phase 3.
// Main line = "home – away   my pick" on ONE line (short team names on phones); details underneath.
export default function MyPointsPage() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { jokerMultiplier } = useScoring();
  const { games } = useGames();
  const mine = useMyPredictions();
  const rows = useMemo(() => games.filter((g) => mine.games[g.id]).reverse(), [games, mine.games]);

  return (
    <PageShell titleKey="nav.myPoints">
      {rows.length === 0 && <p className="muted">{t('mp.empty')}</p>}
      {rows.length > 0 && <p className="muted small">{t('mp.jokerLegend', { n: jokerMultiplier })}</p>}
      {rows.map((g) => {
        const p = mine.games[g.id];
        return (
          <div key={g.id} className="mp-row">
            <div className="mp-main" dir="ltr">
              <span className="mp-teams"><TeamBadge abbr={g.t1} compact /> <span className="muted">–</span> <TeamBadge abbr={g.t2} compact /></span>
              <strong className="mp-pick">{p.s1} – {p.s2}{mine.jokers[g.id] ? ' ⭐' : ''}</strong>
            </div>
            <div className="muted small">
              {formatDateTime(g.tipoff, lang, timezone)} · {g.status === 'finished' ? <span dir="ltr">{t('pred.final')}: {g.s1} – {g.s2}</span> : t('mp.pending')}
            </div>
          </div>
        );
      })}
      <p className="muted small">{t('mp.pointsSoon')}</p>
    </PageShell>
  );
}
