import React, { useEffect, useState } from 'react';
import { exportCsv, getStatus, startCampaign } from '../api';
import UploadRecipients from './UploadRecipients';

function getResponseData(response) {
  return response && response.data ? response.data : response;
}

export default function CampaignView({ token, id, onBack }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const response = await getStatus(token, id);
      setStatus(getResponseData(response));
    } catch (error) {
      setMsg(error?.response?.data?.error || error.message || 'Failed to load campaign.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStart() {
    setMsg(null);
    try {
      const response = await startCampaign(token, id);
      const data = getResponseData(response);
      setMsg(`Started ${data.started || 0} pending recipient(s).`);
      setTimeout(load, 1200);
    } catch (error) {
      setMsg(error?.response?.data?.error || error.message || 'Start campaign failed.');
    }
  }

  async function handleExport() {
    try {
      const response = await exportCsv(token, id);
      const blob = response && response.data ? response.data : response;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign_${id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMsg(error?.response?.data?.error || error.message || 'Export failed.');
    }
  }

  const recipients = status?.recipients || [];

  return (
    <div className="card">
      <button type="button" onClick={onBack}>Back</button>
      <h3>Campaign {id}</h3>

      <UploadRecipients token={token} campaignId={id} onUploaded={load} />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={handleStart}>Start Campaign</button>
        <button type="button" onClick={handleExport}>Export CSV</button>
        <button type="button" onClick={load}>Refresh</button>
      </div>

      {loading && <div>Loading...</div>}
      {msg && <div>{msg}</div>}

      {status && (
        <>
          <h4>Campaign</h4>
          <pre>{JSON.stringify(status.campaign, null, 2)}</pre>

          <h4>Recipients</h4>
          {recipients.length === 0 ? (
            <p>No recipients uploaded yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Last Attempt</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td>{recipient.phone_number}</td>
                    <td>{recipient.status}</td>
                    <td>{recipient.attempts}</td>
                    <td>{recipient.last_attempt_at || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
