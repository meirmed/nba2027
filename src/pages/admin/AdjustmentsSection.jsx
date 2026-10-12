import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useAdjustments } from '../../hooks/useAdjustments.js';
import { formatDateTime } from '../../utils/dates.js';

/** Admin: manual +/- points with a reason. Counted in the player's total; the player sees them (with the reason) in My Points. */
export default function AdjustmentsSection({ uid }) {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const rows = useAdjustments(uid);
  const [pts, setPts] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { console.error(e); setMsg(t('common.error')); } setBusy(false); };
  const add = () => run(async () => {
    const n = Number(pts);
    if (!Number.isFinite(n) || n === 0 || !reason.trim()) { setMsg(t('ah.err.invalid')); return; }
    await httpsCallable(functions, 'addAdjustment')({ uid, pts: n, reason });
    setPts(''); setReason('');
  });
  const remove = (a) => run(async () => { if (window.confirm(t('common.confirmDelete'))) await httpsCallable(functions, 'deleteAdjustment')({ id: a.id }); });

  return (
    <div className="card">
      <h3>{t('ad.title')}</h3>
      <div className="grid-form">
        <label className="field">{t('ad.pts')}<input className="input num wide" dir="ltr" inputMode="decimal" value={pts} onChange={(e) => setPts(e.target.value)} /></label>
        <label className="field">{t('ad.reason')}<input className="input" dir="auto" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </div>
      <div className="actions"><button className="btn" disabled={busy} onClick={add}>{t('ad.add')}</button><span className="muted">{msg}</span></div>
      {rows.length === 0 && <p className="muted small">{t('ad.empty')}</p>}
      {rows.map((a) => (
        <div key={a.id} className="row">
          <strong dir="ltr" className={a.pts > 0 ? 'save-ok' : 'error'}>{a.pts > 0 ? '+' : ''}{a.pts}</strong>
          <div className="grow"><span dir="auto">{a.reason}</span><div className="muted small">{a.ts ? formatDateTime(a.ts, lang, timezone) : ''}</div></div>
          <button className="btn ghost" disabled={busy} onClick={() => remove(a)}>{t('common.delete')}</button>
        </div>
      ))}
    </div>
  );
}
