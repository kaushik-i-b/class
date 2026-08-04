import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Sprints() {
  const [sprints, setSprints] = useState([]);
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [exp, setExp] = useState({ name: '', variantA: '', variantB: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.sprints();
    setSprints(data.sprints);
  }

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
  }, []);

  const active = sprints.find((s) => s.status === 'active');

  async function createSprint(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createSprint({ name, hypothesis });
      setName('');
      setHypothesis('');
      await load();
      setStatus('New two-week sprint started. Previous sprint closed.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function shipExperiment(event) {
    event.preventDefault();
    if (!active) return;
    setBusy(true);
    try {
      await api.createExperiment(active.id, exp);
      setExp({ name: '', variantA: '', variantB: '' });
      await load();
      setStatus('Experiment shipped into the sprint log.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setLift(id, lift) {
    await api.updateExperiment(id, { lift: Number(lift), status: 'completed' });
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sprint loop</h1>
          <p>Two-week release cycle baked in — what we tested, what moved.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="stack">
          {sprints.map((s) => (
            <article className="card" key={s.id}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h2>{s.name}</h2>
                <span className={`badge ${s.status === 'active' ? 'live' : ''}`}>{s.status}</span>
              </div>
              <p className="muted">{s.hypothesis}</p>
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                {new Date(s.startDate).toLocaleDateString()} →{' '}
                {new Date(s.endDate).toLocaleDateString()}
              </p>

              <h3 style={{ marginTop: '1rem' }}>Tested</h3>
              <ul>
                {(s.tested || []).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>

              <h3>Results</h3>
              <p>
                Replies Δ {Math.round((s.results?.repliesDelta || 0) * 100)}% · Meetings Δ{' '}
                {Math.round((s.results?.meetingsDelta || 0) * 100)}%
              </p>
              <p className="muted">{s.results?.notes}</p>

              <h3 style={{ marginTop: '1rem' }}>Experiments</h3>
              <div className="stack">
                {(s.experiments || []).map((e) => (
                  <div className="touch" key={e.id}>
                    <strong>{e.name}</strong>
                    <div className="muted">
                      A: {e.variantA} · B: {e.variantB}
                    </div>
                    <div className="actions" style={{ marginTop: '0.5rem' }}>
                      <span className="badge">lift {Math.round((e.lift || 0) * 100)}%</span>
                      {e.status === 'running' && (
                        <>
                          <button className="btn btn-ghost" type="button" onClick={() => setLift(e.id, 0.12)}>
                            Log +12% lift
                          </button>
                          <button className="btn btn-ghost" type="button" onClick={() => setLift(e.id, -0.04)}>
                            Log −4% lift
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="stack">
          <div className="card">
            <h2>Start next sprint</h2>
            <form className="form-grid" onSubmit={createSprint} style={{ marginTop: '0.8rem' }}>
              <label className="field">
                Sprint name
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                Hypothesis
                <textarea
                  rows={4}
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  required
                />
              </label>
              <button className="btn btn-primary" disabled={busy} type="submit">
                Open 14-day cycle
              </button>
            </form>
          </div>

          <div className="card">
            <h2>Ship experiment</h2>
            <p className="muted">
              Active: {active ? active.name : 'none'} — sprint velocity is a core KPI.
            </p>
            <form className="form-grid" onSubmit={shipExperiment} style={{ marginTop: '0.8rem' }}>
              <label className="field">
                Experiment
                <input
                  value={exp.name}
                  onChange={(e) => setExp({ ...exp, name: e.target.value })}
                  required
                  disabled={!active}
                />
              </label>
              <label className="field">
                Variant A
                <input
                  value={exp.variantA}
                  onChange={(e) => setExp({ ...exp, variantA: e.target.value })}
                  required
                  disabled={!active}
                />
              </label>
              <label className="field">
                Variant B
                <input
                  value={exp.variantB}
                  onChange={(e) => setExp({ ...exp, variantB: e.target.value })}
                  required
                  disabled={!active}
                />
              </label>
              <button className="btn btn-primary" disabled={busy || !active} type="submit">
                Log experiment
              </button>
            </form>
            <p className="status">{status}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
