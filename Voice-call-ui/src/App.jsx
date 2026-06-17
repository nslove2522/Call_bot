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
    try {
      if (token) localStorage.setItem('authToken', JSON.stringify(token));
      else localStorage.removeItem('authToken');
    } catch (error) {
      // ignore localStorage failures
    }
  }, [token]);

  const logoUrl = import.meta.env.VITE_LOGO_URL || logo;
  const bgUrl = import.meta.env.VITE_BG_URL || gasBg;

  return (
    <div className="app-shell" style={{ backgroundImage: bgUrl ? `linear-gradient(135deg, rgba(15,23,42,0.92), rgba(127,29,29,0.82)), url(${bgUrl})` : undefined }}>
      <header className="app-topbar">
        <div className="brand-lockup">
          {logoUrl && <img src={logoUrl} alt="Agency logo" className="brand-logo" />}
          <div>
            <div className="eyebrow">Voice Campaign Console</div>
            <h1>VADIVEL INDANE GAS AGENCY</h1>
          </div>
        </div>
        {token && <button className="ghost-button" type="button" onClick={() => setToken(null)}>Logout</button>}
      </header>

      <main className="app-main">
        {!token ? <Login onLogin={setToken} /> : <Dashboard token={token} onLogout={() => setToken(null)} />}
      </main>
    </div>
  );
}
