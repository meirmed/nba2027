import { useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useBonus } from '../contexts/BonusContext.jsx';
import { useGames } from '../hooks/useGames.js';
import LiveTab from './results/LiveTab.jsx';
import FinishedTab from './results/FinishedTab.jsx';
import BonusResultsTab from './results/BonusResultsTab.jsx';

// Same tabs as the World Cup results page: live games | finished (count) | bonus (count).
const TABS = [['live', LiveTab], ['finished', FinishedTab], ['bonus', BonusResultsTab]];

export default function ResultsPage() {
  const { t } = useLang();
  const { games } = useGames();
  const { questions } = useBonus();
  const [tab, setTab] = useState('live');
  const Tab = TABS.find(([k]) => k === tab)[1];
  const counts = {
    live: games.filter((g) => g.status === 'live').length,
    finished: games.filter((g) => g.status === 'finished').length,
    bonus: questions.length,
  };
  return (
    <PageShell titleKey="results.pageTitle">
      <div className="utabs" role="tablist">
        {TABS.map(([k]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`utab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {k === 'bonus' && '🎁 '}{t(`results.tab.${k}`)}
            {counts[k] > 0 && <span className="count-badge">{counts[k]}</span>}
          </button>
        ))}
      </div>
      <ErrorBoundary key={tab} name={`results-${tab}`}><Tab /></ErrorBoundary>
    </PageShell>
  );
}
