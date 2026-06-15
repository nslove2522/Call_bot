import React, { useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

export default function App(){
  const [token, setToken] = useState(null)
  if (!token) return <Login onLogin={(t) => setToken(t)} />
  return <Dashboard token={token} />
}
