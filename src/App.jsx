import { useEffect, useState } from 'react';
import SettingsModal from './components/SettingsModal.jsx';
import ScrapeWorkspace from './components/ScrapeWorkspace.jsx';
import { useHfToken } from './hooks/useHfToken.js';
import { getHealth } from './lib/api.js';

export default function App() {
  const [token, setToken] = useHfToken();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverReady, setServerReady] = useState(null);

  useEffect(() => {
    getHealth()
      .then((health) => setServerReady(health))
      .catch(() => setServerReady({ ok: false }));
  }, []);

  function scrollToWorkspace() {
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Qwin home">
          <div className="brand-mark">
            Qw<span>in</span>
          </div>
          <div className="brand-tag">AI web scraper</div>
        </a>
        <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)}>
          {token || serverReady?.hasServerToken ? 'Token ready' : 'Add HF token'}
        </button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-visual" aria-hidden="true" />
          <h1>
            Scrape the web.
            <br />
            <em>Think with Qwen.</em>
          </h1>
          <p>
            Qwin pulls readable content from any public page, then uses the Qwen model to summarize,
            extract facts, and answer questions grounded in the source.
          </p>
          <div className="cta-row">
            <button type="button" className="btn btn-primary" onClick={scrollToWorkspace}>
              Start scraping
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
              Connect Qwen
            </button>
          </div>
        </section>

        <ScrapeWorkspace token={token} onNeedToken={() => setSettingsOpen(true)} />
      </main>

      <SettingsModal
        open={settingsOpen}
        token={token}
        onClose={() => setSettingsOpen(false)}
        onSave={setToken}
      />
    </div>
  );
}
