import { useState } from 'react';
import PageShell from '../../components/PageShell.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import MissingGamesReport from './MissingGamesReport.jsx';
import MissingBonusReport from './MissingBonusReport.jsx';

// One place for the reminders: who has not predicted the next games, and who has not answered the bonus questions (the second one is also in Bonus -> Missing answers).
export default function AdminRemindersPanel() {
  const { t } = useLang();
  const [tab, setTab] = useState('games');
  return (
    <PageShell titleKey="admin.reminders">
      <div className="tabs" role="tablist">
        {['games', 'bonus'].map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{t(`rm.tab.${k}`)}</button>
        ))}
      </div>
      <ErrorBoundary key={tab} name={`reminders-${tab}`}>{tab === 'games' ? <MissingGamesReport /> : <MissingBonusReport />}</ErrorBoundary>
    </PageShell>
  );
}
