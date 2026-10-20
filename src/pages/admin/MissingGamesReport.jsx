import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { gameLabel, gamesReminderMessage, gamesSummaryLine } from '@shared/gamesMissing.js';

/** Admin: who has not predicted the games of the next N days (default 3). Run on demand. Copy a reminder per player or the whole list. */
export default function MissingGamesReport() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const [days, setDays] = useState(3);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState('');

  const run = async () => {
    setBusy(true); setMsg('');
    try { setData((await httpsCallable(functions, 'gamesMissingReport')({ days })).data); } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };
  const copy = async (text, id) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1600); } catch { setMsg(t('bm.copyFail')); }
  };
  const url = `${window.location.origin}/predictions?tab=week`;
  const when = (ms) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(ms);

  return (
    <div>
      <p className="muted small">{t('gm.hint')}</p>
      <div className="actions">
        <label className="field">{t('gm.days')}
          <select className="input" value={days} onChange={(e) => { setDays(Number(e.target.value)); setData(null); }}>
            {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d}</option>)}
          </select></label>
        <button className="btn" disabled={busy} onClick={run}>{busy ? t('common.loading') : t('bm.run')}</button>
        <span className="muted">{msg}</span>
      </div>

      {data && data.gameCount === 0 && <p className="muted">{t('gm.noGames', { d: data.days })}</p>}
      {data && data.gameCount > 0 && data.players.length === 0 && <p className="save-ok">{t('gm.none', { d: data.days })}</p>}
      {data && data.players.length > 0 && (
        <>
          <p><strong>{t('gm.summary', { n: data.players.length, total: data.playerCount, g: data.gameCount, d: data.days })}</strong></p>
          <div className="actions">
            <button className="btn ghost" onClick={() => copy(data.players.map((p) => gamesSummaryLine(p, lang, timezone)).join('\n'), 'all')}>{copied === 'all' ? t('bm.copied') : t('bm.copyList')}</button>
          </div>
          {data.players.map((p) => (
            <div key={p.uid} className="card">
              <div className="inline">
                <strong dir="auto">{p.name}</strong>
                <span className="badge">{t('bm.missingCount', { n: p.missing.length })}</span>
                <span className="muted small">{t('gm.predictedOf', { a: p.predicted, q: data.gameCount })}</span>
              </div>
              <div className="muted small" dir="ltr">{[p.phone, p.email].filter(Boolean).join(' · ')}</div>
              <ol className="small">
                {p.missing.map((g) => <li key={g.id} dir="auto">{gameLabel(g, lang)} <span className="muted">· {when(g.tipoffMs)}</span></li>)}
              </ol>
              <div className="actions"><button className="btn ghost" onClick={() => copy(gamesReminderMessage({ name: p.name, lang: p.lang, missing: p.missing, url, timezone, days: data.days }), p.uid)}>{copied === p.uid ? t('bm.copied') : t('bm.copyMsg')}</button></div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
