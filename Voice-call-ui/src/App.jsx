import React, { useState, useEffect } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import logo from './assets/logo.svg'

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
      <div className="global-header"><img src={logo} className="global-logo" alt="VADIVEL"/><span>VADIVEL INDANE GAS AGENCY</span></div>
      {!token ? <Login onLogin={(t) => setToken(t)} /> : <Dashboard token={token} onLogout={handleLogout} />}
    </div>
  )
}
