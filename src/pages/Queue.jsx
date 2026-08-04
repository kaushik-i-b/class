import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useHfToken } from '../hooks/useHfToken';

export default function Queue() {
  const [token] = useHfToken();
  const [messages, setMessages] = useState([]);
  const [smtp, setSmtp] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.queue();
    setMessages(data.messages);
    setSmtp(data.smtpConfigured);
  }

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
    const t = setInterval(() => load().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, []);

  async function processNow() {
    setBusy(true);
    try {
      const result = await api.processDue(token);
      await load();
      setStatus(`Processed ${result.processed} due messages.`);
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
          <h1>Send queue</h1>
          <p>Email sends automatically when due. LinkedIn needs copy → send → confirm.</p>
        </div>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={processNow}>
          {busy ? 'Processing…' : 'Process due now'}
        </button>
      </div>

      {!smtp && (
        <div className="banner">
          No SMTP configured — email sends are simulated. Set SMTP_HOST, SMTP_USER, SMTP_PASS,
          SMTP_FROM on the server for real delivery.
        </div>
      )}

      <section className="card">
        {messages.length === 0 ? (
          <div className="empty">
            Queue empty. <Link to="/">Open a campaign</Link> and run AI outreach.
          </div>
        ) : (
          <div className="grid" style={{ gap: '0.75rem' }}>
            {messages.map((m) => (
              <div className="msg" key={m.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>
                      {m.campaign?.name} → {m.lead?.name} · {m.channel}
                    </strong>
                    <div className="muted">
                      Step {m.step} · <span className={`badge ${m.status}`}>{m.status}</span>
                      {m.scheduledAt ? ` · ${new Date(m.scheduledAt).toLocaleString()}` : ''}
                      {m.delivery?.simulated ? ' · simulated email' : ''}
                    </div>
                  </div>
                  <div className="row">
                    {(m.status === 'queued' || m.status === 'draft') && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={async () => {
                          await api.regenerate(m.id, token);
                          await load();
                        }}
                      >
                        Regen AI
                      </button>
                    )}
                    {m.status === 'awaiting_linkedin_send' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-warn"
                          onClick={() => {
                            navigator.clipboard?.writeText(m.body);
                            if (m.lead?.linkedinUrl) window.open(m.lead.linkedinUrl, '_blank');
                          }}
                        >
                          Copy + open LinkedIn
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={async () => {
                            await api.linkedInSent(m.id, token);
                            await load();
                          }}
                        >
                          Mark sent
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {m.subject && <div style={{ marginTop: '0.4rem' }}>Subject: {m.subject}</div>}
                <pre>{m.body}</pre>
              </div>
            ))}
          </div>
        )}
        <p className="status">{status}</p>
      </section>
    </div>
  );
}
