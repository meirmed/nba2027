import { useLang } from '../contexts/LangContext.jsx';
import { useTeams } from '../contexts/TeamsContext.jsx';

/** The statistics block (opened by the "Statistics" button of the game card): winner split, average score and margin, most popular exact score, margin spread. Real picks only. */
export default function PickStats({ stats: s, game }) {
  const { t, lang } = useLang();
  const { teams } = useTeams();
  if (!s) return null;
  const nameOf = (abbr) => teams[abbr]?.[lang === 'he' ? 'shortHe' : 'shortEn'] || abbr;
  const homeName = nameOf(game.t1);
  const awayName = nameOf(game.t2);
  const maxBucket = Math.max(1, ...s.buckets.map((b) => b.count));
  const showPct = (p) => (p >= 14 ? `${p}%` : ''); // a thin segment has no room for its number: the legend below has it

  return (
    <div className="pstat">
      <div className="pstat-head"><strong>📊 {t('ps.title')}</strong><span className="muted small">{t('ps.count', { n: s.n })}</span></div>

      <div className="pstat-bar" role="img" aria-label={`${homeName} ${s.homePct}%, ${awayName} ${s.awayPct}%`}>
        {s.homePct > 0 && <span className="pstat-home" style={{ width: `${s.homePct}%` }}>{showPct(s.homePct)}</span>}
        {s.tiePct > 0 && <span className="pstat-tie" style={{ width: `${s.tiePct}%` }}>{showPct(s.tiePct)}</span>}
        {s.awayPct > 0 && <span className="pstat-away" style={{ width: `${s.awayPct}%` }}>{showPct(s.awayPct)}</span>}
      </div>
      <div className="pstat-legend small">
        <span><i className="pstat-dot pstat-home" /> <span dir="auto">{homeName}</span> · <strong>{s.homePct}%</strong> <span className="muted">({s.home})</span></span>
        {s.tie > 0 && <span><i className="pstat-dot pstat-tie" /> {t('ps.tie')} · <strong>{s.tiePct}%</strong> <span className="muted">({s.tie})</span></span>}
        <span><i className="pstat-dot pstat-away" /> <span dir="auto">{awayName}</span> · <strong>{s.awayPct}%</strong> <span className="muted">({s.away})</span></span>
      </div>

      <div className="pstat-line">
        <span className="muted">{t('ps.avg')}</span>
        <span><span dir="auto">{homeName}</span> <strong dir="ltr">{s.avgHome}</strong> – <strong dir="ltr">{s.avgAway}</strong> <span dir="auto">{awayName}</span></span>
        <span className="muted small">{t('ps.avgMargin')}: <strong dir="ltr">{s.avgMargin}</strong></span>
      </div>

      <div className="pstat-line">
        <span className="muted">{t('ps.popular')}</span>
        {s.popular.scores.length > 0
          ? <span>{s.popular.scores.map((x) => <strong key={x} dir="ltr" className="pstat-score">{x.replace('-', '–')}</strong>)} <span className="muted small">{t('ps.times', { n: s.popular.count })}</span></span>
          : <span className="muted small">{t('ps.allDifferent')}</span>}
      </div>

      <div className="pstat-spread">
        <div className="muted small">{t('ps.spread')}</div>
        {s.buckets.map((b) => (
          <div key={b.key} className="pstat-row">
            <span className="pstat-lbl" dir="ltr">{b.key}</span>
            <span className="pstat-track"><span className="pstat-fill" style={{ width: `${(100 * b.count) / maxBucket}%` }} /></span>
            <strong className="pstat-n" dir="ltr">{b.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
