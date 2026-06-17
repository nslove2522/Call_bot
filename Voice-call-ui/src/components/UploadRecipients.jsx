import React, { useState } from 'react';
import { uploadRecipients } from '../api';

function getResponseData(response) {
  return response && response.data ? response.data : response;
}

export default function UploadRecipients({ token, campaignId, onUploaded }) {
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(event) {
    event.preventDefault();
    setMsg(null);

    if (!file) {
      setMsg('Choose a CSV file first.');
      return;
    }

    setUploading(true);
    try {
      const response = await uploadRecipients(token, campaignId, file);
      const data = getResponseData(response);
      setMsg(`Inserted ${data.inserted || 0} recipient(s).`);
      if (typeof onUploaded === 'function') onUploaded(data);
    } catch (error) {
      setMsg(error?.response?.data?.error || error.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleUpload}>
      <h4>Upload Recipients (CSV)</h4>
      <p>Use one phone number per row. Example: 919876543210</p>
      <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
      <button type="submit" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
      {msg && <div>{msg}</div>}
    </form>
  );
}
