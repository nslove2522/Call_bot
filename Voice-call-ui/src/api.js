import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

function getAuthHeaders(authToken) {
  if (!authToken) {
    return {};
  }

  const authorization = authToken.startsWith('Basic ')
    ? authToken
    : `Basic ${authToken}`;

  return {
    Authorization: authorization,
  };
}

export async function createCampaign(payload, authToken) {
  const res = await axios.post(`${API_BASE}/api/campaigns`, payload, {
    headers: getAuthHeaders(authToken),
  });

  return res.data;
}

export async function uploadRecipients(campaignId, file, authToken) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await axios.post(
    `${API_BASE}/api/campaigns/${campaignId}/recipients/upload`,
    formData,
    {
      headers: {
        ...getAuthHeaders(authToken),
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return res.data;
}

export async function uploadFile(file, authToken) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await axios.post(`${API_BASE}/api/uploads`, formData, {
    headers: {
      ...getAuthHeaders(authToken),
      'Content-Type': 'multipart/form-data',
    },
  });

  return res.data;
}

export async function startCampaign(campaignId, authToken) {
  const res = await axios.post(
    `${API_BASE}/api/campaigns/${campaignId}/start`,
    {},
    {
      headers: getAuthHeaders(authToken),
    }
  );

  return res.data;
}

export async function getStatus(campaignId, authToken) {
  const res = await axios.get(`${API_BASE}/api/campaigns/${campaignId}/status`, {
    headers: getAuthHeaders(authToken),
  });

  return res.data;
}

export async function exportCsv(campaignId, authToken) {
  const res = await axios.get(`${API_BASE}/api/campaigns/${campaignId}/export`, {
    headers: getAuthHeaders(authToken),
    responseType: 'blob',
  });

  return res.data;
}