import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase.js';
import PageShell from '../components/PageShell.jsx';
import Avatar from '../components/Avatar.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTeams } from '../contexts/TeamsContext.jsx';
import { normalizePhone } from '@shared/phone.js';

/** Centre-crop to a square and shrink to 256x256 JPEG (a few tens of KB; Storage rules allow < 300 KB). */
async function toAvatarBlob(file, size = 256) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

// The name is shown read-only (only the admin renames a player; the rules enforce it). The phone number is mandatory.
export default function ProfilePage() {
  const { t, lang, setLang } = useLang();
  const { user, isAdmin } = useAuth();
  const { teams } = useTeams();
  const [u, setU] = useState(undefined);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => (user ? onSnapshot(doc(db, 'users', user.uid), (s) => setU(s.exists() ? s.data() : null), () => setU(null)) : undefined), [user]);
  useEffect(() => { if (u && form === null) setForm({ team: u.team || '', phone: u.phone || '', lang: u.lang || lang }); }, [u, form, lang]);

  if (u === undefined || (u && !form)) return <PageShell titleKey="nav.profile"><p className="muted">{t('common.loading')}</p></PageShell>;
  if (u === null) return <PageShell titleKey="nav.profile"><p className="muted">{t('common.error')}</p></PageShell>;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const teamList = Object.values(teams).sort((a, b) => (a[lang] || a.en).localeCompare(b[lang] || b.en, lang));
  const userRef = doc(db, 'users', user.uid);

  const save = async () => {
    const phone = normalizePhone(form.phone);
    if (!phone && !(isAdmin && !form.phone.trim())) { setMsg(t('auth.errPhone')); return; } // the phone is mandatory for players only
    setBusy(true); setMsg('');
    try {
      await updateDoc(userRef, { team: form.team || null, phone: phone ?? '', lang: form.lang, updatedAt: serverTimestamp() });
      setLang(form.lang);
      setMsg(`✓ ${t('pf.saved')}`);
    } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(t('pf.uploading'));
    try {
      const blob = await toAvatarBlob(file);
      const r = storageRef(storage, `avatars/${user.uid}.jpg`);
      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(r);
      await updateDoc(userRef, { photoURL: `${url}&v=${Date.now()}`, updatedAt: serverTimestamp() });
      setMsg(`✓ ${t('pf.saved')}`);
    } catch (e) { console.error(e); setMsg(t('pf.avatarFailed')); }
    setBusy(false);
  };

  return (
    <PageShell titleKey="nav.profile">
      <div className="card">
        <div className="inline">
          <Avatar name={u.name} url={u.photoURL} size={64} />
          <div>
            <strong dir="auto">{u.name}</strong>
            <div className="muted small" dir="ltr">{u.email}</div>
          </div>
        </div>
        <div className="actions">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>{t('pf.upload')}</button>
        </div>

        <div className="grid-form">
          <label className="field">{t('pf.team')}
            <select className="input" dir="auto" value={form.team} onChange={(e) => set('team', e.target.value)}>
              <option value="">{t('pf.noTeam')}</option>
              {teamList.map((tm) => <option key={tm.abbr} value={tm.abbr}>{tm[lang] || tm.en}</option>)}
            </select></label>
          <label className="field">{t('pf.phone')}<input className="input" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label className="field">{t('pf.language')}
            <select className="input" value={form.lang} onChange={(e) => set('lang', e.target.value)}><option value="he">עברית</option><option value="en">English</option></select></label>
        </div>
        <div className="actions"><button className="btn" disabled={busy} onClick={save}>{t('common.save')}</button><span className={msg.startsWith('✓') ? 'save-ok' : 'muted'}>{msg}</span></div>
      </div>
    </PageShell>
  );
}
