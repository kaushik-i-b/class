import { useMemo, useState } from 'react';
import { analyzePage, scrapePage } from '../lib/api';

const ACTIONS = [
  { id: 'summarize', label: 'Summarize' },
  { id: 'keypoints', label: 'Key points' },
  { id: 'extract', label: 'Extract data' },
  { id: 'qa', label: 'Ask Qwen' },
];

export default function ScrapeWorkspace({ token, onNeedToken }) {
  const [url, setUrl] = useState('https://en.wikipedia.org/wiki/Web_scraping');
  const [page, setPage] = useState(null);
  const [mode, setMode] = useState('summarize');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [modelUsed, setModelUsed] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const status = useMemo(() => {
    if (error) return { className: 'status-line error', text: error };
    if (busy === 'scrape') return { className: 'status-line loading', text: 'Scraping page…' };
    if (busy === 'analyze') return { className: 'status-line loading', text: 'Asking Qwen…' };
    if (page) return { className: 'status-line', text: `Ready · ${page.wordCount} words extracted` };
    return { className: 'status-line', text: 'Paste a URL to scrape, then run Qwen on the content.' };
  }, [busy, error, page]);

  async function handleScrape(event) {
    event.preventDefault();
    setError('');
    setAnswer('');
    setModelUsed('');
    setBusy('scrape');
    try {
      const data = await scrapePage(url);
      setPage(data.page);
    } catch (err) {
      setPage(null);
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function runAnalysis(nextMode = mode) {
    if (!page) {
      setError('Scrape a page first.');
      return;
    }

    setMode(nextMode);
    setError('');
    setBusy('analyze');
    try {
      const data = await analyzePage({
        page,
        mode: nextMode,
        question,
        token,
      });
      setAnswer(data.answer);
      setModelUsed(data.model || '');
    } catch (err) {
      if (err.code === 'NO_TOKEN' || err.status === 401) {
        onNeedToken?.();
      }
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section id="workspace" className="workspace">
      <div className="panel">
        <h2>Scrape a page</h2>
        <p className="lede">Fetch live HTML, extract readable text, then analyze it with Qwen.</p>
        <form className="scrape-form" onSubmit={handleScrape}>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/article"
            aria-label="Page URL"
            required
          />
          <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>
            {busy === 'scrape' ? 'Scraping…' : 'Scrape'}
          </button>
        </form>
        <div className={status.className}>{status.text}</div>
      </div>

      {page && (
        <div className="results-grid">
          <article className="panel">
            <h2>{page.title}</h2>
            <div className="meta-row">
              <span className="chip">{page.wordCount} words</span>
              <a href={page.url} target="_blank" rel="noreferrer">
                {page.url}
              </a>
            </div>
            {page.description && <p className="lede">{page.description}</p>}
            <div className="source-text">{page.text}</div>
            {page.links?.length > 0 && (
              <div className="links">
                {page.links.slice(0, 8).map((link) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </article>

          <aside className="panel">
            <h2>Ask Qwen</h2>
            <p className="lede">Summarize, extract structure, or ask a grounded question.</p>
            <div className="actions">
              {ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={`action ${mode === action.id ? 'active' : ''}`}
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (action.id === 'qa') {
                      setMode('qa');
                      return;
                    }
                    runAnalysis(action.id);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>

            {mode === 'qa' && (
              <form
                className="qa-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  runAnalysis('qa');
                }}
              >
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="What is this page mainly about?"
                  aria-label="Question for Qwen"
                />
                <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>
                  {busy === 'analyze' ? 'Thinking…' : 'Ask Qwen'}
                </button>
              </form>
            )}

            <div className={`answer ${answer ? '' : 'empty'}`}>
              {answer || 'Qwen’s analysis will appear here.'}
            </div>
            {modelUsed && <p className="hint">Model: {modelUsed}</p>}
          </aside>
        </div>
      )}
    </section>
  );
}
