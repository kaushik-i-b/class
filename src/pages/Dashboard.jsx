import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import HeatBadge from '../components/HeatBadge';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.dashboard(), api.accounts(), api.actionQueue()])
      .then(([dash, acc, q]) => {
        setData(dash.dashboard);
        setAccounts(acc.accounts.slice(0, 8));
        setQueue(q.queue.slice(0, 5));
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="status error">{error}</p>;
  if (!data) return <p className="status">Loading operating system…</p>;

  const total = Math.max(data.accountCount, 1);
  const kpis = data.kpis;

  return (
    <div>
      <section className="hero-strip">
        <h1>Cycle</h1>
        <p>
          Signals → feature store → versioned score → action. Enrichment before automation. Tier
          transitions trigger outreach — never raw signals.
        </p>
        <p className="muted" style={{ marginTop: '0.55rem' }}>
          Pipeline: {(data.architecture || []).join(' → ')} · score {data.scoreVersion || '—'} ·{' '}
          {data.eventCount || 0} events
        </p>
      </section>

      <div className="grid-kpi">
        <div className="kpi">
          <label>Speed-to-lead</label>
          <strong>{kpis.speedToLeadHours ?? '—'}h</strong>
          <small>first outreach − signal threshold</small>
        </div>
        <div className="kpi">
          <label>Data coverage</label>
          <strong>{kpis.dataCoverage}%</strong>
          <small>gates scoring (&lt;60% discounted)</small>
        </div>
        <div className="kpi">
          <label>Heat → conversion</label>
          <strong>{kpis.heatToConversion}%</strong>
          <small>{kpis.heatToConversionWindowDays || 60}d attribution window</small>
        </div>
        <div className="kpi">
          <label>Sprint velocity</label>
          <strong>{kpis.sprintVelocity}</strong>
          <small>experiments / sprint</small>
        </div>
        <div className="kpi">
          <label>Lift / experiment</label>
          <strong>{Math.round((kpis.liftPerExperiment || 0) * 100)}%</strong>
          <small>
            {kpis.liftDirectionalOnly ? 'directional (low n)' : 'with sample volume'}
          </small>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Accounts by heat tier</h2>
          <p className="muted">Percentile tiers from the scoring engine table — Action never reads raw signals.</p>
          <div className="tier-bars">
            {['hot', 'warm', 'cold'].map((tier) => (
              <div className="tier-row" key={tier}>
                <span className={`badge ${tier}`}>{tier}</span>
                <div className={`bar ${tier}`}>
                  <i style={{ width: `${((data.tiers[tier] || 0) / total) * 100}%` }} />
                </div>
                <strong>{data.tiers[tier] || 0}</strong>
              </div>
            ))}
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Heat</th>
                <th>Coverage</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/accounts/${a.id}`}>{a.name}</Link>
                    <div className="muted">{a.industry || 'Unenriched'}</div>
                  </td>
                  <td>
                    <HeatBadge tier={a.heatTier} score={a.heatScore} />
                  </td>
                  <td>{a.enrichment?.coverage ?? 0}%</td>
                  <td>
                    {a.score_gated ? (
                      <span className="badge">gated</span>
                    ) : (
                      <span className="badge good">open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="stack">
          <div className="card">
            <h2>Action queue</h2>
            <p className="muted">
              {data.queuedActions || 0} queued · tier-transition enqueue with 14d cooldown
            </p>
            <div className="stack" style={{ marginTop: '0.75rem' }}>
              {queue.length === 0 && <p className="muted">No queued triggers.</p>}
              {queue.map((q) => (
                <div className="touch" key={q.id}>
                  <strong>{q.account?.name || q.account_id}</strong>
                  <div className="muted">
                    {q.reason} · tier {q.tier_at_enqueue} · score {q.score_at_enqueue}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: '0.8rem' }}>
              <Link to="/campaigns">Open action layer →</Link>
            </p>
          </div>

          <div className="card">
            <h2>Active sprint</h2>
            {data.activeSprint ? (
              <>
                <h3>{data.activeSprint.name}</h3>
                <p className="muted">{data.activeSprint.hypothesis}</p>
                <p style={{ marginTop: '0.8rem' }}>
                  <span className="badge live">in flight</span>
                </p>
              </>
            ) : (
              <p className="muted">No active sprint.</p>
            )}
            <p>
              <Link to="/sprints">Sprint board →</Link>
            </p>
          </div>

          <div className="card">
            <h3>Experiments (variant objects)</h3>
            <div className="stack" style={{ marginTop: '0.75rem' }}>
              {(data.recentExperiments || []).map((e) => (
                <div key={e.id}>
                  <strong>{e.name}</strong>
                  <div className="muted">
                    {e.variantA} vs {e.variantB} · lift {Math.round((e.lift || 0) * 100)}%
                    {(e.sampleSize || 0) < 100 ? ' · directional' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
