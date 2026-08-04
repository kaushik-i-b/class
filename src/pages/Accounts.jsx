import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import HeatBadge from '../components/HeatBadge';

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.accounts();
    setAccounts(data.accounts);
  }

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
  }, []);

  async function onCreate(event) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      await api.createAccount({ name, domain });
      setName('');
      setDomain('');
      await load();
      setStatus('Account added. Enrich before enrolling in sequences.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function enrichOne(id) {
    setBusy(true);
    setStatus('Enriching…');
    try {
      await api.enrichAccount(id);
      await load();
      setStatus('Enrichment complete. Heat score recalculated.');
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
          <h1>System of record</h1>
          <p>Accounts & contacts first. Clean enrichment before any automation.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Accounts</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Heat</th>
                <th>Coverage</th>
                <th>Score gate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/accounts/${a.id}`}>{a.name}</Link>
                    <div className="muted">
                      {a.domain} · {a.industry || 'Unenriched'}
                    </div>
                  </td>
                  <td>
                    <HeatBadge tier={a.heatTier} score={a.heatScore} />
                  </td>
                  <td>{a.enrichment?.coverage ?? 0}%</td>
                  <td>
                    {a.score_gated ? (
                      <span className="badge">gated &lt;60%</span>
                    ) : (
                      <span className="badge good">pass</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => enrichOne(a.id)}
                      type="button"
                    >
                      Enrich
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Add account</h2>
          <p className="muted">Domain powers the enrichment scrape.</p>
          <form className="form-grid" onSubmit={onCreate} style={{ marginTop: '1rem' }}>
            <label className="field">
              Company name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              Domain
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="acme.com"
                required
              />
            </label>
            <button className="btn btn-primary" disabled={busy} type="submit">
              Create account
            </button>
          </form>
          <p className={`status ${status.includes('complete') || status.includes('added') ? 'ok' : ''}`}>
            {status}
          </p>
        </section>
      </div>
    </div>
  );
}
