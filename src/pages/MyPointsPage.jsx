import { useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import UserPointsView from './UserPointsView.jsx';
import UserBonusView from './UserBonusView.jsx';

// "My predictions": my game picks with points | my bonus answers with points.
export default function MyPointsPage() {
  const { t } = useLang();
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState('games');
  if (isAdmin) return <PageShell titleKey="nav.myPoints"><div className="card"><p>{t('adm.noPlay')}</p></div></PageShell>;
  return (
    <PageShell titleKey="nav.myPoints">
      <div className="utabs" role="tablist">
        {['games', 'bonus'].map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`utab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{k === 'bonus' && '🎁 '}{t(`mp.tab.${k}`)}</button>
        ))}
      </div>
      <ErrorBoundary key={tab} name={`my-predictions-${tab}`}>
        {tab === 'games' ? <UserPointsView uid={user.uid} self /> : <UserBonusView uid={user.uid} self />}
      </ErrorBoundary>
    </PageShell>
  );
}
