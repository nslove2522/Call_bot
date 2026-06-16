import React, { useState } from 'react'
import { authHeader } from '../api'

export default function Login({ onLogin }){
  const [user, setUser] = useState('admin')
  const [pass, setPass] = useState('admin')
  const [err, setErr] = useState(null)

  function handleLogin(e){
    e.preventDefault()
    const h = authHeader(user, pass)
    // simple test call
    fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3001'}/`, { headers: h }).then(r => {
      if (r.ok) onLogin(h)
      else setErr('auth failed')
    }).catch(e => setErr(e.message))
  }

  return (
    <div className="login">
      <h2>Admin Login</h2>
      <form onSubmit={handleLogin}>
        <label>Username<input value={user} onChange={e=>setUser(e.target.value)} /></label>
        <label>Password<input type="password" value={pass} onChange={e=>setPass(e.target.value)} /></label>
        <button type="submit">Login</button>
      </form>
      {err && <div className="error">{err}</div>}
    </div>
  )
}
