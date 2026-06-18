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
      setMsg({ type: 'error', text: 'Choose a CSV file first.' });
      return;
    }

    setUploading(true);
    try {
      const response = await uploadRecipients(token, campaignId, file);
      const data = getResponseData(response);
      setMsg({ type: 'success', text: `Inserted ${data.inserted || 0} recipient(s).` });
      if (typeof onUploaded === 'function') onUploaded(data);
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.error || error.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="upload-card" onSubmit={handleUpload}>
      <div>
        <div className="card-kicker">Recipients</div>
        <h4>Upload CSV</h4>
        <p className="muted">Use one phone number per row. Recommended: +918056593498.</p>
      </div>
      <div className="upload-row">
        <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <button className="secondary-button" type="submit" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
      </div>
      {msg && <div className={`alert ${msg.type === 'success' ? 'success-alert' : 'error-alert'}`}>{msg.text}</div>}
    </form>
  );
}
