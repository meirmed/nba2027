import { useEffect, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { addAudit } from '../../utils/audit.js';
import { GAME_ROUNDS } from '@shared/constants.js';

// The ONLY editor of registrationOpen / seasonStarted / announcement. (Scoring has its own panel in Phase 3.)
export default function AdminSettingsPanel() {
  const { t } = useLang();
  const { user } = useAuth();
  const s = useSettings();
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (s.ready && form === null) {
      setForm({ registrationOpen: !!s.registrationOpen, seasonStarted: !!s.seasonStarted, annHe: s.announcement?.he ?? '', annEn: s.announcement?.en ?? '', countedRounds: [...(s.countedRounds || [])], autoFill: s.features?.autoFill !== false });
    }
  }, [s, form]);

  if (!form) return <PageShell titleKey="admin.settings"><p className="muted">{t('common.loading')}</p></PageShell>;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setMsg('');
    try {
      const after = { registrationOpen: form.registrationOpen, seasonStarted: form.seasonStarted, announcement: { he: form.annHe, en: form.annEn }, countedRounds: form.countedRounds, features: { autoFill: form.autoFill } };
      const batch = writeBatch(db);
      batch.set(doc(db, 'appSettings', 'main'), { ...after, updatedAt: serverTimestamp() }, { merge: true });
      addAudit(batch, user.uid, { action: 'settings.update', target: 'appSettings/main', before: { registrationOpen: s.registrationOpen, seasonStarted: s.seasonStarted, announcement: s.announcement, countedRounds: s.countedRounds, features: s.features }, after });
      await batch.commit();
      setMsg(t('common.saved'));
    } catch { setMsg(t('common.error')); }
  };

  return (
    <PageShell titleKey="admin.settings">
      <div className="card">
        <label className="check"><input type="checkbox" checked={form.registrationOpen} onChange={(e) => set('registrationOpen', e.target.checked)} /> {t('as.registrationOpen')}</label>
        <label className="check"><input type="checkbox" checked={form.autoFill} onChange={(e) => set('autoFill', e.target.checked)} /> {t('as.autoFill')}</label>
        <label className="check"><input type="checkbox" checked={form.seasonStarted} onChange={(e) => set('seasonStarted', e.target.checked)} /> {t('as.seasonStarted')}</label>
        <div className="field">{t('as.countedRounds')}
          <div className="actions">
            {GAME_ROUNDS.map((r) => (
              <label key={r} className="check">
                <input type="checkbox" checked={form.countedRounds.includes(r)}
                  onChange={() => set('countedRounds', form.countedRounds.includes(r) ? form.countedRounds.filter((x) => x !== r) : [...form.countedRounds, r])} /> {t(`round.${r}`)}
              </label>
            ))}
          </div>
        </div>
        <label className="field">{t('as.announcementHe')}<textarea className="input" rows={2} value={form.annHe} onChange={(e) => set('annHe', e.target.value)} /></label>
        <label className="field">{t('as.announcementEn')}<textarea className="input" dir="ltr" rows={2} value={form.annEn} onChange={(e) => set('annEn', e.target.value)} /></label>
        <div className="actions"><button className="btn" onClick={save}>{t('common.save')}</button><span className="muted">{msg}</span></div>
      </div>
    </PageShell>
  );
}
