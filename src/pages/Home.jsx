import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .overview()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="status error">{error}</p>;
  if (!data) return <p className="status">Loading…</p>;

  const o = data.overview;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p>Find leads by scraping → AI writes email + LinkedIn → auto follow-up.</p>
        </div>
        <Link className="btn btn-primary" to="/campaigns/new">
          New campaign
        </Link>
      </div>

      {!o.smtpConfigured && (
        <div className="banner">
          SMTP is not configured — emails will be <strong>simulated</strong> (marked sent, not
          delivered). Add SMTP_* env vars on the server for real delivery. LinkedIn always needs one
          click to send.
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <label>Campaigns</label>
          <strong>{o.campaigns}</strong>
        </div>
        <div className="kpi">
          <label>Leads</label>
          <strong>{o.leads}</strong>
        </div>
        <div className="kpi">
          <label>Queued / sent</label>
          <strong>
            {o.queued}/{o.sent}
          </strong>
        </div>
      </div>

      <section className="card">
        <h2>Your campaigns</h2>
        {data.campaigns.length === 0 ? (
          <div className="empty">
            <p>No campaigns yet.</p>
            <Link className="btn btn-primary" to="/campaigns/new">
              Create your first campaign
            </Link>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ICP / offer</th>
                <th>Channels</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/campaigns/${c.id}`}>
                      <strong>{c.name}</strong>
                    </Link>
                  </td>
                  <td className="muted">
                    {c.icp || '—'}
                    <div>{c.offer || '—'}</div>
                  </td>
                  <td className="muted">{(c.channels || []).join(', ')}</td>
                  <td>
                    <Link className="btn btn-ghost" to={`/campaigns/${c.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
