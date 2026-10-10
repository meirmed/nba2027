import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { BOTTOM, MENU, MORE_KEYS } from './menu.js';

export default function BottomNav() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const more = MENU.filter((m) => MORE_KEYS.includes(m.key) && (!m.adminOnly || isAdmin));

  return (
    <>
      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label={t('nav.more')}>
            {more.map((m) => (
              <NavLink key={m.key} to={m.to} className="drawer-link" onClick={() => setOpen(false)}>
                <span aria-hidden>{m.icon}</span> {t(m.label)}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      <nav className="bottom-nav" aria-label="main">
        {BOTTOM.map((m) => (
          <NavLink key={m.key} to={m.to} end={m.to === '/'} className="bn-item">
            <span aria-hidden>{m.icon}</span>
            <small>{t(m.label)}</small>
          </NavLink>
        ))}
        <button className="bn-item" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span aria-hidden>⋯</span>
          <small>{t('nav.more')}</small>
        </button>
      </nav>
    </>
  );
}
