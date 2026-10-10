import { useTeams } from '../contexts/TeamsContext.jsx';
import { useLang } from '../contexts/LangContext.jsx';

export default function TeamBadge({ abbr, short = false, compact = false }) {
  const { teams } = useTeams();
  const { lang, t } = useLang();
  if (!abbr) return <span className="muted">{t('common.tbd')}</span>;
  const tm = teams[abbr];
  const name = tm ? tm[lang] || tm.en : abbr;
  const shortName = tm ? (lang === 'he' ? tm.shortHe : tm.shortEn) || name : abbr;
  return (
    <span className="team">
      {compact
        ? <strong><span className="name-full">{name}</span><span className="name-short">{shortName}</span></strong>
        : <strong>{short ? abbr : name}</strong>}
    </span>
  );
}
