import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useScoring } from '../contexts/SettingsContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { rankRows } from '@shared/standings.js';

const TABS = ['total', 'games', 'bonus', 'stats'];
// [header key, field, css class] per tab. Total tab = Total (green) / Games (blue) / Bonus (orange), like the World Cup app.
const COLS = {
  total: [['lb.totalCol', 'total', 'pts-total'], ['lb.games', 'gamePts', 'pts-games'], ['lb.bonus', 'bonus', 'pts-bonus']],
  games: [['lb.games', 'gamePts', 'pts-games']],
  bonus: [['lb.bonus', 'bonus', 'pts-bonus']],
};
const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '–');

function Board({ tab }) {
  const { t } = useLang();
  const { user } = useAuth();
  const scoring = useScoring();
  const { rows, loading } = usePoints();

  // 'games' tab ranks by game points only; the others use the configured tiebreakers (total first).
  const ranked = useMemo(
    () => rankRows(rows, tab === 'games' ? ['gamePts', 'exactHits', 'uniqueHits'] : tab === 'bonus' ? ['bonus', 'total'] : scoring.tiebreakers),
    [rows, tab, scoring.tiebreakers],
  );

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (ranked.length === 0) return <p className="muted">{t('lb.empty')}</p>;
  const stats = tab === 'stats';

  return (
    <div className="table-wrap">
      <table className="table lb" dir="ltr">
        <thead>
          <tr className="muted small">
            <th>#</th><th>{t('lb.name')}</th>
            {stats ? (
              <>
                <th>{t('lb.exact')}</th><th>{t('lb.winners')}</th><th>{t('lb.unique')}</th><th>{t('lb.risk')}</th>
                <th>{t('lb.played')}</th><th>{t('lb.accuracy')}</th><th>{t('lb.bestStreak')}</th><th>{t('lb.points')}</th>
              </>
            ) : COLS[tab].map(([h]) => <th key={h}>{t(h)}</th>)}
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.id} className={r.uid === user?.uid ? 'me' : ''}>
              <td>{r.rank}</td>
              <td dir="auto" className="lb-name">{r.name}{r.uid === user?.uid ? ` ${t('lb.you')}` : ''}</td>
              {stats ? (
                <>
                  <td>{r.exactHits ?? 0}</td><td>{r.winnerCorrect ?? 0}</td><td>{r.uniqueHits ?? 0}</td><td>{r.riskHits ?? 0}</td>
                  <td>{r.gamesPlayed ?? 0}</td><td>{pct(r.winnerCorrect ?? 0, r.gamesPlayed ?? 0)}</td><td>{r.bestStreak ?? 0}</td>
                  <td><strong>{r.total ?? 0}</strong></td>
                </>
              ) : COLS[tab].map(([h, f, cls]) => <td key={h}><strong className={cls}>{r[f] ?? 0}</strong></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardPage() {
  const { t } = useLang();
  const [tab, setTab] = useState('total');
  return (
    <PageShell titleKey="nav.leaderboard">
      <div className="tabs scroll" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{t(`lb.tab.${k}`)}</button>
        ))}
      </div>
      <ErrorBoundary key={tab} name={`leaderboard-${tab}`}><Board tab={tab} /></ErrorBoundary>
    </PageShell>
  );
}
