import React, { useEffect, useState } from 'react';
import { authLinkError, resetPassword, signIn, signUp, updatePassword } from '../utils/supabase';
import { Segmented } from './ui';
import Logo from './Logo';

export function Splash() {
  const [phase, setPhase] = useState('in'); // in | out | gone
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('out'), 1100);
    const t2 = setTimeout(() => setPhase('gone'), 1550);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (phase === 'gone') return null;
  return (
    <div className={`splash${phase === 'out' ? ' out' : ''}`} aria-hidden="true">
      <Logo size={96} />
      <b>Dexup</b>
    </div>
  );
}

// Messages de Supabase les plus courants, en français.
function frError(error) {
  const m = error?.message || '';
  const wait = m.match(/after (\d+) seconds?/);
  if (wait) return `Patiente ${wait[1]} secondes avant de redemander un lien.`;
  if (/rate limit/i.test(m)) return 'Trop de demandes : réessaie dans quelques minutes.';
  if (/different from the old/i.test(m)) return 'Choisis un mot de passe différent de l\'ancien.';
  if (/invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/at least 6/i.test(m)) return 'Mot de passe trop court (6 caractères minimum).';
  return m || 'Une erreur est survenue.';
}

const LINK_ERRORS = {
  otp_expired: 'Ce lien a expiré ou a déjà servi. Redemande-en un nouveau.',
};

export default function Auth() {
  const [tab, setTab] = useState('login');
  const [forgot, setForgot] = useState(!!authLinkError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(authLinkError ? { err: LINK_ERRORS[authLinkError] || 'Ce lien n\'est plus valable. Redemande-en un nouveau.' } : null);

  const isLogin = tab === 'login';

  useEffect(() => {
    // Lien expiré : on retire l'erreur de l'adresse pour qu'elle ne réapparaisse pas.
    if (authLinkError) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const sendReset = async (e) => {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    setMsg(error ? { err: frError(error) } : { ok: 'Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe.' });
  };

  if (forgot) {
    return (
      <div className="auth">
        <div className="auth-hero">
          <Logo size={64} />
          <h1>Mot de passe<br /><mark>oublié</mark></h1>
        </div>
        <form className="auth-card" onSubmit={sendReset}>
          <p className="small muted">Entre l'email de ton compte : on t'envoie un lien pour choisir un nouveau mot de passe.</p>
          <div>
            <label className="label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email" className="input" type="email" placeholder="ton@email.com"
              autoCapitalize="none" autoComplete="email" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {msg?.err && <p className="msg msg-err" role="alert">{msg.err}</p>}
          {msg?.ok && <p className="msg msg-ok" role="status">{msg.ok}</p>}
          <button className="btn btn-dark btn-block" type="submit" disabled={busy || !email}>
            {busy ? <div className="spinner sm" /> : msg?.ok ? 'Renvoyer le lien' : 'Envoyer le lien'}
          </button>
          <button type="button" className="link auth-link" onClick={() => { setForgot(false); setMsg(null); }}>Retour à la connexion</button>
        </form>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    if (!isLogin) {
      if (password !== confirm) { setMsg({ err: 'Les mots de passe ne correspondent pas.' }); return; }
      if (password.length < 6) { setMsg({ err: 'Mot de passe trop court (6 caractères minimum).' }); return; }
    }
    setBusy(true);
    setMsg(null);
    // Connexion réussie : App bascule tout seul via onAuthStateChange.
    const { error } = isLogin ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) { setMsg({ err: frError(error) }); return; }
    if (!isLogin) {
      setMsg({ ok: 'Compte créé ! Connecte-toi maintenant.' });
      setTab('login');
      setPassword('');
      setConfirm('');
    }
  };

  return (
    <div className="auth">
      <div className="auth-hero">
        <Logo size={64} />
        <h1>Toute ta collection<br />au <mark>même endroit</mark></h1>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <Segmented
          value={tab} onChange={(t) => { setTab(t); setMsg(null); }}
          options={[{ value: 'login', label: 'Se connecter' }, { value: 'register', label: 'Créer un compte' }]}
        />

        <div>
          <label className="label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email" className="input" type="email" placeholder="ton@email.com"
            autoCapitalize="none" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="auth-password">Mot de passe</label>
          <input
            id="auth-password" className="input" type="password" placeholder="••••••••"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {!isLogin && (
          <div>
            <label className="label" htmlFor="auth-confirm">Confirmer le mot de passe</label>
            <input
              id="auth-confirm" className="input" type="password" placeholder="••••••••" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        )}

        {isLogin && (
          <button type="button" className="link auth-link auth-forgot" onClick={() => { setForgot(true); setMsg(null); }}>
            Mot de passe oublié
          </button>
        )}

        {msg?.err && <p className="msg msg-err" role="alert">{msg.err}</p>}
        {msg?.ok && <p className="msg msg-ok" role="status">{msg.ok}</p>}

        <button className="btn btn-dark btn-block" type="submit" disabled={busy || !email || !password}>
          {busy ? <div className="spinner sm" /> : isLogin ? 'Se connecter' : 'Créer mon compte'}
        </button>
        <p className="tiny dim" style={{ textAlign: 'center' }}>Ta collection est synchronisée sur tous tes appareils.</p>
      </form>
    </div>
  );
}

/** Après le lien reçu par email : choix du nouveau mot de passe (le compte est déjà connecté). */
export function NewPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) { setMsg({ err: 'Mot de passe trop court (6 caractères minimum).' }); return; }
    if (password !== confirm) { setMsg({ err: 'Les mots de passe ne correspondent pas.' }); return; }
    setBusy(true);
    setMsg(null);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) setMsg({ err: frError(error) }); else setMsg({ ok: true });
  };

  return (
    <div className="auth">
      <div className="auth-hero">
        <Logo size={64} />
        <h1>Nouveau<br /><mark>mot de passe</mark></h1>
      </div>
      {msg?.ok ? (
        <div className="auth-card">
          <p className="msg msg-ok" role="status">Mot de passe changé. Tu es connecté.</p>
          <button className="btn btn-dark btn-block" onClick={onDone}>Ouvrir ma collection</button>
        </div>
      ) : (
        <form className="auth-card" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="new-password">Nouveau mot de passe</label>
            <input
              id="new-password" className="input" type="password" placeholder="••••••••" autoComplete="new-password" autoFocus
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="new-confirm">Confirmer le mot de passe</label>
            <input
              id="new-confirm" className="input" type="password" placeholder="••••••••" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {msg?.err && <p className="msg msg-err" role="alert">{msg.err}</p>}
          <button className="btn btn-dark btn-block" type="submit" disabled={busy || !password || !confirm}>
            {busy ? <div className="spinner sm" /> : 'Enregistrer'}
          </button>
          <button type="button" className="link auth-link" onClick={onDone}>Plus tard</button>
        </form>
      )}
    </div>
  );
}
