import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false); // from custom claim ONLY, never from users.isAdmin
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    if (u) {
      try {
        let claims = (await u.getIdTokenResult()).claims;
        if (claims.admin !== true && !(await getDoc(doc(db, 'users', u.uid))).exists()) {
          // Admin bootstrap: server grants claim + profile only if email is in ADMIN_EMAILS; otherwise it rejects (ignored).
          try { await httpsCallable(functions, 'ensureProfile')(); claims = (await u.getIdTokenResult(true)).claims; } catch { /* not an admin email */ }
        }
        setIsAdmin(claims.admin === true);
      } catch { setIsAdmin(false); }
    } else {
      setIsAdmin(false);
    }
    setLoading(false);
  }), []);

  const login = useCallback((email, password) => signInWithEmailAndPassword(auth, email, password), []);
  const loginGoogle = useCallback(() => signInWithPopup(auth, new GoogleAuthProvider()), []);
  const logout = useCallback(() => signOut(auth), []);

  const value = useMemo(() => ({ user, isAdmin, loading, login, loginGoogle, logout }), [user, isAdmin, loading, login, loginGoogle, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
