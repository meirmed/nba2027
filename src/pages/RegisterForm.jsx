import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { normalizePhone } from '@shared/phone.js';
import { parseFullName } from '@shared/names.js';

export default function RegisterForm({ onBack }) {
  const { t } = useLang();
  const { login, loginGoogle } = useAuth();
  const [open, setOpen] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
    if (!email) return;
    if (!parseFullName(firstName, lastName)) { setErr(t('auth.errName')); return; }
    if (!normalizePhone(phone)) { setErr(t('auth.errPhone')); return; }
    if (!google && password.length < 6) { setErr(t('auth.passwordMin')); return; }
    setBusy(true);
    try {
      await httpsCallable(functions, 'registerParticipant')({ firstName, lastName, email, phone, password: google ? null : password });
      if (google) await loginGoogle(); else await login(email, password);
    } catch (e) {
      const code = e?.code || '';
      if (code.includes('already-exists')) setErr(t('auth.errExists'));
      else if (code.includes('permission-denied')) setErr(t('auth.errTaken'));
      else if (code.includes('aborted')) setErr(t('auth.errBusy'));
      else if (code.includes('invalid-argument') && String(e.message).includes('phone')) setErr(t('auth.errPhone'));
      else if (code.includes('invalid-argument') && String(e.message).includes('name')) setErr(t('auth.errName'));
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
          <div className="grid-form">
            <label className="field">{t('auth.firstName')}
              <input className="input" dir="auto" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
            <label className="field">{t('auth.lastName')}
              <input className="input" dir="auto" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          </div>
          <small className="muted">{t('auth.nameRules')}</small>
          <input className="input" dir="ltr" type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" dir="ltr" type="tel" autoComplete="tel" inputMode="tel" placeholder={t('auth.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label className="check"><input type="checkbox" checked={google} onChange={(e) => setGoogle(e.target.checked)} /> {t('auth.useGoogle')}</label>
          {google
            ? <p className="muted">{t('auth.googleHint')}</p>
            : <input className="input" dir="ltr" type="password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} />}
          <button className="btn" disabled={busy || !firstName.trim() || !lastName.trim() || !email || !phone.trim()} onClick={submit}>{t('auth.createAccount')}</button>
        </>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn ghost" onClick={onBack}>{t('auth.backToLogin')}</button>
    </div>
  );
}
