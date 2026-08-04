import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useHfToken } from '../hooks/useHfToken';

export default function CampaignDetail() {
  const { id } = useParams();
  const [token] = useHfToken();
  const [data, setData] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [urls, setUrls] = useState('');
  const [manual, setManual] = useState({ name: '', email: '', company: '', linkedinUrl: '' });
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const payload = await api.campaign(id);
    setData(payload);
    setSelected(payload.leads.filter((l) => l.status === 'new').map((l) => l.id));
  }

  useEffect(() => {
    load().catch((err) => setStatus(err.message));
  }, [id]);

  const selectedLeads = useMemo(
    () => (data?.leads || []).filter((l) => selected.includes(l.id)),
    [data, selected]
  );

  async function scrapeLeads(event) {
    event.preventDefault();
    setBusy('scrape');
    setStatus('Scraping the web for leads…');
    try {
      const urlList = urls
        .split(/\n|,/)
        .map((u) => u.trim())
        .filter(Boolean);
      const result = await api.findLeads(id, { keyword, urls: urlList });
      await load();
      setStatus(
        `Added ${result.added} leads from ${result.scrapedUrls} URLs` +
          (result.errors?.length ? ` (${result.errors.length} URL errors)` : '')
      );
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy('');
    }
  }

  async function addManual(event) {
    event.preventDefault();
    setBusy('manual');
    try {
      await api.addLead(id, manual);
      setManual({ name: '', email: '', company: '', linkedinUrl: '' });
      await load();
      setStatus('Lead added.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy('');
    }
  }

  async function startOutreach() {
    setBusy('enqueue');
    setStatus('AI is writing email + LinkedIn messages…');
    try {
      const channels = data.campaign.channels || ['email', 'linkedin'];
      const result = await api.enqueue(
        id,
        { leadIds: selected, channels },
        token
      );
      // Immediately process due (initial messages scheduled now)
      const processed = await api.processDue(token);
      await load();
      setStatus(
        `Queued ${result.created} messages. Processed ${processed.processed} sends/LinkedIn-ready items.`
      );
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy('');
    }
  }

  function toggle(leadId) {
    setSelected((curr) =>
      curr.includes(leadId) ? curr.filter((x) => x !== leadId) : [...curr, leadId]
    );
  }

  if (!data) return <p className="status">{status || 'Loading campaign…'}</p>;
  const { campaign, leads, messages } = data;

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="muted">
            <Link to="/">Campaigns</Link> / {campaign.name}
          </p>
          <h1>{campaign.name}</h1>
          <p>
            {campaign.icp} · {campaign.offer}
          </p>
        </div>
        <div className="row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !selected.length}
            onClick={startOutreach}
          >
            {busy === 'enqueue' ? 'Writing & queueing…' : `AI outreach (${selected.length})`}
          </button>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>1. Find leads (scrape)</h2>
          <p className="muted">Search by keyword and/or paste company URLs. We pull emails + LinkedIn links.</p>
          <form className="grid" style={{ marginTop: '0.85rem' }} onSubmit={scrapeLeads}>
            <label className="field">
              Keyword search
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Series A fintech Head of Growth"
              />
            </label>
            <label className="field">
              Company / contact page URLs (one per line)
              <textarea
                rows={4}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={'https://example.com/contact\nhttps://stripe.com/jobs'}
              />
            </label>
            <button className="btn btn-primary" disabled={Boolean(busy)} type="submit">
              {busy === 'scrape' ? 'Scraping…' : 'Scrape leads'}
            </button>
          </form>

          <h3 style={{ marginTop: '1.2rem' }}>Or add manually</h3>
          <form className="grid" onSubmit={addManual}>
            <div className="grid grid-2">
              <label className="field">
                Name
                <input
                  required
                  value={manual.name}
                  onChange={(e) => setManual({ ...manual, name: e.target.value })}
                />
              </label>
              <label className="field">
                Company
                <input
                  value={manual.company}
                  onChange={(e) => setManual({ ...manual, company: e.target.value })}
                />
              </label>
            </div>
            <label className="field">
              Email
              <input
                type="email"
                value={manual.email}
                onChange={(e) => setManual({ ...manual, email: e.target.value })}
              />
            </label>
            <label className="field">
              LinkedIn URL
              <input
                value={manual.linkedinUrl}
                onChange={(e) => setManual({ ...manual, linkedinUrl: e.target.value })}
              />
            </label>
            <button className="btn btn-ghost" disabled={Boolean(busy)} type="submit">
              Add lead
            </button>
          </form>
        </section>

        <section className="card">
          <h2>2. Leads ({leads.length})</h2>
          <p className="muted">Select who gets AI email + LinkedIn + auto follow-ups.</p>
          <div className="row" style={{ margin: '0.6rem 0' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelected(leads.map((l) => l.id))}
            >
              Select all
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
          {leads.length === 0 ? (
            <div className="empty">Scrape or add leads to get started.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>Lead</th>
                  <th>Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(l.id)}
                        onChange={() => toggle(l.id)}
                      />
                    </td>
                    <td>
                      <strong>{l.name}</strong>
                      <div className="muted">
                        {l.company}
                        {l.title ? ` · ${l.title}` : ''}
                      </div>
                    </td>
                    <td className="muted">
                      {l.email || '—'}
                      <div>
                        {l.linkedinUrl ? (
                          <a href={l.linkedinUrl} target="_blank" rel="noreferrer">
                            LinkedIn
                          </a>
                        ) : (
                          'No LinkedIn'
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${l.status}`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {selectedLeads.length > 0 && (
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Ready: {selectedLeads.filter((l) => l.email).length} with email ·{' '}
              {selectedLeads.filter((l) => l.linkedinUrl).length} with LinkedIn
            </p>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="page-head" style={{ marginBottom: '0.5rem' }}>
          <div>
            <h2>3. Messages & auto follow-ups</h2>
            <p className="muted">
              Follow-ups fire automatically after {(campaign.followUpDays || [3, 7]).join(' / ')} days
              unless the lead is marked replied.
            </p>
          </div>
          <Link className="btn btn-ghost" to="/queue">
            Open full queue
          </Link>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          {messages.length === 0 && <div className="empty">No messages yet — run AI outreach.</div>}
          {messages.slice(0, 12).map((m) => (
            <div className="msg" key={m.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>
                    {m.lead?.name || 'Lead'} · {m.channel}
                  </strong>
                  <div className="muted">
                    Step {m.step} · <span className={`badge ${m.status}`}>{m.status}</span>
                    {m.scheduledAt ? ` · due ${new Date(m.scheduledAt).toLocaleString()}` : ''}
                  </div>
                </div>
                <div className="row">
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
                        Mark LinkedIn sent
                      </button>
                    </>
                  )}
                  {m.lead && m.status === 'sent' && m.lead.status !== 'replied' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={async () => {
                        await api.markReplied(m.lead.id);
                        await load();
                      }}
                    >
                      Mark replied
                    </button>
                  )}
                </div>
              </div>
              {m.subject && <div style={{ marginTop: '0.45rem' }}>Subject: {m.subject}</div>}
              <pre>{m.body}</pre>
            </div>
          ))}
        </div>
        <p className={`status ${status.includes('Added') || status.includes('Queued') ? 'ok' : ''}`}>
          {status}
        </p>
      </section>
    </div>
  );
}
