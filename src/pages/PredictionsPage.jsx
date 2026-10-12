import { useSearchParams } from 'react-router-dom';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useNow } from '../hooks/useNow.js';
import { useWeekGames } from '../hooks/useWeekGames.js';
import GamesTab from './predictions/GamesTab.jsx';
import WeekTab from './predictions/WeekTab.jsx';
import BonusTab from './predictions/BonusTab.jsx';
import { PredictionEditorProvider, usePredictionEditor } from './predictions/PredictionEditor.jsx';

// Each tab has its OWN ErrorBoundary: a bad bonus doc must never take down the games tab (WC lesson #1).
const TABS = ['games', 'week', 'bonus'];

function Tabs() {
  const { t } = useLang();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'games';
  const nowMs = useNow(15000);
  const ed = usePredictionEditor();
  const { games } = useWeekGames(nowMs);
  // open games in the next 7 days that still have no pick (saved or typed): the number on the tab
  const missing = games.filter((g) => g.status === 'scheduled' && g.t1 && g.t2 && (g.tipoff?.toMillis?.() ?? 0) > nowMs && !ed.hasPick(g.id)).length;

  return (
    <section>
      <div className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParams({ tab: k })}>
            {t(`tabs.${k}`)}{k === 'week' && missing > 0 && <span className="count-badge warn" title={t('pred.missingTip', { n: missing })}>{missing}</span>}
          </button>
        ))}
      </div>
      {tab === 'games' && <ErrorBoundary name="predictions-games"><GamesTab /></ErrorBoundary>}
      {tab === 'week' && <ErrorBoundary name="predictions-week"><WeekTab /></ErrorBoundary>}
      {tab === 'bonus' && <ErrorBoundary name="predictions-bonus"><BonusTab /></ErrorBoundary>}
    </section>
  );
}

// The provider sits ABOVE the tabs: what you typed survives switching tabs.
export default function PredictionsPage() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  if (isAdmin) return <div className="card"><p>{t('adm.noPlay')}</p></div>; // admins don't take part in the competition
  return <PredictionEditorProvider><Tabs /></PredictionEditorProvider>;
}
