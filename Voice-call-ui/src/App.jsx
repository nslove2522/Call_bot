import React, { useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import logo from './assets/logo.svg';
import gasBg from './assets/gas-bg.svg';

export default function App() {
  const [token, setToken] = useState(() => {
    try {
      const value = localStorage.getItem('authToken');
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  });

  useEffect(() => {
    if (token) localStorage.setItem('authToken', JSON.stringify(token));
    else localStorage.removeItem('authToken');
  }, [token]);

  function handleLogout() {
    setToken(null);
  }

  const logoUrl = import.meta.env.VITE_LOGO_URL || logo;
  const bgUrl = import.meta.env.VITE_BG_URL || gasBg;

  return (
    <div className="app" style={{ backgroundImage: bgUrl ? `url(${bgUrl})` : undefined }}>
      <header className="topbar">
        {logoUrl && <img src={logoUrl} alt="Agency logo" className="logo" />}
        <h1>VADIVEL INDANE GAS AGENCY</h1>
      </header>

      <main>
        {!token ? <Login onLogin={setToken} /> : <Dashboard token={token} onLogout={handleLogout} />}
      </main>
    </div>
  );
}
