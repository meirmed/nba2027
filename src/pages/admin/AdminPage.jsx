import { useState } from 'react';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import AdminGamesPanel from './AdminGamesPanel.jsx';
import AdminScoringPanel from './AdminScoringPanel.jsx';
import AdminBonusPanel from './AdminBonusPanel.jsx';
import AdminUsersPanel from './AdminUsersPanel.jsx';
import AdminH2HPanel from './AdminH2HPanel.jsx';
import AdminSettingsPanel from './AdminSettingsPanel.jsx';
import AdminBackupPanel from './AdminBackupPanel.jsx';
import AdminAuditPanel from './AdminAuditPanel.jsx';

// Tab shell ONLY - no business logic. Each setting has exactly one editor in exactly one panel.
const PANELS = {
  games: ['admin.games', AdminGamesPanel],
  scoring: ['admin.scoring', AdminScoringPanel],
  bonus: ['admin.bonus', AdminBonusPanel],
  users: ['admin.users', AdminUsersPanel],
  h2h: ['admin.h2h', AdminH2HPanel],
  settings: ['admin.settings', AdminSettingsPanel],
  backup: ['admin.backup', AdminBackupPanel],
  audit: ['admin.audit', AdminAuditPanel],
};

export default function AdminPage() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const [active, setActive] = useState('games');
  const panels = isAdmin ? PANELS : { games: PANELS.games }; // the games manager (not an admin) gets the Games tab only
  const Panel = (panels[active] || panels.games)[1]; // map keyed by stable key, not array find()
  return (
    <section>
      <div className="tabs scroll" role="tablist">
        {Object.entries(panels).map(([k, [label]]) => (
          <button key={k} role="tab" aria-selected={active === k} className={`tab ${active === k ? 'active' : ''}`} onClick={() => setActive(k)}>
            {t(label)}
          </button>
        ))}
      </div>
      <ErrorBoundary key={active} name={`admin-${active}`}><Panel /></ErrorBoundary>
    </section>
  );
}
