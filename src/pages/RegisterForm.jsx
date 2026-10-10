import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function RegisterForm({ onBack }) {
  const { t } = useLang();
  const { login, loginGoogle } = useAuth();
  const [list, setList] = useState(null); // null = loading
  const [open, setOpen] = useState(true);
  const [pid, setPid] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [google, setGoogle] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    httpsCallable(functions, 'listOpenParticipants')()
      .then((r) => { setOpen(r.data.open); setList(r.data.participants); })
      .catch(() => { setList([]); });
  }, []);

  const submit = async () => {
    setErr('');
    if (!pid || !email) return;
    if (!google && password.length < 6) { setErr(t('auth.passwordMin')); return; }
    setBusy(true);
    try {
      await httpsCallable(functions, 'registerParticipant')({ participantId: pid, email, password: google ? null : password });
      if (google) await loginGoogle(); else await login(email, password);
    } catch (e) {
      const code = e?.code || '';
      if (code.includes('already-exists')) setErr(t('auth.errExists'));
      else if (code.includes('permission-denied') || code.includes('aborted')) setErr(t('auth.errTaken'));
      else if (code.includes('failed-precondition')) setErr(t('auth.registrationClosed'));
      else setErr(t('auth.errGeneric'));
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{t('auth.createAccount')}</h2>
      {list === null && <p className="muted">{t('common.loading')}</p>}
      {list !== null && !open && <p className="error">{t('auth.registrationClosed')}</p>}
      {list !== null && open && list.length === 0 && <p className="muted">{t('auth.noNames')}</p>}
      {list !== null && open && list.length > 0 && (
        <>
          <label className="field">{t('auth.pickName')}
            <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="" />
              {list.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </label>
          <input className="input" dir="ltr" type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="check"><input type="checkbox" checked={google} onChange={(e) => setGoogle(e.target.checked)} /> {t('auth.useGoogle')}</label>
          {google
            ? <p className="muted">{t('auth.googleHint')}</p>
            : <input className="input" dir="ltr" type="password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} />}
          <button className="btn" disabled={busy || !pid || !email} onClick={submit}>{t('auth.createAccount')}</button>
        </>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn ghost" onClick={onBack}>{t('auth.backToLogin')}</button>
    </div>
  );
}
