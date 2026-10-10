import { useMemo } from 'react';
import PageShell from '../components/PageShell.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useSettings, useScoring } from '../contexts/SettingsContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { formatDateTime } from '../utils/dates.js';

// Each number is its own flex item, so the row follows the page direction deterministically:
// Hebrew (RTL): home team + home score on the RIGHT, away on the LEFT. English (LTR): home on the left.
const Score = ({ a, b }) => <span className="score"><span>{a}</span><span className="muted">–</span><span>{b}</span></span>;

// Skeleton (Phase 2): one line per game = teams | my pick | actual result. Points columns arrive with scoring (Phase 3).
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
      {rows.length > 0 && (
        <>
          <p className="muted small">{t('mp.jokerLegend', { n: jokerMultiplier })}</p>
          <div className="mp-line mp-head muted small">
            <span className="mp-star" />
            <span className="mp-teams" />
            <span className="mp-col">{t('mp.myPick')}</span>
            <span className="mp-col">{t('mp.result')}</span>
          </div>
        </>
      )}
      {rows.map((g) => {
        const p = mine.games[g.id];
        const hasResult = g.status === 'finished' || g.status === 'live';
        return (
          <div key={g.id} className="mp-row">
            <div className="mp-line">
              <span className="mp-star" title={mine.jokers[g.id] ? t('pred.joker', { n: jokerMultiplier }) : ''}>{mine.jokers[g.id] ? '⭐' : ''}</span>
              <span className="mp-teams"><TeamBadge abbr={g.t1} compact /><span className="muted">–</span><TeamBadge abbr={g.t2} compact /></span>
              <strong className="mp-col"><Score a={p.s1} b={p.s2} /></strong>
              <span className="mp-col">{hasResult ? <Score a={g.s1 ?? 0} b={g.s2 ?? 0} /> : <span className="muted">–</span>}</span>
            </div>
            <div className="muted small">
              {formatDateTime(g.tipoff, lang, timezone)}
              {g.status === 'live' && ` · ${t('status.live')}`}
              {g.status === 'scheduled' && ` · ${t('mp.pending')}`}
              {g.ot > 0 && ` · ${t('results.ot')}`}
            </div>
          </div>
        );
      })}
      <p className="muted small">{t('mp.pointsSoon')}</p>
    </PageShell>
  );
}
