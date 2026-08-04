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
          <p>Connect Qwen for personalized outreach drafts. Scraping/enrichment works without it.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Qwen / Hugging Face</h2>
          <p className="muted">
            Model: {health?.model || 'Qwen/Qwen2.5-7B-Instruct'} · server token{' '}
            {health?.hasServerToken ? 'present' : 'missing'}
          </p>
          <form
            className="form-grid"
            style={{ marginTop: '1rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              setToken(draft.trim());
              setStatus('Token saved in this browser.');
            }}
          >
            <label className="field">
              HF token
              <input
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="hf_..."
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Save token
            </button>
          </form>
          <p className="status ok">{status}</p>
          <p className="muted">
            Create a token with Inference Providers access at{' '}
            <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
              huggingface.co/settings/tokens
            </a>
            .
          </p>
        </section>

        <section className="card">
          <h2>Demo data</h2>
          <p className="muted">Reset the local system-of-record seed for a clean walkthrough.</p>
          <button
            className="btn btn-ghost"
            type="button"
            style={{ marginTop: '1rem' }}
            onClick={async () => {
              await api.reseed();
              setStatus('Demo data reseeded. Reload pages to refresh.');
            }}
          >
            Reseed demo workspace
          </button>
        </section>
      </div>
    </div>
  );
}
