import { useTeams } from '../contexts/TeamsContext.jsx';
import { useLang } from '../contexts/LangContext.jsx';

export default function TeamBadge({ abbr, short = false }) {
  const { teams } = useTeams();
  const { lang, t } = useLang();
  if (!abbr) return <span className="muted">{t('common.tbd')}</span>;
  const tm = teams[abbr];
  const name = tm ? tm[lang] || tm.en : abbr;
  return (
    <span className="team">
      <span className="dot" style={{ background: tm?.color || '#888' }} aria-hidden />
      <strong>{short ? abbr : name}</strong>
    </span>
  );
}
