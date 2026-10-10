import PageShell from '../components/PageShell.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useScoring } from '../contexts/SettingsContext.jsx';

// Rules are rendered from the live scoring config - no hardcoded point values.
export default function RulesPage() {
  const { t } = useLang();
  const s = useScoring();
  const rows = [
    [t('rules.winner'), s.winner],
    [t('rules.exact'), s.exact],
    [t('rules.unique'), s.unique],
    [t('rules.risk', { pct: s.risk.maxPickPct }), s.risk.pts],
    ...s.diffBonus.map((d) => [t('rules.diff', { err: d.maxErr }), d.pts]),
    [t('rules.joker', { n: s.jokerMultiplier, max: s.jokersPerSeason }), `×${s.jokerMultiplier}`],
    [t('rules.autofill'), `×${s.autoFillFactor}`],
  ];
  return (
    <PageShell titleKey="nav.rules">
      <h3>{t('rules.scoringTitle')}</h3>
      <table className="table" dir="ltr">
        <tbody>{rows.map(([label, v], i) => <tr key={i}><td>{label}</td><td>{v}</td></tr>)}</tbody>
      </table>
      <p className="muted">{t('rules.placeholderNote')}</p>
    </PageShell>
  );
}
