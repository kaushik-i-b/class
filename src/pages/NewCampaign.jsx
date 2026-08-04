import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function NewCampaign() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    icp: 'B2B SaaS founders / Heads of Growth',
    offer: 'AI outbound that finds leads and follows up automatically',
    channels: ['email', 'linkedin'],
    followUpDays: '3,7',
  });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  function toggleChannel(ch) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const followUpDays = form.followUpDays
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => n > 0);
      const data = await api.createCampaign({
        name: form.name,
        icp: form.icp,
        offer: form.offer,
        channels: form.channels,
        followUpDays: followUpDays.length ? followUpDays : [3, 7],
      });
      navigate(`/campaigns/${data.campaign.id}`);
    } catch (err) {
      setStatus(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New campaign</h1>
          <p>Define who you target and what you offer. Then scrape leads into it.</p>
        </div>
      </div>

      <form className="card grid" style={{ maxWidth: 640 }} onSubmit={onSubmit}>
        <label className="field">
          Campaign name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Q3 SaaS outbound"
          />
        </label>
        <label className="field">
          Who are you targeting? (ICP)
          <textarea
            rows={2}
            value={form.icp}
            onChange={(e) => setForm({ ...form, icp: e.target.value })}
          />
        </label>
        <label className="field">
          What are you offering?
          <textarea
            rows={2}
            value={form.offer}
            onChange={(e) => setForm({ ...form, offer: e.target.value })}
          />
        </label>
        <div className="field">
          Channels
          <div className="row">
            <button
              type="button"
              className={`btn ${form.channels.includes('email') ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => toggleChannel('email')}
            >
              Email
            </button>
            <button
              type="button"
              className={`btn ${form.channels.includes('linkedin') ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => toggleChannel('linkedin')}
            >
              LinkedIn
            </button>
          </div>
        </div>
        <label className="field">
          Auto follow-up days (comma-separated)
          <input
            value={form.followUpDays}
            onChange={(e) => setForm({ ...form, followUpDays: e.target.value })}
            placeholder="3,7"
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !form.channels.length} type="submit">
          {busy ? 'Creating…' : 'Create campaign'}
        </button>
        <p className="status error">{status}</p>
      </form>
    </div>
  );
}
