import React, { useState } from 'react';
import { authToken, checkAuth, getApiBase } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = authToken(username, password);
      await checkAuth(token);
      onLogin(token);
    } catch (err) {
      setError(err?.response?.status === 401 ? 'Invalid admin username or password.' : `Login failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div className="brand-mark">◆</div>
        <p>Voice Campaign Console</p>
        <h1>Vadivel Indane Gas Agency</h1>
        <span>Backend: {getApiBase()}</span>
      </div>

      <form className="login-card glass-card" onSubmit={submit}>
        <span className="eyebrow">Secure admin access</span>
        <h2>Sign in</h2>
        <p className="muted">Manage voice and SMS campaigns from one polished little command center.</p>

        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />

        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

        {error && <div className="alert danger">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={loading} type="submit">
          {loading ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
