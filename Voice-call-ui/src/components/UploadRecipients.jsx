import React, { useState } from 'react'
import { uploadRecipients } from '../api'

export default function UploadRecipients({ token, campaignId, onUploaded }){
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState(null)

  async function handleUpload(e){
    e.preventDefault()
    if (!file) return setMsg('choose file')
    try {
      const res = await uploadRecipients(token, campaignId, file)
      setMsg(`Inserted ${res.data.inserted}`)
      if (onUploaded) onUploaded(res.data)
    } catch (err) { setMsg(err.message) }
  }

  return (
    <div className="upload">
      <h4>Upload Recipients (CSV)</h4>
      <form onSubmit={handleUpload}>
        <input type="file" accept=".csv" onChange={e=>setFile(e.target.files[0])} />
        <button type="submit">Upload</button>
      </form>
      {msg && <div className="msg">{msg}</div>}
    </div>
  )
}
