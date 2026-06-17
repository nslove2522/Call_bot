import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/$/, '');

function normalizeAuth(auth) {
  if (!auth) return {};

  if (typeof auth === 'string') {
    const clean = auth.trim();
    if (!clean) return {};
    return { Authorization: clean.startsWith('Basic ') ? clean : `Basic ${clean}` };
  }

  if (typeof auth === 'object') {
    const candidate = auth.Authorization || auth.authorization || auth.token || auth.authToken;
    if (typeof candidate === 'string') {
      const clean = candidate.trim();
      return { Authorization: clean.startsWith('Basic ') ? clean : `Basic ${clean}` };
    }
  }

  return {};
}

export function authToken(user, pass) {
  return btoa(`${user}:${pass}`);
}

export function getApiBase() {
  return API_BASE;
}

export async function checkAuth(auth) {
  return axios.get(`${API_BASE}/api/auth/check`, {
    headers: normalizeAuth(auth),
  });
}

export async function createCampaign(auth, body) {
  return axios.post(`${API_BASE}/api/campaigns`, body, {
    headers: normalizeAuth(auth),
  });
}

export async function uploadRecipients(auth, campaignId, file) {
  const fd = new FormData();
  fd.append('file', file);

  return axios.post(`${API_BASE}/api/campaigns/${campaignId}/recipients/upload`, fd, {
    headers: {
      ...normalizeAuth(auth),
      'Content-Type': 'multipart/form-data',
    },
  });
}

export async function uploadFile(auth, file) {
  const fd = new FormData();
  fd.append('file', file);

  return axios.post(`${API_BASE}/api/uploads`, fd, {
    headers: {
      ...normalizeAuth(auth),
      'Content-Type': 'multipart/form-data',
    },
  });
}

export async function startCampaign(auth, campaignId) {
  return axios.post(`${API_BASE}/api/campaigns/${campaignId}/start`, {}, {
    headers: normalizeAuth(auth),
  });
}

export async function getStatus(auth, campaignId) {
  return axios.get(`${API_BASE}/api/campaigns/${campaignId}/status`, {
    headers: normalizeAuth(auth),
  });
}

export async function exportCsv(auth, campaignId) {
  return axios.get(`${API_BASE}/api/campaigns/${campaignId}/export?format=csv`, {
    headers: normalizeAuth(auth),
    responseType: 'blob',
  });
}
