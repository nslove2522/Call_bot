import React, { useState } from 'react';
import { createCampaign, uploadFile } from '../api';

export default function CampaignCreate({ authToken, onCreated }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('voice');
  const [messageText, setMessageText] = useState('');
  const [voiceUrl, setVoiceUrl] = useState('');
  const [voiceFile, setVoiceFile] = useState(null);
  const [retryDelay, setRetryDelay] = useState(1);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let finalVoiceUrl = voiceUrl.trim();
      if (voiceFile) {
        const uploadRes = await uploadFile(voiceFile, authToken);
        finalVoiceUrl = uploadRes.data.url;
      }

      const payload = {
        name: name.trim(),
        type,
        message_text: messageText,
        voice_url: finalVoiceUrl,
        retry_delay_minutes: Number(retryDelay),
        max_attempts: Number(maxAttempts),
      };

      const res = await createCampaign(payload, authToken);
      const campaignId = res.data.id;
      if (!campaignId) throw new Error('Campaign was created but no id was returned. Backend is being dramatic.');
      onCreated(campaignId);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel premium-form" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow red">New campaign</span>
          <h2>Create Campaign</h2>
          <p className="muted">Upload an MP3, paste a public voice URL, or use fallback text-to-speech.</p>
        </div>
      </div>

      <div className="form-grid">
        <div className="field span-2">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Example: June refill reminder" />
        </div>

        <div className="field">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="voice">Voice</option>
            <option value="sms">SMS</option>
          </select>
        </div>

        <div className="field">
          <label>Max Attempts</label>
          <input type="number" min="1" max="10" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
        </div>

        <div className="field span-2">
          <label>Fallback text / TTS message</label>
          <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Write the message here" />
        </div>

        <div className="field upload-zone span-2">
          <label>Voice file</label>
          <input type="file" accept="audio/*,.mp3,.wav" onChange={(e) => setVoiceFile(e.target.files?.[0] || null)} />
          <p className="hint">Uploaded files go to Supabase Storage. Use public MP3 URLs for fastest testing.</p>
        </div>

        <div className="field span-2">
          <label>Voice URL</label>
          <input value={voiceUrl} onChange={(e) => setVoiceUrl(e.target.value)} placeholder="https://.../message.mp3" />
        </div>

        <div className="field">
          <label>Retry Delay Minutes</label>
          <input type="number" min="1" value={retryDelay} onChange={(e) => setRetryDelay(e.target.value)} />
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}

      <button className="btn btn-primary btn-large" disabled={loading} type="submit">
        {loading ? 'Creating...' : 'Create campaign'}
      </button>
    </form>
  );
}
