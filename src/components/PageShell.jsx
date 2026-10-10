import { useLang } from '../contexts/LangContext.jsx';

export default function PageShell({ titleKey, children }) {
  const { t } = useLang();
  return (
    <section>
      <h2>{t(titleKey)}</h2>
      {children ?? <p className="muted">{t('common.comingSoon')}</p>}
    </section>
  );
}
