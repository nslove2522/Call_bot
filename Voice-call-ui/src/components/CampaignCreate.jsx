import React, { useState } from 'react';
import { createCampaign, uploadFile } from '../api';

function getResponseData(response) {
  return response && response.data ? response.data : response;
}

export default function CampaignCreate({ token, onCreated }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('voice');
  const [message, setMessage] = useState('');
  const [voiceUrl, setVoiceUrl] = useState('');
  const [retry, setRetry] = useState(1);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [err, setErr] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleCreate(event) {
    event.preventDefault();
    setErr(null);
    setSuccess(null);
    setCreating(true);

    try {
      const payload = {
        name: name.trim(),
        type,
        message_text: message,
        voice_url: voiceUrl.trim(),
        retry_delay_minutes: Number(retry) || 1,
        max_attempts: Number(maxAttempts) || 3,
      };

      if (!payload.name) throw new Error('Campaign name is required.');
      if (payload.type === 'voice' && !payload.message_text && !payload.voice_url) {
        throw new Error('Voice campaign requires either Message or Voice URL.');
      }
      if (payload.type === 'sms' && !payload.message_text) {
        throw new Error('SMS campaign requires Message.');
      }

      const response = await createCampaign(token, payload);
      const data = getResponseData(response);
      const createdId = data && data.id;

      if (!createdId) {
        throw new Error(`Campaign was created but backend did not return an id. Response: ${JSON.stringify(data)}`);
      }

      setSuccess(`Campaign created successfully. ID: ${createdId}`);
      if (typeof onCreated === 'function') onCreated(createdId);
    } catch (error) {
      setErr(error?.response?.data?.error || error.message || 'Create campaign failed');
    } finally {
      setCreating(false);
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setErr(null);
    setUploading(true);

    try {
      const response = await uploadFile(token, file);
      const data = getResponseData(response);
      if (!data || !data.url) throw new Error('Upload completed but no URL was returned.');
      setVoiceUrl(data.url);
    } catch (error) {
      setErr(error?.response?.data?.error || error.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleCreate}>
      <h3>Create Campaign</h3>

      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

      <label>
        Type
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="voice">Voice</option>
          <option value="sms">SMS</option>
        </select>
      </label>

      <label>
        Message
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>

      {type === 'voice' && (
        <>
          <label>
            Voice file (MP3)
            <input type="file" accept="audio/*" onChange={handleFileUpload} />
          </label>
          {uploading && <div>Uploading...</div>}

          <label>
            Voice URL
            <input
              value={voiceUrl}
              onChange={(event) => setVoiceUrl(event.target.value)}
              placeholder="or paste a public audio URL"
            />
          </label>
        </>
      )}

      <label>
        Retry Delay (minutes)
        <input type="number" min="1" value={retry} onChange={(event) => setRetry(event.target.value)} />
      </label>

      <label>
        Max Attempts
        <input type="number" min="1" value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} />
      </label>

      <button type="submit" disabled={creating || uploading}>
        {creating ? 'Creating...' : 'Create'}
      </button>

      {success && <div className="success">{success}</div>}
      {err && <div className="error">{err}</div>}
    </form>
  );
}
