import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

export function authHeader(user, pass){
  const token = btoa(`${user}:${pass}`)
  return { Authorization: `Basic ${token}` }
}

export async function createCampaign(auth, body){
  return axios.post(`${API_BASE}/api/campaigns`, body, { headers: auth })
}

export async function uploadRecipients(auth, campaignId, file){
  const fd = new FormData();
  fd.append('file', file)
  return axios.post(`${API_BASE}/api/campaigns/${campaignId}/recipients/upload`, fd, { headers: { ...auth, 'Content-Type': 'multipart/form-data' }})
}

export async function uploadFile(auth, file){
  const fd = new FormData();
  fd.append('file', file)
  return axios.post(`${API_BASE}/api/uploads`, fd, { headers: { ...auth, 'Content-Type': 'multipart/form-data' }})
}

export async function startCampaign(auth, campaignId){
  return axios.post(`${API_BASE}/api/campaigns/${campaignId}/start`, {}, { headers: auth })
}

export async function getStatus(auth, campaignId){
  return axios.get(`${API_BASE}/api/campaigns/${campaignId}/status`, { headers: auth })
}

export async function exportCsv(auth, campaignId){
  return axios.get(`${API_BASE}/api/campaigns/${campaignId}/export?format=csv`, { headers: auth, responseType: 'blob' })
}
