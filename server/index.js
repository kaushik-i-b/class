import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { id, now, readDb, updateDb, writeDb } from './store.js';
import { findLeads } from './leads.js';
import { craftMessages } from './messages.js';
import { enqueueInitialOutreach, processDueMessages, confirmLinkedInSent } from './followups.js';
import { smtpConfigured, mailFrom } from './mailer.js';
import { scrapeUrl } from './scrape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 8787;

// Reset legacy architecture DB to campaign schema if needed
(() => {
  const db = readDb();
  if (db.meta?.version !== 2) {
    writeDb({
      campaigns: [],
      leads: [],
      messages: [],
      meta: { version: 2, seededAt: now() },
    });
  }
})();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function tokenFrom(req) {
  return req.get('x-hf-token') || req.body?.token || process.env.HF_TOKEN;
}

app.get('/api/health', (_req, res) => {
  const db = readDb();
  res.json({
    ok: true,
    service: 'cycle',
    product: 'Campaign outreach',
    smtpConfigured: smtpConfigured(),
    mailFrom: smtpConfigured() ? mailFrom() : null,
    hasServerToken: Boolean(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN),
    counts: {
      campaigns: db.campaigns.length,
      leads: db.leads.length,
      messages: db.messages.length,
    },
  });
});

app.get('/api/overview', (_req, res) => {
  const db = readDb();
  const queued = db.messages.filter((m) => m.status === 'queued').length;
  const awaiting = db.messages.filter((m) => m.status === 'awaiting_linkedin_send').length;
  const sent = db.messages.filter((m) => m.status === 'sent').length;
  res.json({
    ok: true,
    overview: {
      campaigns: db.campaigns.length,
      leads: db.leads.length,
      queued,
      awaitingLinkedIn: awaiting,
      sent,
      smtpConfigured: smtpConfigured(),
    },
    campaigns: db.campaigns,
  });
});

app.get('/api/campaigns', (_req, res) => {
  const db = readDb();
  const campaigns = db.campaigns.map((c) => ({
    ...c,
    leadCount: db.leads.filter((l) => l.campaignId === c.id).length,
    queuedCount: db.messages.filter((m) => m.campaignId === c.id && m.status === 'queued').length,
    sentCount: db.messages.filter((m) => m.campaignId === c.id && m.status === 'sent').length,
  }));
  res.json({ ok: true, campaigns });
});

app.post('/api/campaigns', (req, res) => {
  const {
    name,
    icp,
    offer,
    channels = ['email', 'linkedin'],
    followUpDays = [3, 7],
  } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Campaign name required' });

  const campaign = {
    id: id(),
    name: name.trim(),
    icp: (icp || '').trim(),
    offer: (offer || '').trim(),
    channels,
    followUpDays,
    status: 'active',
    createdAt: now(),
  };

  updateDb((db) => {
    db.campaigns.unshift(campaign);
    return db;
  });

  res.status(201).json({ ok: true, campaign });
});

app.get('/api/campaigns/:id', (req, res) => {
  const db = readDb();
  const campaign = db.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
  const leads = db.leads.filter((l) => l.campaignId === campaign.id);
  const messages = db.messages
    .filter((m) => m.campaignId === campaign.id)
    .map((m) => ({
      ...m,
      lead: leads.find((l) => l.id === m.leadId) || null,
    }));
  res.json({ ok: true, campaign, leads, messages });
});

app.patch('/api/campaigns/:id', (req, res) => {
  let campaign = null;
  updateDb((db) => {
    const idx = db.campaigns.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return db;
    campaign = { ...db.campaigns[idx], ...req.body };
    db.campaigns[idx] = campaign;
    return db;
  });
  if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
  res.json({ ok: true, campaign });
});

app.post('/api/campaigns/:id/find-leads', async (req, res) => {
  try {
    const db = readDb();
    const campaign = db.campaigns.find((c) => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    const { urls = [], keyword = '' } = req.body || {};
    const found = await findLeads({ urls, keyword });

    const saved = [];
    updateDb((d) => {
      for (const lead of found.leads) {
        const duplicate = d.leads.some(
          (l) =>
            l.campaignId === campaign.id &&
            ((lead.email && l.email === lead.email) ||
              (lead.linkedinUrl && l.linkedinUrl === lead.linkedinUrl))
        );
        if (duplicate) continue;
        const row = {
          id: id(),
          campaignId: campaign.id,
          name: lead.name,
          title: lead.title || '',
          company: lead.company || '',
          email: lead.email || '',
          linkedinUrl: lead.linkedinUrl || '',
          domain: lead.domain || '',
          sourceUrl: lead.sourceUrl || '',
          snippet: lead.snippet || '',
          status: 'new',
          createdAt: now(),
        };
        d.leads.unshift(row);
        saved.push(row);
      }
      return d;
    });

    res.json({
      ok: true,
      added: saved.length,
      leads: saved,
      scrapedUrls: found.scrapedUrls,
      errors: found.errors,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Lead finding failed' });
  }
});

app.post('/api/campaigns/:id/leads', (req, res) => {
  const db = readDb();
  const campaign = db.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });

  const { name, email, company, title, linkedinUrl } = req.body || {};
  if (!name || (!email && !linkedinUrl)) {
    return res.status(400).json({ ok: false, error: 'Name and email or LinkedIn URL required' });
  }

  const lead = {
    id: id(),
    campaignId: campaign.id,
    name,
    title: title || '',
    company: company || '',
    email: (email || '').toLowerCase(),
    linkedinUrl: linkedinUrl || '',
    domain: email ? email.split('@')[1] : '',
    sourceUrl: '',
    snippet: 'Manually added',
    status: 'new',
    createdAt: now(),
  };

  updateDb((d) => {
    d.leads.unshift(lead);
    return d;
  });

  res.status(201).json({ ok: true, lead });
});

app.post('/api/campaigns/:id/enqueue', async (req, res) => {
  try {
    const channels = req.body?.channels || ['email', 'linkedin'];
    const leadIds = req.body?.leadIds || [];
    const created = await enqueueInitialOutreach({
      campaignId: req.params.id,
      leadIds,
      channels,
      token: tokenFrom(req),
    });
    res.json({ ok: true, created: created.length, messages: created });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Enqueue failed' });
  }
});

app.post('/api/messages/:id/regenerate', async (req, res) => {
  try {
    const db = readDb();
    const msg = db.messages.find((m) => m.id === req.params.id);
    if (!msg) return res.status(404).json({ ok: false, error: 'Message not found' });
    const lead = db.leads.find((l) => l.id === msg.leadId);
    const campaign = db.campaigns.find((c) => c.id === msg.campaignId);
    const crafted = await craftMessages({
      campaign,
      lead,
      step: msg.step,
      channel: msg.channel,
      token: tokenFrom(req),
    });
    updateDb((d) => {
      const m = d.messages.find((x) => x.id === msg.id);
      m.subject = crafted.subject;
      m.body = crafted.body;
      m.meta = { mode: crafted.mode, model: crafted.model, warning: crafted.warning };
      return d;
    });
    res.json({ ok: true, message: { ...msg, ...crafted } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.patch('/api/messages/:id', (req, res) => {
  let message = null;
  updateDb((db) => {
    const idx = db.messages.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return db;
    message = { ...db.messages[idx], ...req.body };
    db.messages[idx] = message;
    return db;
  });
  if (!message) return res.status(404).json({ ok: false, error: 'Message not found' });
  res.json({ ok: true, message });
});

app.post('/api/messages/process-due', async (req, res) => {
  try {
    const result = await processDueMessages({ token: tokenFrom(req) });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/messages/:id/linkedin-sent', async (req, res) => {
  try {
    await confirmLinkedInSent(req.params.id, tokenFrom(req));
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/leads/:id/replied', (req, res) => {
  updateDb((db) => {
    const lead = db.leads.find((l) => l.id === req.params.id);
    if (!lead) return db;
    lead.status = 'replied';
    // Cancel queued follow-ups
    for (const m of db.messages) {
      if (m.leadId === lead.id && m.status === 'queued') m.status = 'cancelled';
    }
    return db;
  });
  res.json({ ok: true });
});

app.get('/api/queue', (_req, res) => {
  const db = readDb();
  const messages = db.messages.map((m) => ({
    ...m,
    lead: db.leads.find((l) => l.id === m.leadId) || null,
    campaign: db.campaigns.find((c) => c.id === m.campaignId) || null,
  }));
  res.json({ ok: true, messages, smtpConfigured: smtpConfigured() });
});

app.post('/api/scrape', async (req, res) => {
  try {
    const page = await scrapeUrl(req.body?.url);
    res.json({ ok: true, page });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// Background follow-up worker
setInterval(() => {
  processDueMessages({ token: process.env.HF_TOKEN }).catch((err) => {
    console.error('follow-up worker', err.message);
  });
}, 60_000);

if (isProd) {
  const distDir = path.join(rootDir, 'dist');
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cycle outreach listening on http://0.0.0.0:${PORT}`);
});
