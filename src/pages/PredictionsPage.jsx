import { useSearchParams } from 'react-router-dom';
import { useLang } from '../contexts/LangContext.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import PageShell from '../components/PageShell.jsx';
import GamesTab from './predictions/GamesTab.jsx';

// Each tab has its OWN ErrorBoundary: a bad bonus doc must never take down the games tab (WC lesson #1).
function BonusTab() { return <PageShell titleKey="nav.bonus" />; }

export default function PredictionsPage() {
  const { t } = useLang();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'bonus' ? 'bonus' : 'games';
  return (
    <section>
      <div className="tabs" role="tablist">
        {['games', 'bonus'].map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`}
            onClick={() => setParams({ tab: k })}>{t(`tabs.${k}`)}</button>
        ))}
      </div>
      {tab === 'games'
        ? <ErrorBoundary name="predictions-games"><GamesTab /></ErrorBoundary>
        : <ErrorBoundary name="predictions-bonus"><BonusTab /></ErrorBoundary>}
    </section>
  );
}
