import React, { useState } from 'react';
import { uploadRecipients } from '../api';

export default function UploadRecipients({ campaignId, authToken, onUploaded }) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const res = await uploadRecipients(campaignId, file, authToken);
      setMessage(`Inserted ${res.data.inserted || 0} recipient(s).`);
      setFile(null);
      if (onUploaded) onUploaded();
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="upload-card" onSubmit={submit}>
      <div>
        <span className="eyebrow red">Recipients</span>
        <h3>Upload CSV</h3>
        <p className="muted">One phone number per row. Use E.164 format like <strong>+918056593498</strong>.</p>
      </div>

      <div className="upload-row">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn btn-secondary" type="submit" disabled={!file || loading}>
          {loading ? 'Uploading...' : 'Upload CSV'}
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}
    </form>
  );
}
