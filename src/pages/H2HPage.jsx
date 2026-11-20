import { useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import CupTab from './h2h/CupTab.jsx';
import FunTab from './h2h/FunTab.jsx';

const TABS = [['cup', CupTab], ['fun', FunTab]]; // the competition (groups -> round of 16 -> knockout) | pairs for fun

export default function H2HPage() {
  const { t } = useLang();
  const [tab, setTab] = useState('cup');
  const Tab = TABS.find(([k]) => k === tab)[1];
  return (
    <PageShell titleKey="nav.h2h">
      <div className="tabs scroll" role="tablist">
        {TABS.map(([k]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{t(`h2h.tab.${k}`)}</button>
        ))}
      </div>
      <ErrorBoundary key={tab} name={`h2h-${tab}`}><Tab /></ErrorBoundary>
    </PageShell>
  );
}
