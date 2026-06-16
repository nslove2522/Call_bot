import React, { useState, useEffect } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import logo from './assets/logo.svg'
import gasBg from './assets/gas-bg.svg'

export default function App(){
  const [token, setToken] = useState(() => {
    try {
      const t = localStorage.getItem('authToken')
      return t ? JSON.parse(t) : null
    } catch (e) { return null }
  })

  useEffect(() => {
    // keep localStorage in sync when token changes
    if (token) localStorage.setItem('authToken', JSON.stringify(token))
    else localStorage.removeItem('authToken')
  }, [token])

  function handleLogout(){
    setToken(null)
  }

  return (
    <div>
      {
        (() => {
          // allow overriding the header logo via VITE_LOGO_URL env variable (useful to swap with real image)
          const logoUrl = import.meta.env.VITE_LOGO_URL || logo;
          const bgUrl = import.meta.env.VITE_BG_URL || gasBg;
          return (
            <div className="app-root" style={{ ['--bg-url']: `url(${bgUrl})` }}>
              <div className="global-header"><img src={logoUrl} className="global-logo" alt="VADIVEL"/><span>VADIVEL INDANE GAS AGENCY</span></div>
              {!token ? <Login onLogin={(t) => setToken(t)} /> : <Dashboard token={token} onLogout={handleLogout} />}
            </div>
          )
          })()
        }
      </div>
  )
}
