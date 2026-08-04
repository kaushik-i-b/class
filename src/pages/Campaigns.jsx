import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useHfToken } from '../hooks/useHfToken';
import HeatBadge from '../components/HeatBadge';

export default function Campaigns() {
  const [token] = useHfToken();
  const [campaigns, setCampaigns] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [touches, setTouches] = useState([]);
  const [queue, setQueue] = useState([]);
  const [name, setName] = useState('');
  const [sequenceId, setSequenceId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    const [c, s, t, q] = await Promise.all([
      api.campaigns(),
      api.sequences(),
      api.touches(),
      api.actionQueue(),
    ]);
    setCampaigns(c.campaigns);
    setSequences(s.sequences);
    setTouches(t.touches);
    setQueue(q.queue);
    if (!sequenceId && s.sequences[0]) setSequenceId(s.sequences[0].id);
  }

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
  }, []);

  async function createCampaign(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createCampaign({ name, sequenceId, mode: 'draft' });
      setName('');
      await load();
      setStatus('Campaign created for matching heat-tier accounts.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function draft(id) {
    setBusy(true);
    setStatus('Drafting personalized outreach (Qwen when token present)…');
    try {
      const result = await api.draftCampaign(id, { useAi: true }, token);
      const skipped = result.drafts.filter((d) => d.skipped).length;
      const made = result.drafts.filter((d) => !d.skipped).length;
      await load();
      setStatus(`Drafted ${made}. Skipped ${skipped} for low enrichment coverage.`);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function send(touchId) {
    await api.sendTouch(touchId);
    await load();
  }

  async function outcome(touchId, value) {
    await api.touchOutcome(touchId, value);
    await load();
  }

  async function saveSequence() {
    if (!editing) return;
    setBusy(true);
    try {
      await api.updateSequence(editing.id, editing);
      setEditing(null);
      await load();
      setStatus('Sequence updated.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Action layer</h1>
          <p>Templated, editable sequences tied to heat tier — draft-for-review by default.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Live campaigns</h2>
          <div className="stack" style={{ marginTop: '0.9rem' }}>
            {campaigns.map((c) => (
              <div className="touch" key={c.id}>
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{c.name}</strong>
                    <div className="muted">
                      {c.sequence?.name} · <HeatBadge tier={c.sequence?.heatTier} /> ·{' '}
                      <span className="badge live">{c.status}</span>
                    </div>
                  </div>
                  <button className="btn btn-primary" disabled={busy} type="button" onClick={() => draft(c.id)}>
                    Draft touches
                  </button>
                </div>
                <div className="muted" style={{ marginTop: '0.55rem' }}>
                  {c.accountIds?.length || 0} accounts · drafted {c.stats?.drafted || 0} · sent{' '}
                  {c.stats?.sent || 0} · replies {c.stats?.replies || 0}
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '1.4rem' }}>Launch campaign</h3>
          <form className="form-grid" onSubmit={createCampaign}>
            <label className="field">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              Sequence
              <select value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.heatTier})
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" disabled={busy} type="submit">
              Create
            </button>
          </form>
          <p className="status">{status}</p>
        </section>

        <section className="stack">
          <div className="card">
            <h2>Sequences</h2>
            <p className="muted">Edit templates — tokens like {'{{company}}'} and {'{{signal}}'}.</p>
            <div className="stack" style={{ marginTop: '0.8rem' }}>
              {sequences.map((s) => (
                <div className="touch" key={s.id}>
                  <div className="actions" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{s.name}</strong>
                      <div className="muted">
                        <HeatBadge tier={s.heatTier} /> · {s.steps.length} steps · {s.status}
                      </div>
                    </div>
                    <button className="btn btn-ghost" type="button" onClick={() => setEditing(structuredClone(s))}>
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editing && (
            <div className="card">
              <h3>Edit sequence</h3>
              <div className="form-grid" style={{ marginTop: '0.75rem' }}>
                <label className="field">
                  Name
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </label>
                {(editing.steps || []).map((step, idx) => (
                  <div key={idx} className="form-grid">
                    <label className="field">
                      Step {idx + 1} subject
                      <input
                        value={step.subjectTemplate}
                        onChange={(e) => {
                          const steps = [...editing.steps];
                          steps[idx] = { ...step, subjectTemplate: e.target.value };
                          setEditing({ ...editing, steps });
                        }}
                      />
                    </label>
                    <label className="field">
                      Body
                      <textarea
                        rows={4}
                        value={step.bodyTemplate}
                        onChange={(e) => {
                          const steps = [...editing.steps];
                          steps[idx] = { ...step, bodyTemplate: e.target.value };
                          setEditing({ ...editing, steps });
                        }}
                      />
                    </label>
                  </div>
                ))}
                <div className="actions">
                  <button className="btn btn-primary" type="button" onClick={saveSequence}>
                    Save sequence
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Tier-transition queue</h2>
        <p className="muted">
          enqueue_sequence(account, sequence, mode) — triggered by Warm→Hot / Cold→Warm only, with
          14-day cooldown.
        </p>
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          {queue.length === 0 && <p className="muted">No queued actions.</p>}
          {queue.slice(0, 8).map((q) => (
            <div className="touch" key={q.id}>
              <strong>{q.account?.name || q.account_id}</strong>
              <div className="muted">
                {q.reason} · {q.mode} · score@{q.score_at_enqueue} ({q.tier_at_enqueue}) ·{' '}
                {q.sequence?.name}
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn btn-ghost"
          type="button"
          style={{ marginTop: '0.75rem' }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.processTriggers();
              await load();
              setStatus(`Processed ${r.results?.length || 0} tier transitions.`);
            } catch (err) {
              setStatus(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Process tier triggers
        </button>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Draft queue & outcomes</h2>
        <p className="muted">
          Each touch stores score_at_send_time for attribution. Outcomes write back to the feature
          store.
        </p>
        <div className="stack" style={{ marginTop: '0.85rem' }}>
          {touches.slice(0, 12).map((t) => (
            <div className="touch" key={t.id}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{t.account?.name || 'Account'}</strong>
                  <div className="muted">
                    {t.subject} · <span className="badge">{t.status}</span> · score@send{' '}
                    {t.score_at_send_time ?? '—'}
                  </div>
                </div>
                <div className="actions">
                  {t.status === 'drafted' && (
                    <button className="btn btn-primary" type="button" onClick={() => send(t.id)}>
                      Mark sent
                    </button>
                  )}
                  {t.status === 'sent' && (
                    <>
                      <button className="btn btn-ghost" type="button" onClick={() => outcome(t.id, 'replied')}>
                        Reply
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={() => outcome(t.id, 'meeting')}>
                        Meeting
                      </button>
                    </>
                  )}
                </div>
              </div>
              <pre>{t.body}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
