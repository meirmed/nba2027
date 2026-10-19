import { useEffect, useState } from 'react';
import PageShell from '../components/PageShell.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useScoring } from '../contexts/SettingsContext.jsx';
import { useTournament } from '../hooks/useH2H.js';
import { scoreGame } from '@shared/scoring.js';
import { DEFAULT_H2H_TIEBREAKERS } from '@shared/h2h.js';

// Same look as the World Cup rules page. EVERY number comes from the live scoring settings (Admin -> Scoring), never hardcoded.
const Section = ({ title, intro, children }) => (
  <section>
    <h3 className="rules-h">{title}</h3>
    {intro && <p className="rules-intro">{intro}</p>}
    {children}
  </section>
);
const Rule = ({ title, sub, value, hl }) => (
  <div className={`rule ${hl ? 'hl' : ''}`}>
    <div className="rule-main"><strong>{title}</strong>{sub && <div className="rule-sub">{sub}</div>}</div>
    <span className="rule-val" dir="ltr">{value}</span>
  </div>
);
const Note = ({ tone = 'green', children }) => <div className={`note ${tone}`}>{children}</div>;

export const TAKANON_URL = '/takanon.pdf'; // the regulations PDF (Hebrew): put the file in the project's public folder under this name

export default function RulesPage() {
  const { t } = useLang();
  const [hasPdf, setHasPdf] = useState(false); // show the link only when the file really exists (a missing file would otherwise open the app itself)
  useEffect(() => {
    let on = true;
    fetch(TAKANON_URL, { method: 'HEAD' }).then((r) => { if (on) setHasPdf(r.ok && (r.headers.get('content-type') || '').includes('pdf')); }).catch(() => {});
    return () => { on = false; };
  }, []);
  const s = useScoring();
  const tournament = useTournament();
  const marginExact = s.winner + s.diffExact; // right winner + exact margin
  const base = marginExact + s.exact; // exact score = winner + exact margin + exact score
  const tiers = [...s.diffBonus].sort((a, b) => a.maxErr - b.maxErr);
  const numbered = (keys, ns) => keys.map((k, i) => `${i + 1}) ${t(`${ns}${k}`)}`).join(', ');
  const h2hTb = (tournament?.tiebreakers || DEFAULT_H2H_TIEBREAKERS).filter((k) => k !== 'seed'); // the page lists exact hits, then unique hits
  const pct = Math.round(s.autoFillFactor * 100);

  // Worked example (numbers are computed with the live scoring settings, so they can never go stale): the game ended 110-102, a margin of 8.
  const FINAL = { s1: 110, s2: 102, status: 'finished' };
  const example = (s1, s2, ctx = {}) => scoreGame({ s1, s2 }, FINAL, { round: 'RS', scoring: s, ...ctx }).pts;
  const topErr = tiers.length ? tiers[tiers.length - 1].maxErr : 0;
  const exampleRows = [
    { label: t('rules.ex.wrong'), guess: '98–105', pts: example(98, 105) },
    { label: t('rules.ex.winnerOnly', { n: topErr }), guess: `${100 + 8 + topErr + 1}–100`, pts: example(100 + 8 + topErr + 1, 100) },
    ...[...tiers].reverse().filter((d) => d.maxErr >= 1 && d.maxErr < 8).map((d) => ({ label: t('rules.ex.tier', { err: d.maxErr }), guess: `${100 + 8 - d.maxErr}–100`, pts: example(100 + 8 - d.maxErr, 100) })),
    { label: t('rules.ex.margin0'), guess: '105–97', pts: example(105, 97) },
    { label: t('rules.ex.margin0u'), guess: '105–97', pts: example(105, 97, { isUniqueMargin: true }) },
    { label: t('rules.ex.exact'), guess: '110–102', pts: example(110, 102) },
    { label: t('rules.ex.exactU'), guess: '110–102', pts: example(110, 102, { isUniqueExact: true }) },
  ];

  return (
    <PageShell titleKey="rules.pageTitle">
      {hasPdf && (
        <Note tone="blue">
          📄 {t('rules.takanonIntro')} <a className="chip-link" href={TAKANON_URL} target="_blank" rel="noopener noreferrer">{t('rules.takanonOpen')} ▸</a>
        </Note>
      )}
      <Section title={t('rules.sec.games')} intro={t('rules.games.intro')}>
        <Rule hl title={t('rules.r.exact')} sub={`${t('rules.r.exactSub')} (${t('rules.r.exactBreak', { w: s.winner, d: s.diffExact, e: s.exact })})`} value={base} />
        <Rule hl title={t('rules.r.unique')} sub={t('rules.r.uniqueSub', { base, n: s.unique })} value={base + s.unique} />
        <Rule title={t('rules.r.winner')} sub={t('rules.r.winnerSub')} value={s.winner} />
        <Rule title={t('rules.r.margin0')} sub={t('rules.r.margin0Sub')} value={`${s.winner}+${s.diffExact}`} />
        <Rule hl title={t('rules.r.margin0u')} sub={t('rules.r.margin0uSub')} value={`${s.winner}+${s.diffExact}+${s.uniqueDiff}`} />
        {tiers.map((d) => <Rule key={d.maxErr} title={t('rules.diff', { err: d.maxErr })} sub={t('rules.r.diffSub', { err: d.maxErr })} value={`${s.winner}+${d.pts}`} />)}
        <Rule title={t('rules.r.miss')} sub={t('rules.r.missSub')} value={0} />
        <h4 className="bq-title">{t('rules.ex.title')}</h4>
        <div className="table-wrap">
          <table className="table">
            <thead><tr className="muted small"><th>{t('rules.ex.case')}</th><th>{t('rules.ex.guess')}</th><th>{t('rules.ex.pts')}</th></tr></thead>
            <tbody>
              {exampleRows.map((r, i) => <tr key={i}><td dir="auto">{r.label}</td><td dir="ltr">{r.guess}</td><td dir="ltr"><strong className="save-ok">{r.pts}</strong></td></tr>)}
            </tbody>
          </table>
        </div>
        <Note tone="amber">{t('rules.ex.uniqueNote')}</Note>
        <Note tone="teal">🎲 {t('rules.note.auto', { pct })}</Note>
        <Note tone="green">🏀 {t('rules.ot')}</Note>
      </Section>

      <Section title={t('rules.sec.risk')} intro={t('rules.risk.intro', { pct: s.risk.maxPickPct, pts: s.risk.pts })}>
        <Rule hl title={t('rules.risk.right')} sub={t('rules.risk.rightSub', { pct: s.risk.maxPickPct })} value={`+${s.risk.pts}`} />
        <Rule title={t('rules.risk.pop')} sub={t('rules.risk.popSub', { pct: s.risk.maxPickPct })} value={0} />
        <Note tone="blue">⚠️ {t('rules.risk.note', { winner: s.winner, pts: s.risk.pts, total: s.winner + s.risk.pts })}</Note>
      </Section>

      <Section title={t('rules.sec.bonus')} intro={t('rules.bonus.intro')}>
        <Rule hl title={t('rules.bonus.right')} sub={t('rules.bonus.rightSub')} value="X" />
        <Rule title={t('rules.bonus.wrong')} sub={t('rules.bonus.wrongSub')} value={0} />
        <Note tone="blue">
          <strong>{t('rules.closest.title')}</strong>
          <p>{t('rules.closest.body')}</p>
          <p>{t('rules.closest.example')}</p>
          <p className="muted">{t('rules.closest.min')}</p>
        </Note>
        <Note tone="blue">
          <strong>{t('rules.rank.title')}</strong>
          <p>{t('rules.rank.body')}</p>
          <p>{t('rules.rank.example')}</p>
        </Note>
        <Note tone="green">{t('rules.bonus.scope')}</Note>
        <Note tone="green">{t('rules.bonus.multi')}</Note>
        <Note tone="green">{t('rules.bonus.odds')}</Note>
        <Note tone="amber">{t('rules.bonus.lock')}</Note>
      </Section>

      <Section title={t('rules.sec.joker')} intro={t('rules.joker.intro', { n: s.jokerMultiplier })}>
        <Rule hl title={t('rules.joker.title', { n: s.jokerMultiplier })} sub={t('rules.joker.sub', { max: s.jokersPerSeason })} value={`×${s.jokerMultiplier}`} />
        <Note tone="green">{t('rules.joker.note')}</Note>
      </Section>

      <Section title={t('rules.sec.h2h')} intro={t('rules.h2h.intro')}>
        <Note tone="green">
          <strong>{t('rules.h2h.league.title')}</strong>
          <ul>
            <li>{t('rules.h2h.league.b1')}</li>
            <li>{t('rules.h2h.league.b2')}</li>
            <li>{tournament?.advancePerGroup ? t('rules.h2h.league.advN', { n: tournament.advancePerGroup }) : t('rules.h2h.league.adv')}</li>
          </ul>
        </Note>
        <Note tone="blue">
          <strong>{t('rules.h2h.ko.title')}</strong>
          <ul>
            <li>{t('rules.h2h.ko.b1')}</li>
            <li>{t('rules.h2h.ko.b2')}</li>
          </ul>
        </Note>
        <Note tone="teal">
          <strong>{t('rules.h2h.fun.title')}</strong>
          <p>{t('rules.h2h.fun.body')}</p>
        </Note>
        <Rule title={t('rules.tb.h2h.title')} sub={t('rules.tb.h2h.sub', { order: numbered(h2hTb, 'ah.tb.') })} value="⚖️" />
        <Rule title={t('rules.tb.board.title')} sub={t('rules.tb.board.sub', { order: numbered(s.tiebreakers, 'tb.') })} value="⚖️" />
      </Section>

      <Note tone="amber">🔒 {t('rules.lock')}</Note>
    </PageShell>
  );
}
