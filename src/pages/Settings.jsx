import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useHfToken } from '../hooks/useHfToken';

export default function Settings() {
  const [token, setToken] = useHfToken();
  const [draft, setDraft] = useState(token);
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Connect Qwen for better copy. Configure SMTP on the server for real email.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>Qwen (AI copy)</h2>
          <p className="muted">
            Without a token, Cycle still writes solid template messages. With a Hugging Face token,
            messages are personalized by Qwen.
          </p>
          <form
            className="grid"
            style={{ marginTop: '0.9rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              setToken(draft.trim());
              setStatus('Token saved in this browser.');
            }}
          >
            <label className="field">
              Hugging Face token
              <input
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="hf_..."
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Save
            </button>
          </form>
          <p className="status ok">{status}</p>
        </section>

        <section className="card">
          <h2>Email delivery</h2>
          <p className="muted">
            SMTP configured: <strong>{health?.smtpConfigured ? 'yes' : 'no'}</strong>
          </p>
          <pre className="msg" style={{ marginTop: '0.75rem' }}>
{`SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=...
SMTP_FROM=You <you@example.com>
HF_TOKEN=hf_...`}
          </pre>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            LinkedIn cannot be auto-sent without LinkedIn’s restricted APIs — Cycle drafts the
            message, opens the profile, and schedules AI follow-ups after you confirm send.
          </p>
        </section>
      </div>
    </div>
  );
}
