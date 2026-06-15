import React, { useState, useEffect } from 'react'
import CampaignCreate from './CampaignCreate'
import CampaignView from './CampaignView'
import { getStatus } from '../api'

export default function Dashboard({ token }){
  const [campaignId, setCampaignId] = useState(null)
  const [campaigns, setCampaigns] = useState([])

  useEffect(()=>{
    // minimal: list campaigns by fetching status for id 1..10 - Not implemented server list endpoint yet
  },[])

  if (campaignId) return <CampaignView token={token} id={campaignId} onBack={()=>setCampaignId(null)} />
  return (
    <div className="dashboard">
      <h2>Campaigns</h2>
      <CampaignCreate token={token} onCreated={id=>setCampaignId(id)} />
      <div className="campaigns-list">
        <p>Open a campaign by ID (created campaign ID will be returned):</p>
        <ul>
          {campaigns.map(c=> <li key={c.id}>{c.name}</li>)}
        </ul>
      </div>
    </div>
  )
}
