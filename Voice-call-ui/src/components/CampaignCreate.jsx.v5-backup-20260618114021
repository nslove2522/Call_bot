import React, { useState } from 'react';
import { createCampaign, uploadFile } from '../api';

function getResponseData(response) {
  return response && response.data ? response.data : response;
}

function normalizePhoneHint(value) {
  if (!value) return '';
  return String(value).trim();
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
        message_text: message.trim(),
        voice_url: normalizePhoneHint(voiceUrl),
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
      setSuccess('Voice file uploaded successfully.');
    } catch (error) {
      setErr(error?.response?.data?.error || error.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="premium-card campaign-card" onSubmit={handleCreate}>
      <div className="card-kicker">New campaign</div>
      <h3>Create Campaign</h3>
      <p className="muted">Build a voice or SMS campaign. Use a public MP3 URL or upload an audio file to Supabase Storage.</p>

      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: June refill reminder" required />
      </label>

      <div className="two-col">
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="voice">Voice</option>
            <option value="sms">SMS</option>
          </select>
        </label>

        <label className="field">
          <span>Max Attempts</span>
          <input type="number" min="1" value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>{type === 'voice' ? 'Fallback text / TTS message' : 'SMS Message'}</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the message here" />
      </label>

      {type === 'voice' && (
        <div className="upload-panel">
          <label className="field">
            <span>Voice file</span>
            <input type="file" accept="audio/*" onChange={handleFileUpload} />
          </label>
          {uploading && <div className="inline-note">Uploading audio...</div>}

          <label className="field">
            <span>Voice URL</span>
            <input
              value={voiceUrl}
              onChange={(event) => setVoiceUrl(event.target.value)}
              placeholder="Paste public MP3 URL or upload a file"
            />
          </label>
        </div>
      )}

      <label className="field">
        <span>Retry Delay (minutes)</span>
        <input type="number" min="1" value={retry} onChange={(event) => setRetry(event.target.value)} />
      </label>

      <button className="primary-button full" type="submit" disabled={creating || uploading}>
        {creating ? 'Creating campaign...' : 'Create Campaign'}
      </button>

      {success && <div className="alert success-alert">{success}</div>}
      {err && <div className="alert error-alert">{err}</div>}
    </form>
  );
}
