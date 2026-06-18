import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

export function getApiBase() {
  return API_BASE;
}

export function authToken(username, password) {
  return btoa(`${username}:${password}`);
}

function normalizeAuthToken(token) {
  if (!token) return '';
  if (typeof token === 'string') return token.trim();
  if (typeof token === 'object') {
    if (typeof token.authToken === 'string') return token.authToken.trim();
    if (typeof token.token === 'string') return token.token.trim();
    if (typeof token.Authorization === 'string') return token.Authorization.replace(/^Basic\s+/i, '').trim();
    if (typeof token.authorization === 'string') return token.authorization.replace(/^Basic\s+/i, '').trim();
  }
  return '';
}

export function getAuthHeaders(token) {
  const normalizedToken = normalizeAuthToken(token);
  if (!normalizedToken) return {};
  return {
    Authorization: normalizedToken.startsWith('Basic ') ? normalizedToken : `Basic ${normalizedToken}`,
  };
}

export async function checkAuth(token) {
  return axios.get(`${API_BASE}/api/auth/check`, { headers: getAuthHeaders(token) });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolvePayloadAndToken(firstArg, secondArg) {
  if (isObject(firstArg)) return { payload: firstArg, token: secondArg };
  return { payload: secondArg, token: firstArg };
}

export async function listCampaigns(token) {
  return axios.get(`${API_BASE}/api/campaigns`, { headers: getAuthHeaders(token) });
}

export async function listWaitingCalls(token) {
  return axios.get(`${API_BASE}/api/dashboard/waiting-calls`, { headers: getAuthHeaders(token) });
}

export async function createCampaign(firstArg, secondArg) {
  const { payload, token } = resolvePayloadAndToken(firstArg, secondArg);
  return axios.post(`${API_BASE}/api/campaigns`, payload, { headers: getAuthHeaders(token) });
}

export async function uploadRecipients(campaignId, file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post(`${API_BASE}/api/campaigns/${campaignId}/recipients/upload`, formData, {
    headers: { ...getAuthHeaders(token), 'Content-Type': 'multipart/form-data' },
  });
}

export async function uploadFile(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post(`${API_BASE}/api/uploads`, formData, {
    headers: { ...getAuthHeaders(token), 'Content-Type': 'multipart/form-data' },
  });
}

export async function startCampaign(campaignId, token) {
  return axios.post(`${API_BASE}/api/campaigns/${campaignId}/start`, {}, { headers: getAuthHeaders(token) });
}

export async function stopCampaign(campaignId, token) {
  return axios.post(`${API_BASE}/api/campaigns/${campaignId}/stop`, {}, { headers: getAuthHeaders(token) });
}


export async function deleteCampaign(campaignId, token) {
  return axios.delete(`${API_BASE}/api/campaigns/${campaignId}`, { headers: getAuthHeaders(token) });
}

export async function deleteAllLogs(token) {
  return axios.delete(`${API_BASE}/api/logs`, { headers: getAuthHeaders(token) });
}

export async function getStatus(campaignId, token) {
  return axios.get(`${API_BASE}/api/campaigns/${campaignId}/status`, { headers: getAuthHeaders(token) });
}

export async function exportCsv(campaignId, token) {
  return axios.get(`${API_BASE}/api/campaigns/${campaignId}/export`, {
    headers: getAuthHeaders(token),
    responseType: 'blob',
  });
}

export async function exportLogsCsv(campaignId, token) {
  return axios.get(`${API_BASE}/api/campaigns/${campaignId}/logs/export`, {
    headers: getAuthHeaders(token),
    responseType: 'blob',
  });
}

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
