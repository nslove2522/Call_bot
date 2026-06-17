import React, { useEffect, useState } from 'react';
import CampaignCreate from './CampaignCreate';
import CampaignView from './CampaignView';

export default function Dashboard({ token, onLogout }) {
  const [campaignId, setCampaignId] = useState(() => {
    try {
      const value = localStorage.getItem('currentCampaignId');
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  });
  const [manualId, setManualId] = useState('');

  useEffect(() => {
    try {
      if (campaignId) localStorage.setItem('currentCampaignId', JSON.stringify(campaignId));
      else localStorage.removeItem('currentCampaignId');
    } catch (error) {
      // ignore localStorage failures
    }
  }, [campaignId]);

  function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentCampaignId');
    if (typeof onLogout === 'function') onLogout();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Campaigns</h2>
        <button type="button" onClick={logout}>Logout</button>
      </div>

      {campaignId ? (
        <CampaignView token={token} id={campaignId} onBack={() => setCampaignId(null)} />
      ) : (
        <>
          <CampaignCreate token={token} onCreated={(id) => setCampaignId(id)} />

          <div style={{ marginTop: 16 }}>
            <label>
              Open a campaign by ID
              <input
                type="number"
                min="1"
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                placeholder="Campaign ID"
              />
            </label>
            <button
              type="button"
              onClick={() => manualId && setCampaignId(Number(manualId))}
              disabled={!manualId}
            >
              Open
            </button>
          </div>
        </>
      )}
    </div>
  );
}
