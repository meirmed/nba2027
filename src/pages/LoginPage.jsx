import { useState } from 'react';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import RegisterForm from './RegisterForm.jsx';

export default function LoginPage() {
  const { t, lang, setLang } = useLang();
  const { login, loginGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('login');

  const run = async (fn) => { setErr(''); try { await fn(); } catch { setErr(t('auth.error')); } };

  if (mode === 'register') return <div className="login"><RegisterForm onBack={() => setMode('login')} /></div>;

  return (
    <div className="login">
      <div className="card">
        <h1>🏀 {t('app.name')}</h1>
        <input className="input" dir="ltr" type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" dir="ltr" type="password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn" onClick={() => run(() => login(email, password))}>{t('auth.login')}</button>
        <button className="btn ghost" onClick={() => run(loginGoogle)}>{t('auth.google')}</button>
        {err && <p className="error" role="alert">{err}</p>}
        <p className="muted">{t('auth.registerNote')}</p>
        <button className="btn ghost" onClick={() => setMode('register')}>{t('auth.createAccount')}</button>
        <button className="btn ghost" onClick={() => setLang(lang === 'he' ? 'en' : 'he')}>{t('common.language')}</button>
      </div>
    </div>
  );
}
