import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import HeatBadge from '../components/HeatBadge';

export default function AccountDetail() {
  const { id } = useParams();
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.account(id);
    setPayload(data);
  }

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
  }, [id]);

  async function enrich() {
    setBusy(true);
    setStatus('Running waterfall enrichment…');
    try {
      await api.enrichAccount(id);
      await load();
      setStatus('Enrichment complete — score rewritten to versioned table.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function emit(signal_type) {
    setBusy(true);
    try {
      await api.addEvent(id, { signal_type, value: 1 });
      await load();
      setStatus(`Logged ${signal_type} → features rematerialized → score updated.`);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!payload?.account) return <p className="status">{status || 'Loading account…'}</p>;

  const { account, score, features, events, scoreHistory, touches, cooldown } = payload;
  const quality = account.fieldQuality || {};

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
            {score?.gated ? ' · gated' : ''}
            {cooldown ? ' · cooldown' : ''}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={busy} onClick={enrich} type="button">
            {busy ? 'Working…' : 'Run enrichment'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <section className="card stack">
          <h2>Enrichment contract</h2>
          <p className="muted">
            Coverage {account.enrichment?.coverage ?? 0}% · gate {score?.gated ? 'ON' : 'off'} ·{' '}
            {account.enrichment?.source || '—'}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Industry</td>
                <td>{account.industry || '—'}</td>
                <td>{fmtConf(quality.industry)}</td>
              </tr>
              <tr>
                <td>Employees</td>
                <td>{account.employeeCount || '—'}</td>
                <td>{fmtConf(quality.employee_count)}</td>
              </tr>
              <tr>
                <td>Funding</td>
                <td>{account.funding || '—'}</td>
                <td>{fmtConf(quality.funding)}</td>
              </tr>
              <tr>
                <td>Tech stack</td>
                <td>{(account.techStack || []).join(', ') || '—'}</td>
                <td>{fmtConf(quality.tech_stack)}</td>
              </tr>
              <tr>
                <td>Key contact</td>
                <td>
                  {account.keyContact?.name || '—'} · {account.keyContact?.title}
                </td>
                <td>{fmtConf(quality.key_contact)}</td>
              </tr>
              <tr>
                <td>Custom signal</td>
                <td>{account.customSignal?.value || '—'}</td>
                <td>{fmtConf(quality.custom_signal)}</td>
              </tr>
              <tr>
                <td>ICP fit (rule)</td>
                <td>{account.icpFitScore ?? '—'}</td>
                <td>{fmtConf(quality.icp_fit_score)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="stack">
          <div className="card">
            <h2>Versioned score</h2>
            <p className="muted">
              {score?.score_version || '—'} · computed{' '}
              {score?.computed_at ? new Date(score.computed_at).toLocaleString() : '—'}
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', margin: '0.4rem 0' }}>
              {account.heatScore}
            </p>
            {score?.gateReason && <p className="status error">{score.gateReason}</p>}
            <table className="table">
              <tbody>
                {Object.entries(score?.normalized || {}).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v}</td>
                    <td className="muted">w={score?.weights?.[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Feature store (decayed)</h3>
            <table className="table">
              <tbody>
                <tr>
                  <td>Site visits (7d)</td>
                  <td>{features?.site_visits_7d}</td>
                </tr>
                <tr>
                  <td>Site visits decayed</td>
                  <td>{features?.site_visits_decayed}</td>
                </tr>
                <tr>
                  <td>Replies decayed</td>
                  <td>{features?.replies_decayed}</td>
                </tr>
                <tr>
                  <td>Content decayed</td>
                  <td>{features?.content_engagement_decayed}</td>
                </tr>
              </tbody>
            </table>
            <div className="actions" style={{ marginTop: '0.75rem' }}>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => emit('site_visit')}>
                + site visit
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => emit('content_download')}
              >
                + content
              </button>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => emit('email_reply')}>
                + reply
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <section className="card">
          <h3>Event log</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>When</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {(events || []).slice(0, 12).map((e) => (
                <tr key={e.id}>
                  <td>{e.signal_type}</td>
                  <td className="muted">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="muted">{e.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>Score history + touches</h3>
          <div className="stack">
            {(scoreHistory || []).slice(0, 4).map((s) => (
              <div key={s.id} className="muted">
                {s.tier} · {s.score} · {s.previous_tier ? `from ${s.previous_tier}` : 'seed'} ·{' '}
                {new Date(s.computed_at).toLocaleString()}
              </div>
            ))}
            {(touches || []).map((t) => (
              <div className="touch" key={t.id}>
                <span className="badge">{t.status}</span> {t.subject}
                <div className="muted">
                  score@send {t.score_at_send_time ?? '—'} · {t.tier_at_send_time || '—'}
                </div>
              </div>
            ))}
          </div>
          <p className={`status ${status.includes('complete') || status.includes('Logged') ? 'ok' : ''}`}>
            {status}
          </p>
        </section>
      </div>
    </div>
  );
}

function fmtConf(field) {
  if (!field || field.confidence == null) return '—';
  return `${Math.round(field.confidence * 100)}%`;
}
