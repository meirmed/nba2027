import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { formatDateTime } from '../../utils/dates.js';
import { reminderMessage, summaryLine } from '@shared/bonusMissing.js';

/** Admin: who has not answered which bonus question. Run on demand (reads every player's answers once). Copy a reminder per player or the whole list. */
export default function MissingBonusReport() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const [includeClosed, setIncludeClosed] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState('');

  const run = async () => {
    setBusy(true); setMsg('');
    try { setData((await httpsCallable(functions, 'bonusMissingReport')({ includeClosed })).data); } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };
  const copy = async (text, id) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1600); } catch { setMsg(t('bm.copyFail')); }
  };
  const url = `${window.location.origin}/predictions?tab=bonus`;
  const qName = (q) => q[lang] || q.en || q.he;

  return (
    <div>
      <p className="muted small">{t('bm.hint')}</p>
      <div className="actions">
        <label className="check"><input type="checkbox" checked={includeClosed} onChange={(e) => { setIncludeClosed(e.target.checked); setData(null); }} /> {t('bm.includeClosed')}</label>
        <button className="btn" disabled={busy} onClick={run}>{busy ? t('common.loading') : t('bm.run')}</button>
        <span className="muted">{msg}</span>
      </div>

      {data && data.players.length === 0 && <p className="save-ok">{t('bm.none')}</p>}
      {data && data.players.length > 0 && (
        <>
          <p><strong>{t('bm.summary', { n: data.players.length, total: data.playerCount, q: data.questionCount })}</strong></p>
          <div className="actions">
            <button className="btn ghost" onClick={() => copy(data.players.map((p) => summaryLine(p, lang)).join('\n'), 'all')}>{copied === 'all' ? t('bm.copied') : t('bm.copyList')}</button>
          </div>
          {data.players.map((p) => {
            const reminder = reminderMessage({ name: p.name, lang: p.lang, missing: p.missing, url, timezone });
            return (
              <div key={p.uid} className="card">
                <div className="inline">
                  <strong dir="auto">{p.name}</strong>
                  <span className="badge">{t('bm.missingCount', { n: p.missing.length })}</span>
                  <span className="muted small">{t('bm.answeredOf', { a: p.answered, q: data.questionCount })}</span>
                </div>
                <div className="muted small" dir="ltr">{[p.phone, p.email].filter(Boolean).join(' · ')}</div>
                <ol className="small">
                  {p.missing.map((q) => (
                    <li key={q.id} dir="auto">{qName(q)}{q.closed ? <span className="muted"> · {t('bm.closedTag')}</span> : q.deadlineMs ? <span className="muted"> · {t('bm.deadline')}: {formatDateTime({ toDate: () => new Date(q.deadlineMs) }, lang, timezone)}</span> : null}</li>
                  ))}
                </ol>
                {reminder && <div className="actions"><button className="btn ghost" onClick={() => copy(reminder, p.uid)}>{copied === p.uid ? t('bm.copied') : t('bm.copyMsg')}</button></div>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
