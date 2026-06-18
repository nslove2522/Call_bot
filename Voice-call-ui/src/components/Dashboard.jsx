import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CampaignCreate from './CampaignCreate';
import CampaignView from './CampaignView';
import { downloadBlob, exportLogsCsv, listCampaigns, listWaitingCalls } from '../api';

const TILE_CONFIG = [
  {
    key: 'active',
    label: 'Active Campaigns',
    note: 'draft + ready',
    description: 'Campaigns prepared but not fully completed yet.',
  },
  {
    key: 'running',
    label: 'Running Campaigns',
    note: 'live or retrying',
    description: 'Campaigns currently processing calls or retries.',
  },
  {
    key: 'completed',
    label: 'Completed Campaigns',
    note: 'auto CSV ready',
    description: 'Campaigns where all recipients reached a terminal state.',
  },
  {
    key: 'waiting',
    label: 'Waiting Calls',
    note: 'pending + retry',
    description: 'Individual phone numbers still pending or waiting for retry.',
  },
];

function statusClass(status) {
  const value = String(status || 'draft').toLowerCase();
  if (value === 'completed') return 'status-green';
  if (value === 'running') return 'status-blue';
  if (['active', 'draft'].includes(value)) return 'status-amber';
  if (['stopped', 'failed', 'failed_permanent', 'cancelled'].includes(value)) return 'status-red';
  if (['pending', 'retry'].includes(value)) return 'status-amber';
  if (['sent', 'calling', 'in_progress'].includes(value)) return 'status-blue';
  return 'status-neutral';
}

function getCampaignStatus(item) {
  return String(item?.campaign?.status || 'draft').toLowerCase();
}

function countForTile(summary, tileKey) {
  if (tileKey === 'active') return summary?.active || 0;
  if (tileKey === 'running') return summary?.running || 0;
  if (tileKey === 'completed') return summary?.completed || 0;
  if (tileKey === 'waiting') return summary?.waitingCalls || 0;
  return 0;
}

function DashboardMetric({ tile, value, active, onClick }) {
  return (
    <button
      type="button"
      className={`metric-card metric-tile ${active ? 'selected' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{tile.label}</span>
      <strong>{value}</strong>
      {tile.note && <small>{tile.note}</small>}
      <em className="tile-arrow">View list →</em>
    </button>
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
        <p>{campaign.type?.toUpperCase()} • Campaign #{campaign.id} • Created {campaign.created_at_ist || '-'}</p>
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

function WaitingCallsList({ rows, loading, onOpenCampaign, onRefresh }) {
  if (loading) {
    return <div className="empty-state">Loading waiting calls. The machines are counting, which is apparently still a job.</div>;
  }

  if (!rows.length) {
    return <div className="empty-state">No waiting calls found. Suspiciously peaceful.</div>;
  }

  return (
    <div className="waiting-call-list">
      {rows.map((row) => (
        <article className="waiting-call-row" key={`${row.campaign_id}-${row.recipient_id}`}>
          <div className="waiting-call-main">
            <span className={`status-pill ${statusClass(row.status)}`}>{row.status}</span>
            <h3>{row.phone_number}</h3>
            <p>
              Campaign #{row.campaign_id} • {row.campaign_name} • {String(row.campaign_type || '').toUpperCase() || 'CAMPAIGN'}
            </p>
          </div>

          <div className="waiting-call-meta">
            <div><span>Attempts</span><strong>{row.attempts || 0}</strong></div>
            <div><span>Next Attempt IST</span><strong>{row.next_attempt_at_ist || 'Ready now'}</strong></div>
            <div><span>Last Attempt IST</span><strong>{row.last_attempt_at_ist || '-'}</strong></div>
          </div>

          <div className="waiting-call-detail">
            <span>Diagnostic detail</span>
            <p>{row.last_status_detail || 'No diagnostic detail yet.'}</p>
          </div>

          <div className="row-actions">
            <button className="btn btn-secondary" onClick={() => onOpenCampaign(row.campaign_id)}>Open campaign</button>
            <button className="btn btn-ghost" onClick={onRefresh}>Refresh</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function listTitle(tileKey) {
  if (tileKey === 'active') return 'Active campaigns';
  if (tileKey === 'running') return 'Running campaigns';
  if (tileKey === 'completed') return 'Completed campaigns';
  if (tileKey === 'waiting') return 'Waiting calls';
  return 'Campaign portfolio';
}

function listSubtitle(tileKey) {
  if (tileKey === 'active') return 'Campaigns that are drafted or ready but not finished.';
  if (tileKey === 'running') return 'Campaigns currently sending calls, waiting for callbacks, or retrying.';
  if (tileKey === 'completed') return 'Campaigns with logs ready to download.';
  if (tileKey === 'waiting') return 'Every pending or retry phone number grouped with its campaign context.';
  return 'All campaigns, neatly arranged because chaos already has enough market share.';
}

export default function Dashboard({ authToken, onLogout }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [waitingCalls, setWaitingCalls] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedTile, setSelectedTile] = useState('all');
  const [jumpId, setJumpId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitingLoading, setWaitingLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadWaitingCalls = useCallback(async () => {
    setWaitingLoading(true);
    try {
      const res = await listWaitingCalls(authToken);
      setWaitingCalls(res.data.waitingCalls || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setWaitingLoading(false);
    }
  }, [authToken]);

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

  const refreshDashboard = useCallback(async () => {
    await loadCampaigns();
    if (selectedTile === 'waiting') await loadWaitingCalls();
  }, [loadCampaigns, loadWaitingCalls, selectedTile]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedTile === 'waiting') loadWaitingCalls();
  }, [selectedTile, loadWaitingCalls]);

  useEffect(() => {
    const id = setInterval(() => {
      loadCampaigns();
      if (selectedTile === 'waiting') loadWaitingCalls();
    }, 15000);
    return () => clearInterval(id);
  }, [loadCampaigns, loadWaitingCalls, selectedTile]);

  const filteredCampaigns = useMemo(() => {
    if (selectedTile === 'active') {
      return campaigns.filter((item) => ['draft', 'active'].includes(getCampaignStatus(item)));
    }
    if (selectedTile === 'running') {
      return campaigns.filter((item) => getCampaignStatus(item) === 'running');
    }
    if (selectedTile === 'completed') {
      return campaigns.filter((item) => getCampaignStatus(item) === 'completed');
    }
    return campaigns;
  }, [campaigns, selectedTile]);

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

  function handleTileClick(tileKey) {
    setSelectedTile((current) => current === tileKey ? 'all' : tileKey);
  }

  if (selectedCampaignId) {
    return (
      <AppFrame onLogout={onLogout} onRefresh={refreshDashboard}>
        <CampaignView campaignId={selectedCampaignId} authToken={authToken} onBack={() => { setSelectedCampaignId(null); refreshDashboard(); }} />
      </AppFrame>
    );
  }

  return (
    <AppFrame onLogout={onLogout} onRefresh={refreshDashboard}>
      <div className="page-stack">
        <section className="hero-card dashboard-hero">
          <div>
            <span className="eyebrow">Premium dashboard</span>
            <h1>Campaign command center</h1>
            <p>Track active, running, completed, and waiting calls in one place. Click any tile to drill down.</p>
          </div>
          <button className="btn btn-light" onClick={refreshDashboard} disabled={loading || waitingLoading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </section>

        {error && <div className="alert danger">{error}</div>}

        <section className="metrics-grid clickable-metrics">
          {TILE_CONFIG.map((tile) => (
            <DashboardMetric
              key={tile.key}
              tile={tile}
              value={countForTile(summary, tile.key)}
              active={selectedTile === tile.key}
              onClick={() => handleTileClick(tile.key)}
            />
          ))}
        </section>

        <section className="panel tile-results-panel">
          <div className="panel-heading split">
            <div>
              <span className="eyebrow red">{selectedTile === 'all' ? 'Overview' : 'Selected tile'}</span>
              <h2>{listTitle(selectedTile)}</h2>
              <p className="muted">{listSubtitle(selectedTile)}</p>
            </div>
            <div className="actions">
              {selectedTile !== 'all' && (
                <button className="btn btn-ghost" onClick={() => setSelectedTile('all')}>Show all</button>
              )}
              <button className="btn btn-secondary" onClick={selectedTile === 'waiting' ? loadWaitingCalls : loadCampaigns} disabled={loading || waitingLoading}>
                Refresh list
              </button>
            </div>
          </div>

          {selectedTile === 'waiting' ? (
            <WaitingCallsList
              rows={waitingCalls}
              loading={waitingLoading}
              onOpenCampaign={setSelectedCampaignId}
              onRefresh={loadWaitingCalls}
            />
          ) : filteredCampaigns.length === 0 ? (
            <div className="empty-state">No {selectedTile === 'all' ? '' : selectedTile} campaigns found.</div>
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

        <section className="dashboard-layout">
          <CampaignCreate authToken={authToken} onCreated={(id) => { setSelectedCampaignId(id); refreshDashboard(); }} />

          <aside className="panel side-panel">
            <span className="eyebrow red">Open existing</span>
            <h2>Jump to campaign</h2>
            <p className="muted">Use this if you already know the campaign ID.</p>
            <input value={jumpId} onChange={(e) => setJumpId(e.target.value)} placeholder="Example: 12" />
            <button className="btn btn-secondary btn-block" disabled={!jumpId} onClick={() => setSelectedCampaignId(jumpId)}>
              Open campaign
            </button>
            <div className="tip-card">
              <strong>Clickable dashboard</strong>
              <p>Use the four tiles above to drill into active, running, completed, or waiting call lists.</p>
            </div>
            <div className="tip-card soft-blue">
              <strong>Timezone</strong>
              <p>All dashboard display and CSV exports use Indian Standard Time. Technical timezone: Asia/Kolkata.</p>
            </div>
          </aside>
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
