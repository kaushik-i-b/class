import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { id, now, readDb, updateDb } from './store.js';
import { seedIfEmpty } from './seed.js';
import { applyScore } from './scoring.js';
import { enrichAccount } from './enrichment.js';
import { draftOutreach, renderTemplate } from './outreach.js';
import { buildDashboard } from './analytics.js';
import { scrapeUrl } from './scrape.js';
import { analyzeWithQwen } from './qwen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 8787;

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function tokenFrom(req) {
  return req.get('x-hf-token') || req.body?.token || process.env.HF_TOKEN;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'cycle',
    product: 'GTM Engineering OS',
    model: process.env.QWEN_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    hasServerToken: Boolean(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN),
  });
});

app.post('/api/seed', (_req, res) => {
  const db = seedIfEmpty(true);
  res.json({ ok: true, counts: summarize(db) });
});

app.get('/api/dashboard', (_req, res) => {
  res.json({ ok: true, dashboard: buildDashboard(readDb()) });
});

app.get('/api/accounts', (_req, res) => {
  const db = readDb();
  const accounts = [...db.accounts].sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
  res.json({ ok: true, accounts });
});

app.get('/api/accounts/:id', (req, res) => {
  const account = readDb().accounts.find((a) => a.id === req.params.id);
  if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
  const db = readDb();
  const touches = db.touches.filter((t) => t.accountId === account.id);
  res.json({ ok: true, account, touches });
});

app.post('/api/accounts', (req, res) => {
  const { name, domain, website } = req.body || {};
  if (!name || (!domain && !website)) {
    return res.status(400).json({ ok: false, error: 'name and domain are required' });
  }

  const account = applyScore({
    id: id(),
    name,
    domain: (domain || website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    website: website || `https://${domain}`,
    industry: '',
    employeeCount: '',
    funding: '',
    techStack: [],
    keyContact: { name: '', title: '', email: '', linkedin: '' },
    customSignal: null,
    signals: { icpFit: 10, siteVisits: 0, contentEngagement: 0, replies: 0 },
    enrichment: { coverage: 0, lastEnrichedAt: null, source: null },
    createdAt: now(),
    updatedAt: now(),
  });

  updateDb((db) => {
    db.accounts.unshift(account);
    return db;
  });

  res.status(201).json({ ok: true, account });
});

app.patch('/api/accounts/:id', (req, res) => {
  let updated = null;
  updateDb((db) => {
    const idx = db.accounts.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return db;
    const merged = {
      ...db.accounts[idx],
      ...req.body,
      signals: { ...db.accounts[idx].signals, ...(req.body.signals || {}) },
      keyContact: { ...db.accounts[idx].keyContact, ...(req.body.keyContact || {}) },
      updatedAt: now(),
    };
    updated = applyScore(merged);
    db.accounts[idx] = updated;
    return db;
  });
  if (!updated) return res.status(404).json({ ok: false, error: 'Account not found' });
  res.json({ ok: true, account: updated });
});

app.post('/api/accounts/:id/enrich', async (req, res) => {
  try {
    const db = readDb();
    const account = db.accounts.find((a) => a.id === req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });

    const enriched = await enrichAccount(account);
    updateDb((d) => {
      const idx = d.accounts.findIndex((a) => a.id === account.id);
      d.accounts[idx] = { ...enriched, updatedAt: now() };
      return d;
    });
    res.json({ ok: true, account: enriched });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Enrichment failed' });
  }
});

app.post('/api/enrich/all', async (_req, res) => {
  const db = readDb();
  const results = [];
  for (const account of db.accounts) {
    try {
      const enriched = await enrichAccount(account);
      results.push({ id: account.id, ok: true, coverage: enriched.enrichment.coverage });
      updateDb((d) => {
        const idx = d.accounts.findIndex((a) => a.id === account.id);
        d.accounts[idx] = { ...enriched, updatedAt: now() };
        return d;
      });
    } catch (error) {
      results.push({ id: account.id, ok: false, error: error.message });
    }
  }
  res.json({ ok: true, results, dashboard: buildDashboard(readDb()) });
});

app.get('/api/sequences', (_req, res) => {
  res.json({ ok: true, sequences: readDb().sequences });
});

app.patch('/api/sequences/:id', (req, res) => {
  let sequence = null;
  updateDb((db) => {
    const idx = db.sequences.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return db;
    sequence = { ...db.sequences[idx], ...req.body };
    db.sequences[idx] = sequence;
    return db;
  });
  if (!sequence) return res.status(404).json({ ok: false, error: 'Sequence not found' });
  res.json({ ok: true, sequence });
});

app.get('/api/campaigns', (_req, res) => {
  const db = readDb();
  const campaigns = db.campaigns.map((c) => ({
    ...c,
    sequence: db.sequences.find((s) => s.id === c.sequenceId) || null,
    sprint: db.sprints.find((s) => s.id === c.sprintId) || null,
    accounts: db.accounts.filter((a) => c.accountIds.includes(a.id)),
  }));
  res.json({ ok: true, campaigns });
});

app.post('/api/campaigns', (req, res) => {
  const { name, sequenceId, mode = 'draft' } = req.body || {};
  const db = readDb();
  const sequence = db.sequences.find((s) => s.id === sequenceId);
  if (!name || !sequence) {
    return res.status(400).json({ ok: false, error: 'name and valid sequenceId required' });
  }

  const activeSprint = db.sprints.find((s) => s.status === 'active');
  const accountIds = db.accounts
    .filter((a) => a.heatTier === sequence.heatTier)
    .map((a) => a.id);

  const campaign = {
    id: id(),
    name,
    sequenceId,
    sprintId: activeSprint?.id || null,
    accountIds,
    mode,
    status: 'live',
    createdAt: now(),
    stats: { drafted: 0, sent: 0, replies: 0, meetings: 0 },
  };

  updateDb((d) => {
    d.campaigns.unshift(campaign);
    return d;
  });

  res.status(201).json({ ok: true, campaign });
});

app.post('/api/campaigns/:id/draft', async (req, res) => {
  try {
    const db = readDb();
    const campaign = db.campaigns.find((c) => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    const sequence = db.sequences.find((s) => s.id === campaign.sequenceId);
    if (!sequence) return res.status(400).json({ ok: false, error: 'Sequence missing' });

    const step = sequence.steps[0];
    const useAi = req.body?.useAi !== false;
    const drafts = [];

    for (const accountId of campaign.accountIds) {
      const account = db.accounts.find((a) => a.id === accountId);
      if (!account) continue;
      // Data quality gate: skip thin records
      if ((account.enrichment?.coverage ?? 0) < 50) {
        drafts.push({
          accountId,
          skipped: true,
          reason: 'Enrichment coverage below 50% — clean data before automation',
        });
        continue;
      }

      const drafted = await draftOutreach({
        account,
        sequenceStep: step,
        token: tokenFrom(req),
        useAi,
      });

      const touch = {
        id: id(),
        accountId,
        campaignId: campaign.id,
        channel: step.channel,
        subject: drafted.subject,
        body: drafted.body,
        status: 'drafted',
        createdAt: now(),
        sentAt: null,
        outcomeAt: null,
        signalToTouchHours: null,
        draftMeta: { mode: drafted.mode, model: drafted.model, warning: drafted.warning },
      };

      updateDb((d) => {
        d.touches.unshift(touch);
        const c = d.campaigns.find((x) => x.id === campaign.id);
        if (c) c.stats.drafted = (c.stats.drafted || 0) + 1;
        return d;
      });

      drafts.push({ accountId, touch, skipped: false });
    }

    res.json({ ok: true, drafts });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Draft failed' });
  }
});

app.post('/api/touches/:id/send', (req, res) => {
  let touch = null;
  updateDb((db) => {
    const idx = db.touches.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return db;
    touch = {
      ...db.touches[idx],
      status: 'sent',
      sentAt: now(),
      signalToTouchHours: db.touches[idx].signalToTouchHours ?? 6,
    };
    db.touches[idx] = touch;
    const campaign = db.campaigns.find((c) => c.id === touch.campaignId);
    if (campaign) campaign.stats.sent = (campaign.stats.sent || 0) + 1;
    return db;
  });
  if (!touch) return res.status(404).json({ ok: false, error: 'Touch not found' });
  res.json({ ok: true, touch });
});

app.post('/api/touches/:id/outcome', (req, res) => {
  const status = req.body?.status;
  if (!['replied', 'meeting', 'sent'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid outcome status' });
  }
  let touch = null;
  updateDb((db) => {
    const idx = db.touches.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return db;
    touch = { ...db.touches[idx], status, outcomeAt: now() };
    db.touches[idx] = touch;
    const campaign = db.campaigns.find((c) => c.id === touch.campaignId);
    if (campaign && status === 'replied') campaign.stats.replies = (campaign.stats.replies || 0) + 1;
    if (campaign && status === 'meeting') campaign.stats.meetings = (campaign.stats.meetings || 0) + 1;
    const account = db.accounts.find((a) => a.id === touch.accountId);
    if (account && (status === 'replied' || status === 'meeting')) {
      account.signals = {
        ...account.signals,
        replies: Math.min(20, (account.signals?.replies || 0) + 4),
      };
      const scored = applyScore(account);
      Object.assign(account, scored);
    }
    return db;
  });
  if (!touch) return res.status(404).json({ ok: false, error: 'Touch not found' });
  res.json({ ok: true, touch });
});

app.get('/api/sprints', (_req, res) => {
  const db = readDb();
  const sprints = db.sprints.map((s) => ({
    ...s,
    experiments: db.experiments.filter((e) => e.sprintId === s.id),
    campaigns: db.campaigns.filter((c) => c.sprintId === s.id),
  }));
  res.json({ ok: true, sprints });
});

app.post('/api/sprints', (req, res) => {
  const { name, hypothesis } = req.body || {};
  if (!name || !hypothesis) {
    return res.status(400).json({ ok: false, error: 'name and hypothesis required' });
  }
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 13);
  const sprint = {
    id: id(),
    name,
    hypothesis,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status: 'active',
    tested: [],
    results: { repliesDelta: 0, meetingsDelta: 0, notes: 'Just started.' },
  };
  updateDb((db) => {
    db.sprints.forEach((s) => {
      if (s.status === 'active') s.status = 'completed';
    });
    db.sprints.unshift(sprint);
    return db;
  });
  res.status(201).json({ ok: true, sprint });
});

app.post('/api/sprints/:id/experiments', (req, res) => {
  const { name, variantA, variantB, metric = 'reply_rate' } = req.body || {};
  if (!name || !variantA || !variantB) {
    return res.status(400).json({ ok: false, error: 'name, variantA, variantB required' });
  }
  const experiment = {
    id: id(),
    sprintId: req.params.id,
    name,
    variantA,
    variantB,
    metric,
    lift: 0,
    shippedAt: now(),
    status: 'running',
  };
  let ok = false;
  updateDb((db) => {
    const sprint = db.sprints.find((s) => s.id === req.params.id);
    if (!sprint) return db;
    ok = true;
    db.experiments.unshift(experiment);
    sprint.tested = [...(sprint.tested || []), name];
    return db;
  });
  if (!ok) return res.status(404).json({ ok: false, error: 'Sprint not found' });
  res.status(201).json({ ok: true, experiment });
});

app.patch('/api/experiments/:id', (req, res) => {
  let experiment = null;
  updateDb((db) => {
    const idx = db.experiments.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return db;
    experiment = { ...db.experiments[idx], ...req.body };
    db.experiments[idx] = experiment;
    return db;
  });
  if (!experiment) return res.status(404).json({ ok: false, error: 'Experiment not found' });
  res.json({ ok: true, experiment });
});

app.get('/api/touches', (_req, res) => {
  const db = readDb();
  const touches = db.touches.map((t) => ({
    ...t,
    account: db.accounts.find((a) => a.id === t.accountId) || null,
    campaign: db.campaigns.find((c) => c.id === t.campaignId) || null,
  }));
  res.json({ ok: true, touches });
});

// Keep scraper utilities available for enrichment debugging / research
app.post('/api/scrape', async (req, res) => {
  try {
    const page = await scrapeUrl(req.body?.url);
    res.json({ ok: true, page });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Scrape failed' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { page, mode, question, model } = req.body || {};
    if (!page?.text || !page?.url || !page?.title) {
      return res.status(400).json({ ok: false, error: 'Scraped page payload is required' });
    }
    const result = await analyzeWithQwen({
      page,
      mode,
      question,
      token: tokenFrom(req),
      model,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.code === 'NO_TOKEN' ? 401 : error.status || 500;
    res.status(status).json({
      ok: false,
      error: error.message || 'Analysis failed',
      code: error.code || 'ANALYZE_ERROR',
    });
  }
});

app.post('/api/preview-template', (req, res) => {
  const { accountId, sequenceId, stepIndex = 0 } = req.body || {};
  const db = readDb();
  const account = db.accounts.find((a) => a.id === accountId);
  const sequence = db.sequences.find((s) => s.id === sequenceId);
  if (!account || !sequence) {
    return res.status(400).json({ ok: false, error: 'account and sequence required' });
  }
  const step = sequence.steps[stepIndex] || sequence.steps[0];
  res.json({
    ok: true,
    subject: renderTemplate(step.subjectTemplate, account),
    body: renderTemplate(step.bodyTemplate, account),
  });
});

if (isProd) {
  const distDir = path.join(rootDir, 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Cycle GTM OS listening on http://localhost:${PORT}`);
});

function summarize(db) {
  return {
    accounts: db.accounts.length,
    sequences: db.sequences.length,
    campaigns: db.campaigns.length,
    sprints: db.sprints.length,
    touches: db.touches.length,
  };
}
