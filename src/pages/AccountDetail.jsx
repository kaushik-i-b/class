import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import HeatBadge from '../components/HeatBadge';

export default function AccountDetail() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [touches, setTouches] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.account(id);
    setAccount(data.account);
    setTouches(data.touches || []);
  }

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
  }, [id]);

  async function enrich() {
    setBusy(true);
    setStatus('Running enrichment pipeline…');
    try {
      await api.enrichAccount(id);
      await load();
      setStatus('Core fields refreshed from site + heuristics.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function bumpSignal(key, delta) {
    if (!account) return;
    const signals = {
      ...account.signals,
      [key]: Math.max(0, Math.min(key === 'icpFit' ? 30 : 20, (account.signals?.[key] || 0) + delta)),
    };
    await api.updateAccount(id, { signals });
    await load();
  }

  if (!account) return <p className="status">{status || 'Loading account…'}</p>;

  const b = account.scoreBreakdown || {};

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="muted">
            <Link to="/accounts">Accounts</Link> / {account.name}
          </p>
          <h1>{account.name}</h1>
          <p>
            {account.website} · <HeatBadge tier={account.heatTier} score={account.heatScore} />
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={busy} onClick={enrich} type="button">
            {busy ? 'Enriching…' : 'Run enrichment'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <section className="card stack">
          <h2>Enrichment layer</h2>
          <p className="muted">
            Coverage {account.enrichment?.coverage ?? 0}% · source {account.enrichment?.source || '—'}
          </p>
          <table className="table">
            <tbody>
              <tr>
                <th>Industry</th>
                <td>{account.industry || '—'}</td>
              </tr>
              <tr>
                <th>Company size</th>
                <td>{account.employeeCount || '—'}</td>
              </tr>
              <tr>
                <th>Funding</th>
                <td>{account.funding || '—'}</td>
              </tr>
              <tr>
                <th>Tech stack</th>
                <td>{(account.techStack || []).join(', ') || '—'}</td>
              </tr>
              <tr>
                <th>Key contact</th>
                <td>
                  {account.keyContact?.name} · {account.keyContact?.title}
                  <div className="muted">{account.keyContact?.email}</div>
                </td>
              </tr>
              <tr>
                <th>Custom signal</th>
                <td>{account.customSignal?.value || '—'}</td>
              </tr>
            </tbody>
          </table>
          <p className={`status ${status.includes('refreshed') ? 'ok' : ''}`}>{status}</p>
        </section>

        <section className="stack">
          <div className="card">
            <h2>Heat score</h2>
            <p className="muted">Signals feed the score; score decides outreach eligibility.</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', margin: '0.4rem 0' }}>
              {account.heatScore}
            </p>
            <table className="table">
              <tbody>
                <tr>
                  <td>ICP fit</td>
                  <td>{b.icpFit}</td>
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => bumpSignal('icpFit', 2)}>
                      +
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>Site visits</td>
                  <td>{b.siteVisits}</td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => bumpSignal('siteVisits', 2)}
                    >
                      +
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>Content engagement</td>
                  <td>{b.contentEngagement}</td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => bumpSignal('contentEngagement', 2)}
                    >
                      +
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>Replies</td>
                  <td>{b.replies}</td>
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => bumpSignal('replies', 2)}>
                      +
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>Coverage bonus</td>
                  <td>{b.coverageBonus}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Touches</h3>
            <div className="stack" style={{ marginTop: '0.75rem' }}>
              {touches.length === 0 && <p className="muted">No outreach logged yet.</p>}
              {touches.map((t) => (
                <div className="touch" key={t.id}>
                  <div>
                    <span className="badge">{t.status}</span> · {t.channel}
                  </div>
                  <strong>{t.subject}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
