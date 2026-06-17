import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/$/, '');

function normalizeAuth(auth) {
  if (!auth) return {};

  if (typeof auth === 'string') {
    const token = auth.startsWith('Basic ') ? auth : `Basic ${auth}`;
    return { Authorization: token };
  }

  if (typeof auth === 'object') {
    if (typeof auth.Authorization === 'string') {
      const token = auth.Authorization.startsWith('Basic ')
        ? auth.Authorization
        : `Basic ${auth.Authorization}`;
      return { ...auth, Authorization: token };
    }

    if (typeof auth.authorization === 'string') {
      const token = auth.authorization.startsWith('Basic ')
        ? auth.authorization
        : `Basic ${auth.authorization}`;
      return { ...auth, Authorization: token };
    }

    if (typeof auth.token === 'string') {
      const token = auth.token.startsWith('Basic ') ? auth.token : `Basic ${auth.token}`;
      return { Authorization: token };
    }
  }

  return {};
}

export function authHeader(user, pass) {
  const token = btoa(`${user}:${pass}`);
  return { Authorization: `Basic ${token}` };
}

export function authToken(user, pass) {
  return btoa(`${user}:${pass}`);
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
