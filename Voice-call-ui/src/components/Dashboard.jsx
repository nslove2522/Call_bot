import React, { useState, useEffect } from 'react'
import CampaignCreate from './CampaignCreate'
import CampaignView from './CampaignView'
import { getStatus } from '../api'

export default function Dashboard({ token, onLogout }){
  const [campaignId, setCampaignId] = useState(() => {
    try { const v = localStorage.getItem('currentCampaignId'); return v ? JSON.parse(v) : null } catch(e){ return null }
  })
  const [campaigns, setCampaigns] = useState([])

  useEffect(()=>{
    // minimal: list campaigns by fetching status for id 1..10 - Not implemented server list endpoint yet
  },[])

  useEffect(()=>{
    try { if (campaignId) localStorage.setItem('currentCampaignId', JSON.stringify(campaignId)); else localStorage.removeItem('currentCampaignId') } catch(e){}
  }, [campaignId])

  return (
    <div className="dashboard">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Campaigns</h2>
        <div>
          <button onClick={() => { onLogout(); localStorage.removeItem('currentCampaignId') }}>Logout</button>
        </div>
      </div>
      {campaignId ? (
        <CampaignView token={token} id={campaignId} onBack={()=>setCampaignId(null)} />
      ) : (
        <>
          <CampaignCreate token={token} onCreated={id=>setCampaignId(id)} />
          <div className="campaigns-list">
            <p>Open a campaign by ID (created campaign ID will be returned):</p>
            <ul>
              {campaigns.map(c=> <li key={c.id}>{c.name}</li>)}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
