import React, { useEffect, useMemo, useState } from 'react';
import { exportCsv, getStatus, startCampaign } from '../api';
import UploadRecipients from './UploadRecipients';

function getResponseData(response) {
  return response && response.data ? response.data : response;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'sent'].includes(value)) return 'status-good';
  if (['failed', 'failed_permanent', 'busy', 'no-answer', 'cancelled', 'canceled'].includes(value)) return 'status-bad';
  if (['retry', 'pending'].includes(value)) return 'status-warn';
  return 'status-neutral';
}

function compactDetail(value) {
  if (!value) return 'No detail yet';
  try {
    const parsed = JSON.parse(value);
    return parsed.message || parsed.error || parsed.CallStatus || JSON.stringify(parsed);
  } catch (error) {
    return String(value);
  }
}

export default function CampaignView({ token, id }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [starting, setStarting] = useState(false);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const response = await getStatus(token, id);
      setStatus(getResponseData(response));
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.error || error.message || 'Failed to load campaign.' });
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
    setStarting(true);
    try {
      const response = await startCampaign(token, id);
      const data = getResponseData(response);
      setMsg({ type: 'success', text: `Started ${data.started || 0} pending recipient(s). Refreshing status...` });
      setTimeout(load, 1200);
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.error || error.message || 'Start campaign failed.' });
    } finally {
      setStarting(false);
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
      setMsg({ type: 'error', text: error?.response?.data?.error || error.message || 'Export failed.' });
    }
  }

  const recipients = status?.recipients || [];
  const stats = useMemo(() => {
    const total = recipients.length;
    const completed = recipients.filter((r) => ['completed', 'sent'].includes(String(r.status).toLowerCase())).length;
    const retry = recipients.filter((r) => String(r.status).toLowerCase() === 'retry').length;
    const failed = recipients.filter((r) => String(r.status).toLowerCase().includes('failed')).length;
    return { total, completed, retry, failed };
  }, [recipients]);

  const retryDetails = recipients.filter((r) => String(r.status).toLowerCase() === 'retry' || r.last_status_detail);

  return (
    <div className="campaign-view-grid">
      <div className="premium-card span-main">
        <div className="view-title-row">
          <div>
            <div className="card-kicker">Campaign #{id}</div>
            <h3>{status?.campaign?.name || 'Campaign details'}</h3>
            <p className="muted">Start calls, refresh status, and inspect Plivo error details.</p>
          </div>
          <div className="action-row">
            <button className="primary-button" type="button" onClick={handleStart} disabled={starting || recipients.length === 0}>
              {starting ? 'Starting...' : 'Start Campaign'}
            </button>
            <button className="secondary-button" type="button" onClick={handleExport}>Export CSV</button>
            <button className="secondary-button" type="button" onClick={load}>Refresh</button>
          </div>
        </div>

        {msg && <div className={`alert ${msg.type === 'success' ? 'success-alert' : 'error-alert'}`}>{msg.text}</div>}
        {loading && <div className="inline-note">Loading campaign status...</div>}

        <div className="stats-grid">
          <div className="stat-card"><span>Total</span><strong>{stats.total}</strong></div>
          <div className="stat-card"><span>Sent / Completed</span><strong>{stats.completed}</strong></div>
          <div className="stat-card"><span>Retry</span><strong>{stats.retry}</strong></div>
          <div className="stat-card"><span>Failed</span><strong>{stats.failed}</strong></div>
        </div>

        {status?.campaign && (
          <div className="campaign-summary">
            <div><span>Type</span><strong>{status.campaign.type}</strong></div>
            <div><span>Retry delay</span><strong>{status.campaign.retry_delay_minutes} min</strong></div>
            <div><span>Max attempts</span><strong>{status.campaign.max_attempts}</strong></div>
            <div><span>Created</span><strong>{status.campaign.created_at || '-'}</strong></div>
          </div>
        )}
      </div>

      <div className="premium-card span-side">
        <UploadRecipients token={token} campaignId={id} onUploaded={load} />
      </div>

      {retryDetails.length > 0 && (
        <div className="premium-card span-full troubleshooting-card">
          <div className="card-kicker">Call troubleshooting</div>
          <h3>Why the call may not be ringing</h3>
          <p className="muted">Rows in retry usually mean the backend tried to start a Plivo call but Plivo rejected it or the webhook marked it for retry. Check the detail column below and Render logs.</p>
          <ul className="check-list">
            <li>Use E.164 format: <strong>+91XXXXXXXXXX</strong>, not only 91XXXXXXXXXX.</li>
            <li>Confirm Render has real <strong>PLIVO_AUTH_ID</strong>, <strong>PLIVO_AUTH_TOKEN</strong>, and <strong>PLIVO_SOURCE_NUMBER</strong>.</li>
            <li>Confirm your Plivo source/caller ID is valid for outbound voice.</li>
            <li>Use a public HTTPS MP3 URL or a text message fallback.</li>
          </ul>
        </div>
      )}

      <div className="premium-card span-full">
        <div className="table-header">
          <div>
            <div className="card-kicker">Recipient status</div>
            <h3>Delivery table</h3>
          </div>
          <button className="secondary-button" type="button" onClick={load}>Refresh</button>
        </div>

        {recipients.length === 0 ? (
          <div className="empty-state">No recipients uploaded yet. Upload a CSV to begin.</div>
        ) : (
          <div className="table-wrap">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Last Attempt</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="phone-cell">{recipient.phone_number}</td>
                    <td><span className={`status-pill ${statusClass(recipient.status)}`}>{recipient.status || 'pending'}</span></td>
                    <td>{recipient.attempts || 0}</td>
                    <td>{recipient.last_attempt_at || '-'}</td>
                    <td className="detail-cell" title={recipient.last_status_detail || ''}>{compactDetail(recipient.last_status_detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
