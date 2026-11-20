import { useState } from 'react';
import PageShell from '../../components/PageShell.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import CupManager from './CupManager.jsx';
import FunPairsManager from './FunPairsManager.jsx';

// Shell only: the competition (dates, groups A-D, tie decisions) | Pairs for fun. Editors live in the two managers.
const TABS = { tournament: CupManager, fun: FunPairsManager };

export default function AdminH2HPanel() {
  const { t } = useLang();
  const [tab, setTab] = useState('tournament');
  const Tab = TABS[tab];
  return (
    <PageShell titleKey="admin.h2h">
      <div className="tabs" role="tablist">
        {Object.keys(TABS).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{t(`ah.tab.${k}`)}</button>
        ))}
      </div>
      <ErrorBoundary key={tab} name={`admin-h2h-${tab}`}><Tab /></ErrorBoundary>
    </PageShell>
  );
}
