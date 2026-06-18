import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { exportCsv, getStatus, startCampaign, stopCampaign, uploadRecipients } from '../api';

function getCampaignStatus(campaign) {
  return campaign?.status || 'draft';
}

function statusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'sent'].includes(normalized)) return 'success';
  if (['running', 'pending', 'retry'].includes(normalized)) return 'warning';
  if (['failed', 'failed_permanent', 'cancelled', 'stopped'].includes(normalized)) return 'danger';
  return 'neutral';
}

function StatusPill({ status }) {
  const value = status || 'unknown';
  return <span className={`status-pill status-${statusTone(value)}`}>{value}</span>;
}

export default function CampaignView({ campaignId, authToken, onBack }) {
  const [data, setData] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    if (!campaignId) return;

    setLoading(true);
    setError('');

    try {
      const res = await getStatus(campaignId, authToken);
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [campaignId, authToken]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const campaign = data?.campaign;
  const recipients = data?.recipients || [];
  const campaignStatus = getCampaignStatus(campaign);
  const isStopped = campaignStatus === 'stopped';

  const stats = useMemo(() => {
    const total = recipients.length;
    const completed = recipients.filter((r) => ['completed', 'sent'].includes(r.status)).length;
    const retry = recipients.filter((r) => r.status === 'retry').length;
    const cancelled = recipients.filter((r) => ['cancelled', 'stopped'].includes(r.status)).length;
    const failed = recipients.filter((r) => ['failed', 'failed_permanent'].includes(r.status)).length;

    return { total, completed, retry, cancelled, failed };
  }, [recipients]);

  async function handleUpload() {
    if (!file) {
      setError('Choose a CSV file first. Even software likes receiving the actual file.');
      return;
    }

    setUploading(true);
    setError('');
    setMessage('');

    try {
      const res = await uploadRecipients(campaignId, file, authToken);
      setMessage(`Inserted ${res.data.inserted || 0} recipient(s).`);
      setFile(null);
      await loadStatus();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleStart() {
    if (isStopped) {
      setError('This campaign is stopped. Create a new campaign for another run.');
      return;
    }

    setStarting(true);
    setError('');
    setMessage('');

    try {
      const res = await startCampaign(campaignId, authToken);
      setMessage(`Started ${res.data.started || 0} recipient(s).`);
      await loadStatus();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Start campaign failed');
    } finally {
      setStarting(false);
    }
  }

  async function handleStop() {
    const confirmed = window.confirm(
      'Stop this campaign now? Pending and retry recipients will be cancelled. Already dialed calls may still complete.'
    );

    if (!confirmed) return;

    setStopping(true);
    setError('');
    setMessage('');

    try {
      const res = await stopCampaign(campaignId, authToken);
      setMessage(`Campaign stopped. Cancelled ${res.data.cancelledRecipients || 0} pending/retry recipient(s).`);
      await loadStatus();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Stop campaign failed');
    } finally {
      setStopping(false);
    }
  }

  async function handleExport() {
    setError('');

    try {
      const res = await exportCsv(campaignId, authToken);
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign_${campaignId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Export failed');
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-panel compact-hero">
        <div>
          <p className="eyebrow">Campaign #{campaignId}</p>
          <h1>{campaign?.name || 'Campaign Details'}</h1>
          <p>Upload recipients, start outbound calls, stop pending work, and read status diagnostics without guessing like it is 1998.</p>
        </div>
        <div className="hero-actions">
          {campaign && <StatusPill status={campaignStatus} />}
          {onBack && (
            <button className="button button-secondary" onClick={onBack}>Back</button>
          )}
        </div>
      </section>

      <section className="content-grid campaign-detail-grid">
        <div className="premium-card wide-card">
          <div className="card-heading-row">
            <div>
              <p className="eyebrow red">Recipients</p>
              <h2>Campaign control</h2>
              <p className="muted">CSV format: one phone number per row. For Plivo, prefer E.164 format like +918056593498.</p>
            </div>
            <div className="action-row wrap-actions">
              <button className="button button-secondary" onClick={loadStatus} disabled={loading}>Refresh</button>
              <button className="button button-primary" onClick={handleStart} disabled={starting || isStopped || recipients.length === 0}>
                {starting ? 'Starting...' : 'Start Campaign'}
              </button>
              <button className="button button-danger" onClick={handleStop} disabled={stopping || isStopped}>
                {stopping ? 'Stopping...' : 'Stop Campaign'}
              </button>
              <button className="button button-secondary" onClick={handleExport} disabled={recipients.length === 0}>Export CSV</button>
            </div>
          </div>

          <div className="upload-panel">
            <input type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <button className="button button-primary" onClick={handleUpload} disabled={uploading || !file}>
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </button>
          </div>

          {message && <div className="alert alert-success">{message}</div>}
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="stats-row">
            <div className="stat-card"><span>Total</span><strong>{stats.total}</strong></div>
            <div className="stat-card"><span>Completed/Sent</span><strong>{stats.completed}</strong></div>
            <div className="stat-card"><span>Retry</span><strong>{stats.retry}</strong></div>
            <div className="stat-card"><span>Cancelled</span><strong>{stats.cancelled}</strong></div>
            <div className="stat-card"><span>Failed</span><strong>{stats.failed}</strong></div>
          </div>

          {loading ? (
            <div className="loading-card">Loading campaign...</div>
          ) : recipients.length === 0 ? (
            <div className="empty-card">No recipients uploaded yet.</div>
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
                    <tr key={recipient.id || recipient.phone_number}>
                      <td className="mono-cell">{recipient.phone_number}</td>
                      <td><StatusPill status={recipient.status} /></td>
                      <td>{recipient.attempts ?? 0}</td>
                      <td>{recipient.last_attempt_at || '-'}</td>
                      <td className="detail-cell">{recipient.last_status_detail || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="premium-card side-card">
          <p className="eyebrow red">Summary</p>
          <h2>Campaign</h2>
          <div className="summary-list">
            <div><span>Name</span><strong>{campaign?.name || '-'}</strong></div>
            <div><span>Type</span><strong>{campaign?.type || '-'}</strong></div>
            <div><span>Status</span><strong>{campaignStatus}</strong></div>
            <div><span>Max attempts</span><strong>{campaign?.max_attempts || '-'}</strong></div>
            <div><span>Retry delay</span><strong>{campaign?.retry_delay_minutes || '-'} min</strong></div>
          </div>

          <div className="tip-card warning-tip">
            <strong>What Stop Campaign does</strong>
            <p>It cancels pending and retry rows so the worker will not dial them later. Already-started Plivo calls may still finish because telephony refuses to obey dramatic button clicks instantly.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
