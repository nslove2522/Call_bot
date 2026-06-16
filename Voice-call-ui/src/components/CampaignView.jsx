import React, { useState, useEffect } from 'react'
import { getStatus, startCampaign, exportCsv } from '../api'
import UploadRecipients from './UploadRecipients'

export default function CampaignView({ token, id, onBack }){
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load(){
    setLoading(true)
    const res = await getStatus(token, id)
    setStatus(res.data)
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])

  async function handleStart(){
    await startCampaign(token, id)
    setTimeout(load, 2000)
  }

  async function handleExport(){
    const blob = (await exportCsv(token, id)).data
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign_${id}.csv`
    a.click()
  }

  return (
    <div>
      <button onClick={onBack}>Back</button>
      <h3>Campaign {id}</h3>
      <UploadRecipients token={token} campaignId={id} onUploaded={()=>load()} />
      <div>
        <button onClick={handleStart}>Start Campaign</button>
        <button onClick={handleExport}>Export CSV</button>
      </div>
      {loading && <div>Loading...</div>}
      {status && (
        <div>
          <h4>Campaign</h4>
          <pre>{JSON.stringify(status.campaign,null,2)}</pre>
          <h4>Recipients</h4>
          <table>
            <thead><tr><th>Phone</th><th>Status</th><th>Attempts</th><th>Last</th></tr></thead>
            <tbody>
              {status.recipients.map(r=> {
                // SQLite `CURRENT_TIMESTAMP` is stored as UTC (YYYY-MM-DD HH:MM:SS).
                // Convert to local timezone for display by appending 'Z' to treat as UTC.
                let last = r.last_attempt_at || '';
                try {
                  if (last) {
                    // if already ISO/Z, parse directly, otherwise treat stored UTC like 'YYYY-MM-DD HH:MM:SS' and append 'Z'
                    last = new Date(last.endsWith('Z') || last.includes('T') ? last : (last + 'Z')).toLocaleString();
                  }
                } catch (e) { /* leave as-is on parse error */ }
                return (
                  <tr key={r.id}><td>{r.phone_number}</td><td>{r.status}</td><td>{r.attempts}</td><td>{last}</td></tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
