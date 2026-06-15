import React, { useState } from 'react'
import { createCampaign } from '../api'

export default function CampaignCreate({ token, onCreated }){
  const [name, setName] = useState('')
  const [type, setType] = useState('voice')
  const [message, setMessage] = useState('')
  const [voiceUrl, setVoiceUrl] = useState('')
  const [retry, setRetry] = useState(60)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [err, setErr] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function handleCreate(e){
    e.preventDefault()
    try {
      const res = await createCampaign(token, { name, type, message_text: message, voice_url: voiceUrl, retry_delay_minutes: retry, max_attempts: maxAttempts })
      onCreated(res.data.id)
    } catch (err) {
      setErr(err.message)
    }
  }

  async function handleFileUpload(e){
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await import('../api').then(m => m.uploadFile(token, file))
      setVoiceUrl(res.data.url)
    } catch (err) { setErr(err.message) }
    setUploading(false)
  }

  return (
    <form className="campaign-create" onSubmit={handleCreate}>
      <h3>Create Campaign</h3>
      <label>Name<input value={name} onChange={e=>setName(e.target.value)} /></label>
      <label>Type<select value={type} onChange={e=>setType(e.target.value)}><option value="voice">Voice</option><option value="sms">SMS</option></select></label>
      <label>Message<textarea value={message} onChange={e=>setMessage(e.target.value)} /></label>
      <label>Voice file (MP3) <input type="file" accept="audio/*" onChange={handleFileUpload} /></label>
      {uploading && <div>Uploading...</div>}
      <label>Voice URL<input value={voiceUrl} onChange={e=>setVoiceUrl(e.target.value)} placeholder="or paste a public URL" /></label>
      <label>Retry Delay (minutes)<input type="number" value={retry} onChange={e=>setRetry(e.target.value)} /></label>
      <label>Max Attempts<input type="number" value={maxAttempts} onChange={e=>setMaxAttempts(e.target.value)} /></label>
      <button type="submit">Create</button>
      {err && <div className="error">{err}</div>}
    </form>
  )
}
