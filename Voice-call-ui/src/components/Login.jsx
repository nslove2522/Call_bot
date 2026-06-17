import React, { useState } from 'react';
import { authToken, checkAuth, getApiBase } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = authToken(username.trim(), password);
      await checkAuth(token);
      localStorage.setItem('authToken', JSON.stringify(token));
      if (typeof onLogin === 'function') onLogin(token);
    } catch (err) {
      localStorage.removeItem('authToken');
      const detail = err?.response?.status === 401
        ? 'Username or password does not match Render ADMIN_USER / ADMIN_PASS.'
        : err?.message || 'Unable to reach backend.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="center-stage">
      <form className="premium-card login-card" onSubmit={handleSubmit}>
        <div className="card-kicker">Admin access</div>
        <h2>Sign in to campaign console</h2>
        <p className="muted">Manage voice and SMS campaigns from the deployed Render backend.</p>

        <div className="info-strip">
          <span>Backend</span>
          <strong>{getApiBase()}</strong>
        </div>

        {error && <div className="alert error-alert">{error}</div>}

        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="admin"
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter Render ADMIN_PASS"
            required
          />
        </label>

        <button className="primary-button full" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </section>
  );
}
