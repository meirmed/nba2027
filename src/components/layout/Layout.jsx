import { NavLink, Outlet } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import BottomNav from './BottomNav.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';
import { MENU } from './menu.js';

export default function Layout() {
  const { t, lang, setLang } = useLang();
  const { isAdmin, isGameManager, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <strong>🏀 {t('app.name')}</strong>
        <nav className="topnav" aria-label="desktop">
          {MENU.filter((m) => (!m.adminOnly || isAdmin || (m.key === 'admin' && isGameManager)) && !(m.playerOnly && isAdmin)).map((m) => (
            <NavLink key={m.key} to={m.to} end={m.to === '/'} className="topnav-link">{t(m.label)}</NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setLang(lang === 'he' ? 'en' : 'he')}>{t('common.language')}</button>
        <button className="btn ghost" onClick={logout}>{t('auth.logout')}</button>
      </header>
      <main className="content">
        <ErrorBoundary name="layout-outlet"><Outlet /></ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
