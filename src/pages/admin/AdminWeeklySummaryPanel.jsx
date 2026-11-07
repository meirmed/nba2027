import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings, useScoring } from '../../contexts/SettingsContext.jsx';
import { useTeams } from '../../contexts/TeamsContext.jsx';
import { usePoints } from '../../contexts/PointsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { countsForStandings } from '@shared/games.js';
import { MAX_WORDS, claudePrompt, computeFacts, factLine, weekOptions, wordCount, writeSummary } from '@shared/weeklySummary.js';
import { dayKey, formatKeyDay } from '../../utils/dates.js';

/** Admin -> "Weekly summary": the interesting things of a week, found in the data, and a short funny text about them (<= 150 words) to copy to the group. */
export default function AdminWeeklySummaryPanel() {
  const { t, lang } = useLang();
  const settings = useSettings();
  const scoring = useScoring();
  const { teams } = useTeams();
  const { baseRows } = usePoints();
  const { games } = useGames();
  const tz = settings.timezone;

  const weeks = useMemo(() => weekOptions(dayKey(new Date(), tz)), [tz]);
  const [idx, setIdx] = useState(1); // the last completed week
  const [seed, setSeed] = useState(0); // another version of the same facts
  const [picks, setPicks] = useState({}); // {gameId: {uid: pick} | null (not published)}
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState('');
  const w = weeks[idx];

  const weekGames = useMemo(() => games.filter((g) => countsForStandings(g, settings.countedRounds) && g.status === 'finished' && g.tipoff
    && dayKey(g.tipoff, tz) >= w.lo && dayKey(g.tipoff, tz) <= w.hi), [games, settings.countedRounds, tz, w]);

  useEffect(() => { // the published picks of the week's games (one read per game, kept while the tab is open)
    const missing = weekGames.filter((g) => picks[g.id] === undefined);
    if (missing.length === 0) return undefined;
    let alive = true;
    setLoading(true);
    Promise.all(missing.map(async (g) => {
      try { const s = await getDoc(doc(db, 'picks', g.id)); return [g.id, s.exists() ? (s.data().picks || {}) : null]; } catch { return [g.id, null]; }
    })).then((entries) => { if (alive) { setPicks((p) => ({ ...p, ...Object.fromEntries(entries) })); setLoading(false); } });
    return () => { alive = false; };
  }, [weekGames]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamName = (abbr) => teams[abbr]?.[lang === 'he' ? 'shortHe' : 'shortEn'] || abbr;
  const monthName = (key) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(`${key}-15T12:00:00Z`));
  const facts = useMemo(() => (loading ? [] : computeFacts({
    rows: baseRows, scoring, weekLo: w.lo, weekHi: w.hi, picksByGame: picks, teamName,
    games: weekGames.map((g) => ({ id: g.id, round: g.round, status: g.status, t1: g.t1, t2: g.t2, s1: g.s1, s2: g.s2, tipoffMs: g.tipoff.toMillis() })),
  })), [loading, baseRows, scoring, w, picks, weekGames, teams, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => writeSummary(facts, { seed, monthName }), [facts, seed, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!edited) setText(summary.paragraphs.join('\n\n')); }, [summary, edited]);

  const copy = async (what, value) => {
    try { await navigator.clipboard.writeText(value); setCopied(what); setTimeout(() => setCopied(''), 2000); } catch { setCopied(''); }
  };
  const words = wordCount(text);
  const label = (x) => `${formatKeyDay(x.lo, lang)} – ${formatKeyDay(x.hi, lang)}${x.current ? ` (${t('ws.sofar')})` : ''}`;

  return (
    <div className="card">
      <h3 className="bq-title">{t('ws.title')}</h3>
      <p className="muted small">{t('ws.intro')}</p>

      <div className="row-gap">
        <label className="muted small" htmlFor="ws-week">{t('ws.week')}</label>
        <select id="ws-week" className="input" value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setSeed(0); setEdited(false); }}>
          {weeks.map((x, i) => <option key={x.lo} value={i}>{label(x)}</option>)}
        </select>
      </div>

      {loading ? <p className="muted">{t('common.loading')}</p> : (
        <>
          <textarea className="input ws-text" dir="auto" rows={15} value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} />
          <div className={`small ${words > MAX_WORDS ? 'error' : 'muted'}`}>{t('ws.words', { n: words, max: MAX_WORDS })}</div>
          <div className="everyone-actions">
            <button className="btn" onClick={() => copy('text', text)}>{copied === 'text' ? `✓ ${t('ws.copied')}` : t('ws.copy')}</button>
            <button className="btn ghost" onClick={() => { setSeed((s) => s + 1); setEdited(false); }}>{t('ws.another')}</button>
            <button className="btn ghost" onClick={() => copy('prompt', claudePrompt(summary.facts.length ? summary.facts : facts.slice(0, 6)))}>{copied === 'prompt' ? `✓ ${t('ws.copied')}` : t('ws.prompt')}</button>
          </div>
          <p className="muted small">{t('ws.promptHint')}</p>

          <details>
            <summary>{t('ws.facts', { n: facts.length })}</summary>
            {facts.length === 0 ? <p className="muted small">{t('ws.noFacts')}</p> : <ul className="small">{facts.map((f, i) => <li key={i} dir="auto">{factLine(f)}</li>)}</ul>}
            <p className="muted small">{weekGames.length} {t('ws.gamesInWeek')}</p>
          </details>
        </>
      )}
    </div>
  );
}
