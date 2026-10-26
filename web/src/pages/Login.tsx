import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Logo } from '../components/Logo';
import { TextField } from '../components/ui';
import { api } from '../lib/api';

export const Login = ({ onDone }: { onDone: () => void }) => {
  const [password, setPassword] = useState('');
  const login = useMutation({ mutationFn: () => api('POST', '/api/login', { password }), onSuccess: onDone });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    login.mutate();
  };
  return (
    <div className="center-screen top">
      <form className="wizard" onSubmit={submit} style={{ maxWidth: 400 }}>
        <Logo size={44} />
        <h1 className="t-title">Sign in</h1>
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {login.error && <div className="banner" role="alert">{login.error.message}</div>}
        <button className="btn" disabled={!password || login.isPending}>Continue</button>
        <a className="t-cap" href="/about">What is Cadence?</a>
      </form>
    </div>
  );
};
