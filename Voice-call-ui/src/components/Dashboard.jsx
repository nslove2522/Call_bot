import React, { useEffect, useState } from 'react';
import CampaignCreate from './CampaignCreate';
import CampaignView from './CampaignView';

export default function Dashboard({ token }) {
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

  return (
    <section className="workspace-shell">
      <div className="workspace-header">
        <div>
          <div className="eyebrow">Campaigns</div>
          <h2>{campaignId ? `Campaign #${campaignId}` : 'Create a voice campaign'}</h2>
          <p className="muted">Upload recipients, start calls, and track delivery results with clearer status diagnostics.</p>
        </div>
        {campaignId && (
          <button className="secondary-button" type="button" onClick={() => setCampaignId(null)}>
            Back to create
          </button>
        )}
      </div>

      {campaignId ? (
        <CampaignView token={token} id={campaignId} />
      ) : (
        <div className="dashboard-grid">
          <CampaignCreate token={token} onCreated={(id) => setCampaignId(id)} />

          <aside className="premium-card helper-card">
            <div className="card-kicker">Open existing</div>
            <h3>Jump to campaign</h3>
            <p className="muted">Use this if you already created a campaign and know its ID.</p>
            <label className="field">
              <span>Campaign ID</span>
              <input
                type="number"
                min="1"
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                placeholder="Example: 2"
              />
            </label>
            <button className="secondary-button full" type="button" onClick={() => manualId && setCampaignId(Number(manualId))} disabled={!manualId}>
              Open campaign
            </button>

            <div className="callout">
              <strong>Call format tip</strong>
              <span>For Plivo, use E.164 phone numbers like +918056593498. The plus sign matters more than it should, because telephony enjoys tiny rituals.</span>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
