import React, { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import './styles.css';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || '');

  function handleLogin(nextToken) {
    localStorage.setItem('authToken', nextToken);
    setToken(nextToken);
  }

  function handleLogout() {
    localStorage.removeItem('authToken');
    setToken('');
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard authToken={token} onLogout={handleLogout} />;
}
