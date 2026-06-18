import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CampaignCreate from './CampaignCreate';
import CampaignView from './CampaignView';
import { downloadBlob, exportLogsCsv, listCampaigns } from '../api';

function statusClass(status) {
  const value = String(status || 'draft').toLowerCase();
  if (value === 'completed') return 'status-green';
  if (value === 'running') return 'status-blue';
  if (['active', 'draft'].includes(value)) return 'status-amber';
  if (['stopped', 'failed'].includes(value)) return 'status-red';
  return 'status-neutral';
}

function DashboardMetric({ label, value, note }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function CampaignRow({ item, onOpen, onDownloadLogs, downloading }) {
  const campaign = item.campaign;
  const stats = item.stats || {};
  const total = stats.total || 0;
  const completion = total ? Math.round(((stats.completed || 0) / total) * 100) : 0;
  const waiting = stats.waiting || 0;

  return (
    <div className="campaign-row">
      <div className="campaign-main">
        <span className={`status-pill ${statusClass(campaign.status)}`}>{campaign.status}</span>
        <h3>{campaign.name}</h3>
        <p>{campaign.type?.toUpperCase()} • Created {campaign.created_at_ist || '-'}</p>
      </div>

      <div className="campaign-mini-stats">
        <div><span>Waiting</span><strong>{waiting}</strong></div>
        <div><span>Running</span><strong>{stats.running || 0}</strong></div>
        <div><span>Done</span><strong>{stats.completed || 0}</strong></div>
      </div>

      <div className="row-progress">
        <div className="row-progress-track"><div style={{ width: `${completion}%` }} /></div>
        <small>{completion}% complete</small>
      </div>

      <div className="row-actions">
        <button className="btn btn-secondary" onClick={() => onOpen(campaign.id)}>Open</button>
        <button className="btn btn-ghost" disabled={!total || downloading} onClick={() => onDownloadLogs(campaign.id)}>
          Logs CSV
        </button>
      </div>
    </div>
  );
}

export default function Dashboard({ authToken, onLogout }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('all');
  const [jumpId, setJumpId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCampaigns(authToken);
      setCampaigns(res.data.campaigns || []);
      setSummary(res.data.summary || null);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    loadCampaigns();
    const id = setInterval(loadCampaigns, 15000);
    return () => clearInterval(id);
  }, [loadCampaigns]);

  const filteredCampaigns = useMemo(() => {
    if (filter === 'all') return campaigns;
    if (filter === 'active') return campaigns.filter((item) => ['draft', 'active'].includes(String(item.campaign.status).toLowerCase()));
    if (filter === 'running') return campaigns.filter((item) => String(item.campaign.status).toLowerCase() === 'running');
    if (filter === 'completed') return campaigns.filter((item) => String(item.campaign.status).toLowerCase() === 'completed');
    if (filter === 'stopped') return campaigns.filter((item) => String(item.campaign.status).toLowerCase() === 'stopped');
    return campaigns;
  }, [campaigns, filter]);

  async function downloadLogs(campaignId) {
    setDownloadingId(campaignId);
    try {
      const res = await exportLogsCsv(campaignId, authToken);
      downloadBlob(res.data, `campaign_${campaignId}_logs_IST.csv`);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setDownloadingId(null);
    }
  }

  if (selectedCampaignId) {
    return (
      <AppFrame onLogout={onLogout} onRefresh={loadCampaigns}>
        <CampaignView campaignId={selectedCampaignId} authToken={authToken} onBack={() => { setSelectedCampaignId(null); loadCampaigns(); }} />
      </AppFrame>
    );
  }

  return (
    <AppFrame onLogout={onLogout} onRefresh={loadCampaigns}>
      <div className="page-stack">
        <section className="hero-card dashboard-hero">
          <div>
            <span className="eyebrow">Premium dashboard</span>
            <h1>Campaign command center</h1>
            <p>Track active, running, completed, and waiting calls in one place. Almost civilized.</p>
          </div>
          <button className="btn btn-light" onClick={loadCampaigns} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </section>

        {error && <div className="alert danger">{error}</div>}

        <section className="metrics-grid">
          <DashboardMetric label="Active Campaigns" value={summary?.active || 0} note="draft + ready" />
          <DashboardMetric label="Running Campaigns" value={summary?.running || 0} note="live or retrying" />
          <DashboardMetric label="Completed Campaigns" value={summary?.completed || 0} note="auto CSV ready" />
          <DashboardMetric label="Waiting Calls" value={summary?.waitingCalls || 0} note="pending + retry" />
        </section>

        <section className="dashboard-layout">
          <CampaignCreate authToken={authToken} onCreated={(id) => { setSelectedCampaignId(id); loadCampaigns(); }} />

          <aside className="panel side-panel">
            <span className="eyebrow red">Open existing</span>
            <h2>Jump to campaign</h2>
            <p className="muted">Use this if you already know the campaign ID.</p>
            <input value={jumpId} onChange={(e) => setJumpId(e.target.value)} placeholder="Example: 12" />
            <button className="btn btn-secondary btn-block" disabled={!jumpId} onClick={() => setSelectedCampaignId(jumpId)}>
              Open campaign
            </button>
            <div className="tip-card">
              <strong>Timezone</strong>
              <p>All dashboard display and CSV exports use Indian Standard Time. The technical timezone is Asia/Kolkata, which covers Chennai too.</p>
            </div>
          </aside>
        </section>

        <section className="panel campaign-list-panel">
          <div className="panel-heading split">
            <div>
              <span className="eyebrow red">Campaigns</span>
              <h2>Campaign portfolio</h2>
              <p className="muted">Running campaigns show waiting calls so you know what is still pending.</p>
            </div>
            <div className="segmented">
              {['all', 'active', 'running', 'completed', 'stopped'].map((name) => (
                <button key={name} className={filter === name ? 'active' : ''} onClick={() => setFilter(name)}>{name}</button>
              ))}
            </div>
          </div>

          {filteredCampaigns.length === 0 ? (
            <div className="empty-state">No {filter === 'all' ? '' : filter} campaigns found.</div>
          ) : (
            <div className="campaign-list">
              {filteredCampaigns.map((item) => (
                <CampaignRow
                  key={item.campaign.id}
                  item={item}
                  onOpen={setSelectedCampaignId}
                  onDownloadLogs={downloadLogs}
                  downloading={downloadingId === item.campaign.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppFrame>
  );
}

function AppFrame({ children, onLogout, onRefresh }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">◆</div>
          <div>
            <span>Voice Campaign Console</span>
            <h1>Vadivel Indane Gas Agency</h1>
          </div>
        </div>
        <div className="topbar-actions">
          {onRefresh && <button className="btn btn-light" onClick={onRefresh}>Refresh</button>}
          <button className="btn btn-outline-light" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <main className="content-shell">{children}</main>
    </div>
  );
}
