import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import HeatBadge from '../components/HeatBadge';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.dashboard(), api.accounts()])
      .then(([dash, acc]) => {
        setData(dash.dashboard);
        setAccounts(acc.accounts.slice(0, 6));
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
          GTM as a product: enrich → score → trigger → measure. Every two weeks you know what was
          tested and what moved the needle.
        </p>
      </section>

      <div className="grid-kpi">
        <div className="kpi">
          <label>Speed-to-lead</label>
          <strong>{kpis.speedToLeadHours ?? '—'}h</strong>
          <small>Signal → first outreach</small>
        </div>
        <div className="kpi">
          <label>Data coverage</label>
          <strong>{kpis.dataCoverage}%</strong>
          <small>Core enrichment fields</small>
        </div>
        <div className="kpi">
          <label>Heat → conversion</label>
          <strong>{kpis.heatToConversion}%</strong>
          <small>Hot accounts that replied/met</small>
        </div>
        <div className="kpi">
          <label>Sprint velocity</label>
          <strong>{kpis.sprintVelocity}</strong>
          <small>Experiments / sprint</small>
        </div>
        <div className="kpi">
          <label>Lift / experiment</label>
          <strong>{Math.round((kpis.liftPerExperiment || 0) * 100)}%</strong>
          <small>Avg reply/meeting lift</small>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Accounts by heat</h2>
          <p className="muted">Composite score — not a single-signal trigger.</p>
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
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/accounts/${a.id}`}>{a.name}</Link>
                    <div className="muted">{a.industry}</div>
                  </td>
                  <td>
                    <HeatBadge tier={a.heatTier} score={a.heatScore} />
                  </td>
                  <td>{a.enrichment?.coverage ?? 0}%</td>
                  <td className="muted">{a.customSignal?.value || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="stack">
          <div className="card">
            <h2>Live campaigns</h2>
            <p className="muted">{data.liveCampaigns} sequences running this sprint.</p>
            <p style={{ marginTop: '1rem' }}>
              <Link className="btn btn-primary" to="/campaigns">
                Open action layer
              </Link>
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
                <ul className="muted">
                  {(data.activeSprint.tested || []).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No active sprint.</p>
            )}
            <p>
              <Link to="/sprints">Sprint board →</Link>
            </p>
          </div>

          <div className="card">
            <h3>Recent experiments</h3>
            <div className="stack" style={{ marginTop: '0.75rem' }}>
              {(data.recentExperiments || []).map((e) => (
                <div key={e.id}>
                  <strong>{e.name}</strong>
                  <div className="muted">
                    {e.variantA} vs {e.variantB} · lift {Math.round((e.lift || 0) * 100)}%
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
