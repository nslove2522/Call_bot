import React, { useState } from 'react';
import { authToken, checkAuth } from '../api';

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
      setError('Invalid username/password or backend CORS configuration. Check Render ADMIN_USER, ADMIN_PASS, and CORS_ORIGIN.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Admin Login</h2>
      <p>Sign in to manage voice and SMS campaigns.</p>

      {error && <div className="error">{error}</div>}

      <label>
        Username
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      <button type="submit" disabled={loading}>
        {loading ? 'Signing in...' : 'Login'}
      </button>
    </form>
  );
}
