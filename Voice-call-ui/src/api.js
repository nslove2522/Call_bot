import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

function normalizeAuthToken(authToken) {
  if (!authToken) {
    return '';
  }

  if (typeof authToken === 'string') {
    return authToken.trim();
  }

  if (typeof authToken === 'object') {
    if (typeof authToken.authToken === 'string') {
      return authToken.authToken.trim();
    }

    if (typeof authToken.token === 'string') {
      return authToken.token.trim();
    }

    if (typeof authToken.Authorization === 'string') {
      return authToken.Authorization.replace(/^Basic\s+/i, '').trim();
    }

    if (typeof authToken.authorization === 'string') {
      return authToken.authorization.replace(/^Basic\s+/i, '').trim();
    }
  }

  return '';
}

function getAuthHeaders(authToken) {
  const token = normalizeAuthToken(authToken);

  if (!token) {
    return {};
  }

  const authorization = token.startsWith('Basic ')
    ? token
    : `Basic ${token}`;

  return {
    Authorization: authorization,
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolvePayloadAndToken(firstArg, secondArg) {
  // Supports both:
  // createCampaign(payload, authToken)
  // createCampaign(authToken, payload)
  if (isObject(firstArg)) {
    return {
      payload: firstArg,
      authToken: secondArg,
    };
  }

  return {
    payload: secondArg,
    authToken: firstArg,
  };
}

export async function createCampaign(firstArg, secondArg) {
  const { payload, authToken } = resolvePayloadAndToken(firstArg, secondArg);

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
