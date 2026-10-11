import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { normalizePhone } from '@shared/phone.js';

export default function RegisterForm({ onBack }) {
  const { t } = useLang();
  const { login, loginGoogle } = useAuth();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [google, setGoogle] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    httpsCallable(functions, 'registrationStatus')().then((r) => setOpen(r.data.open)).catch(() => {});
  }, []);

  const submit = async () => {
    setErr('');
    if (!name.trim() || !email) return;
    if (!normalizePhone(phone)) { setErr(t('auth.errPhone')); return; }
    if (!google && password.length < 6) { setErr(t('auth.passwordMin')); return; }
    setBusy(true);
    try {
      await httpsCallable(functions, 'registerParticipant')({ name, email, phone, password: google ? null : password });
      if (google) await loginGoogle(); else await login(email, password);
    } catch (e) {
      const code = e?.code || '';
      if (code.includes('not-found')) setErr(t('auth.errNotListed'));
      else if (code.includes('already-exists')) setErr(t('auth.errExists'));
      else if (code.includes('permission-denied')) setErr(t('auth.errTaken'));
      else if (code.includes('aborted')) setErr(t('auth.errBusy'));
      else if (code.includes('invalid-argument') && String(e.message).includes('phone')) setErr(t('auth.errPhone'));
      else if (code.includes('failed-precondition')) setErr(t('auth.registrationClosed'));
      else setErr(t('auth.errGeneric'));
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{t('auth.createAccount')}</h2>
      {!open && <p className="error">{t('auth.registrationClosed')}</p>}
      {open && (
        <>
          <label className="field">{t('auth.enterName')}
            <input className="input" dir="auto" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            <small className="muted">{t('auth.nameHint')}</small>
          </label>
          <input className="input" dir="ltr" type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" dir="ltr" type="tel" autoComplete="tel" inputMode="tel" placeholder={t('auth.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label className="check"><input type="checkbox" checked={google} onChange={(e) => setGoogle(e.target.checked)} /> {t('auth.useGoogle')}</label>
          {google
            ? <p className="muted">{t('auth.googleHint')}</p>
            : <input className="input" dir="ltr" type="password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} />}
          <button className="btn" disabled={busy || !name.trim() || !email || !phone.trim()} onClick={submit}>{t('auth.createAccount')}</button>
        </>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn ghost" onClick={onBack}>{t('auth.backToLogin')}</button>
    </div>
  );
}
