import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import UploadRecipients from './UploadRecipients';
import { downloadBlob, exportCsv, exportLogsCsv, getStatus, startCampaign, stopCampaign } from '../api';

function statusClass(status) {
  const value = String(status || 'draft').toLowerCase();
  if (['completed', 'sent'].includes(value)) return 'status-green';
  if (['running', 'sent', 'calling', 'in_progress'].includes(value)) return 'status-blue';
  if (['retry', 'pending', 'active', 'draft'].includes(value)) return 'status-amber';
  if (['failed', 'failed_permanent', 'stopped', 'cancelled'].includes(value)) return 'status-red';
  return 'status-neutral';
}

function StatCard({ label, value, detail }) {
  return (
    <div className="stat-card compact">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function terminalCampaign(status) {
  return ['completed', 'stopped'].includes(String(status || '').toLowerCase());
}

export default function CampaignView({ campaignId, authToken, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const autoDownloadRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await getStatus(campaignId, authToken);
      setData(res.data);
      setError('');
      return res.data;
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
      return null;
    }
  }, [campaignId, authToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      const status = data?.campaign?.status;
      if (!terminalCampaign(status)) load();
    }, 8000);
    return () => clearInterval(id);
  }, [data?.campaign?.status, load]);

  const stats = data?.stats || {};
  const campaign = data?.campaign || {};
  const recipients = data?.recipients || [];

  const completionPercent = useMemo(() => {
    if (!stats.total) return 0;
    return Math.round(((stats.completed || 0) / stats.total) * 100);
  }, [stats.completed, stats.total]);

  const waitingPercent = useMemo(() => {
    if (!stats.total) return 0;
    return Math.round(((stats.waiting || 0) / stats.total) * 100);
  }, [stats.waiting, stats.total]);

  async function handleStart() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await startCampaign(campaignId, authToken);
      setNotice(`Campaign started. ${res.data.started || 0} waiting recipient(s) submitted.`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    if (!window.confirm('Stop this campaign? Pending and retry recipients will be cancelled. Calls already handed to Plivo may still finish.')) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await stopCampaign(campaignId, authToken);
      setNotice('Campaign stopped. Pending/retry recipients were cancelled.');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadRecipients() {
    try {
      const res = await exportCsv(campaignId, authToken);
      downloadBlob(res.data, `campaign_${campaignId}_recipients_IST.csv`);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    }
  }

  async function downloadLogs({ auto = false } = {}) {
    try {
      const res = await exportLogsCsv(campaignId, authToken);
      downloadBlob(res.data, `campaign_${campaignId}_logs_IST.csv`);
      if (auto) setNotice('Campaign completed. Logs CSV downloaded automatically.');
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    }
  }

  useEffect(() => {
    const key = `autoLogsDownloaded:${campaignId}`;
    const shouldAutoDownload = campaign.status === 'completed' && stats.total > 0;
    if (!shouldAutoDownload) return;
    if (autoDownloadRef.current || localStorage.getItem(key) === 'yes') return;

    autoDownloadRef.current = true;
    localStorage.setItem(key, 'yes');
    downloadLogs({ auto: true });
  }, [campaign.status, stats.total, campaignId]);

  return (
    <div className="page-stack">
      <section className="hero-card details-hero">
        <button className="btn btn-ghost" onClick={onBack}>← Back to dashboard</button>
        <div>
          <span className="eyebrow">Campaign #{campaignId}</span>
          <h1>{campaign.name || 'Campaign Details'}</h1>
          <p>Upload recipients, start calls, stop pending work, and read IST logs without guessing like it is 1998.</p>
        </div>
        <span className={`status-pill ${statusClass(campaign.status)}`}>{campaign.status || 'draft'}</span>
      </section>

      <section className="panel control-panel">
        <div className="panel-heading split">
          <div>
            <span className="eyebrow red">Control room</span>
            <h2>Campaign control</h2>
            <p className="muted">Indian timezone display: <strong>Asia/Kolkata / IST</strong>. Chennai uses the same IST timezone.</p>
          </div>
          <div className="actions">
            <button className="btn btn-secondary" onClick={load} disabled={loading}>Refresh</button>
            <button className="btn btn-primary" onClick={handleStart} disabled={loading || terminalCampaign(campaign.status) || !stats.total}>Start Campaign</button>
            <button className="btn btn-danger" onClick={handleStop} disabled={loading || terminalCampaign(campaign.status)}>Stop Campaign</button>
            <button className="btn btn-secondary" onClick={downloadRecipients} disabled={!stats.total}>Recipients CSV</button>
            <button className="btn btn-secondary" onClick={() => downloadLogs()} disabled={!stats.total}>Logs CSV</button>
          </div>
        </div>

        {notice && <div className="alert success">{notice}</div>}
        {error && <div className="alert danger">{error}</div>}

        <UploadRecipients campaignId={campaignId} authToken={authToken} onUploaded={load} />

        <div className="progress-shell">
          <div className="progress-copy">
            <strong>{completionPercent}% completed</strong>
            <span>{stats.waiting || 0} call(s) still waiting</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill green" style={{ width: `${completionPercent}%` }} />
            <div className="progress-fill amber" style={{ width: `${waitingPercent}%` }} />
          </div>
        </div>

        <div className="stats-grid five">
          <StatCard label="Total" value={stats.total || 0} />
          <StatCard label="Waiting" value={stats.waiting || 0} detail="pending + retry" />
          <StatCard label="Running" value={stats.running || 0} detail="sent to Plivo" />
          <StatCard label="Completed" value={stats.completed || 0} />
          <StatCard label="Failed / Cancelled" value={(stats.failed || 0) + (stats.cancelled || 0)} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading split">
          <div>
            <span className="eyebrow red">Campaign metadata</span>
            <h2>Details</h2>
          </div>
        </div>
        <div className="detail-grid">
          <div><span>Name</span><strong>{campaign.name || '-'}</strong></div>
          <div><span>Type</span><strong>{campaign.type || '-'}</strong></div>
          <div><span>Created IST</span><strong>{campaign.created_at_ist || '-'}</strong></div>
          <div><span>Started IST</span><strong>{campaign.started_at_ist || '-'}</strong></div>
          <div><span>Completed IST</span><strong>{campaign.completed_at_ist || '-'}</strong></div>
          <div><span>Stopped IST</span><strong>{campaign.stopped_at_ist || '-'}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading split">
          <div>
            <span className="eyebrow red">Recipients</span>
            <h2>Call status board</h2>
          </div>
        </div>

        {recipients.length === 0 ? (
          <div className="empty-state">No recipients uploaded yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Last Attempt IST</th>
                  <th>Next Attempt IST</th>
                  <th>Diagnostic detail</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td>{recipient.phone_number}</td>
                    <td><span className={`status-pill ${statusClass(recipient.status)}`}>{recipient.status}</span></td>
                    <td>{recipient.attempts || 0}</td>
                    <td>{recipient.last_attempt_at_ist || '-'}</td>
                    <td>{recipient.next_attempt_at_ist || '-'}</td>
                    <td className="detail-cell">{recipient.last_status_detail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
