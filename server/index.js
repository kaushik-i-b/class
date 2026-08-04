import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { id, now, readDb, updateDb, writeDb } from './store.js';
import { seedIfEmpty } from './seed.js';
import { writeScore, latestScore, enrichmentCoverage, COVERAGE_GATE, rescoreAll } from './scoring.js';
import { enrichAccount } from './enrichment.js';
import { draftOutreach, renderTemplate } from './outreach.js';
import { buildDashboard } from './analytics.js';
import { appendEvent, materializeFeatures } from './features.js';
import { enqueueSequence, processTierTriggers, isInCooldown } from './action.js';
import { resolveAccount, normalizeDomain } from './identity.js';
import { scrapeUrl } from './scrape.js';
import { analyzeWithQwen } from './qwen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 8787;

// Force reseed when architecture tables are missing
const boot = readDb();
if (!boot.events?.length || !boot.scores?.length) {
  seedIfEmpty(true);
} else {
  seedIfEmpty(false);
}

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
    architecture: ['SoR', 'Enrichment', 'FeatureStore', 'ScoringEngine', 'ActionLayer', 'Analytics'],
    coverageGate: COVERAGE_GATE,
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
  const accounts = [...db.accounts]
    .map((a) => {
      const score = latestScore(db, a.id);
      return {
        ...a,
        heatScore: score?.score ?? a.heatScore,
        heatTier: score?.tier ?? a.heatTier,
        score_gated: score?.gated || false,
        latest_score_id: score?.id || null,
      };
    })
    .sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
  res.json({ ok: true, accounts });
});

app.get('/api/accounts/:id', (req, res) => {
  const db = readDb();
  const account = db.accounts.find((a) => a.id === req.params.id);
  if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });
  const score = latestScore(db, account.id);
  const features = materializeFeatures(db, account.id);
  const events = (db.events || []).filter((e) => e.account_id === account.id).slice(0, 40);
  const scoreHistory = (db.scores || []).filter((s) => s.account_id === account.id).slice(0, 10);
  const touches = db.touches.filter((t) => t.accountId === account.id);
  const queue = (db.action_queue || []).filter((q) => q.account_id === account.id);
  res.json({
    ok: true,
    account: {
      ...account,
      heatScore: score?.score ?? account.heatScore,
      heatTier: score?.tier ?? account.heatTier,
    },
    score,
    features,
    events,
    scoreHistory,
    touches,
    queue,
    cooldown: isInCooldown(db, account.id),
  });
});

app.post('/api/accounts', (req, res) => {
  const { name, domain, website } = req.body || {};
  if (!name || (!domain && !website)) {
    return res.status(400).json({ ok: false, error: 'name and domain are required' });
  }

  const account = {
    id: id(),
    account_id: null,
    name,
    domain: normalizeDomain(domain || website),
    website: website || `https://${normalizeDomain(domain)}`,
    industry: '',
    employeeCount: '',
    funding: '',
    techStack: [],
    keyContact: { name: '', title: '', email: '', linkedin: '' },
    customSignal: null,
    icpFitScore: 30,
    signals: { icpFit: 9 },
    enrichment: { coverage: 0, lastEnrichedAt: null, source: null, fieldConfidence: {} },
    createdAt: now(),
    updatedAt: now(),
  };
  account.account_id = account.id;

  updateDb((db) => {
    db.accounts.unshift(account);
    writeScore(db, account, null);
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
    if (req.body.signals?.icpFit != null) {
      merged.icpFitScore = Math.round((Number(req.body.signals.icpFit) / 30) * 100);
    }
    const prevTier = latestScore(db, merged.id)?.tier || merged.heatTier;
    writeScore(db, merged, prevTier);
    db.accounts[idx] = merged;
    updated = merged;
    return db;
  });
  if (!updated) return res.status(404).json({ ok: false, error: 'Account not found' });
  res.json({ ok: true, account: updated, score: latestScore(readDb(), updated.id) });
});

app.post('/api/accounts/:id/enrich', async (req, res) => {
  try {
    let enriched = null;
    await new Promise((resolve, reject) => {
      updateDb((db) => {
        // sync shell — enrichment is async, so we do it outside; placeholder
        return db;
      });
      resolve();
    });

    const db = readDb();
    const account = db.accounts.find((a) => a.id === req.params.id);
    if (!account) return res.status(404).json({ ok: false, error: 'Account not found' });

    enriched = await enrichAccount(account, db);
    const idx = db.accounts.findIndex((a) => a.id === account.id);
    db.accounts[idx] = enriched;
    writeDb(db);

    res.json({
      ok: true,
      account: enriched,
      score: latestScore(db, enriched.id),
      coverageGate: COVERAGE_GATE,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Enrichment failed' });
  }
});

app.post('/api/accounts/:id/events', (req, res) => {
  const { signal_type, value = 1, source = 'manual' } = req.body || {};
  if (!signal_type) return res.status(400).json({ ok: false, error: 'signal_type required' });

  let event = null;
  let score = null;
  updateDb((db) => {
    const account = db.accounts.find((a) => a.id === req.params.id);
    if (!account) return db;
    event = appendEvent(db, {
      account_id: account.id,
      signal_type,
      value,
      source,
      timestamp: now(),
    });
    const prev = latestScore(db, account.id)?.tier;
    score = writeScore(db, account, prev);
    return db;
  });
  if (!event) return res.status(404).json({ ok: false, error: 'Account not found' });
  res.status(201).json({ ok: true, event, score });
});

app.post('/api/identity/resolve', (req, res) => {
  const result = resolveAccount(readDb(), req.body || {});
  res.json({ ok: true, ...result });
});

app.post('/api/score/recompute', (_req, res) => {
  let rows = [];
  let triggers = [];
  updateDb((db) => {
    rows = rescoreAll(db);
    triggers = processTierTriggers(db, { mode: 'draft' });
    return db;
  });
  res.json({ ok: true, scores: rows.length, triggers, dashboard: buildDashboard(readDb()) });
});

app.get('/api/scores', (_req, res) => {
  const db = readDb();
  const latest = db.accounts.map((a) => latestScore(db, a.id)).filter(Boolean);
  res.json({ ok: true, scores: latest });
});

app.get('/api/events', (req, res) => {
  const db = readDb();
  let events = db.events || [];
  if (req.query.account_id) {
    events = events.filter((e) => e.account_id === req.query.account_id);
  }
  res.json({ ok: true, events: events.slice(0, 200) });
});

app.get('/api/action-queue', (_req, res) => {
  const db = readDb();
  const queue = (db.action_queue || []).map((q) => ({
    ...q,
    account: db.accounts.find((a) => a.id === q.account_id) || null,
    sequence: db.sequences.find((s) => s.id === q.sequence_id) || null,
  }));
  res.json({ ok: true, queue });
});

app.post('/api/action/enqueue', (req, res) => {
  const { account_id, sequence_id, mode = 'draft' } = req.body || {};
  let result = null;
  updateDb((db) => {
    result = enqueueSequence(db, { account_id, sequence_id, mode });
    return db;
  });
  const status = result?.ok ? 201 : 400;
  res.status(status).json(result);
});

app.post('/api/action/process-triggers', (_req, res) => {
  let results = [];
  updateDb((db) => {
    results = processTierTriggers(db, { mode: 'draft' });
    return db;
  });
  res.json({ ok: true, results });
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
  // Enroll by latest score tier — never raw signals
  const accountIds = db.accounts
    .filter((a) => (latestScore(db, a.id)?.tier || a.heatTier) === sequence.heatTier)
    .filter((a) => {
      const s = latestScore(db, a.id);
      return s && !s.refused && !s.gated;
    })
    .map((a) => a.id);

  const campaign = {
    id: id(),
    name,
    sequenceId,
    sprintId: activeSprint?.id || null,
    variant_id: null,
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

      const score = latestScore(db, accountId);
      const coverage = account.enrichment?.coverage ?? enrichmentCoverage(account);

      // Data quality gate before automation (§2.2 / build sequencing)
      if (!score || score.refused || score.gated || coverage < COVERAGE_GATE) {
        drafts.push({
          accountId,
          skipped: true,
          reason: `Coverage/score gate — ${score?.gateReason || coverage + '% < ' + COVERAGE_GATE + '%'}`,
        });
        continue;
      }

      const drafted = await draftOutreach({
        account,
        sequenceStep: step,
        token: tokenFrom(req),
        useAi,
      });

      const contact = db.contacts.find((c) => c.account_id === accountId);
      const touch = {
        id: id(),
        accountId,
        contact_id: contact?.id || null,
        campaignId: campaign.id,
        sequence_id: sequence.id,
        variant_id: campaign.variant_id || null,
        channel: step.channel,
        subject: drafted.subject,
        body: drafted.body,
        status: 'drafted',
        score_at_send_time: score.score,
        tier_at_send_time: score.tier,
        score_version: score.score_version,
        score_id: score.id,
        createdAt: now(),
        sentAt: null,
        outcomeAt: null,
        signalToTouchHours: null,
        signal_crossed_at: score.computed_at,
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
    const existing = db.touches[idx];
    const crossed = existing.signal_crossed_at
      ? (Date.now() - new Date(existing.signal_crossed_at).getTime()) / 36e5
      : 6;
    touch = {
      ...existing,
      status: 'sent',
      sentAt: now(),
      // Preserve score_at_send_time from draft — essential for attribution (§2.6)
      score_at_send_time: existing.score_at_send_time ?? latestScore(db, existing.accountId)?.score,
      tier_at_send_time: existing.tier_at_send_time ?? latestScore(db, existing.accountId)?.tier,
      signalToTouchHours: Math.round(crossed * 10) / 10,
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
  if (!['replied', 'meeting', 'opportunity', 'sent'].includes(status)) {
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
    if (campaign && (status === 'meeting' || status === 'opportunity')) {
      campaign.stats.meetings = (campaign.stats.meetings || 0) + 1;
    }

    // Feedback loop → feature store as labeled training data (§2.6)
    const signalType =
      status === 'replied'
        ? 'email_reply'
        : status === 'meeting'
          ? 'meeting_booked'
          : status === 'opportunity'
            ? 'opportunity_created'
            : null;
    if (signalType) {
      appendEvent(db, {
        account_id: touch.accountId,
        signal_type: signalType,
        value: 1,
        source: 'analytics_feedback',
        timestamp: now(),
      });
      const account = db.accounts.find((a) => a.id === touch.accountId);
      if (account) {
        const prev = latestScore(db, account.id)?.tier;
        writeScore(db, account, prev);
      }
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
  const {
    name,
    variantA,
    variantB,
    metric = 'reply_rate',
    hypothesis = '',
    targetSegment = 'hot',
  } = req.body || {};
  if (!name || !variantA || !variantB) {
    return res.status(400).json({ ok: false, error: 'name, variantA, variantB required' });
  }
  const experiment = {
    id: id(),
    sprintId: req.params.id,
    variant_id: id(),
    name,
    hypothesis,
    variantA,
    variantB,
    messageCopy: { A: variantA, B: variantB },
    targetSegment,
    metric,
    lift: 0,
    sampleSize: 0,
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
    contacts: db.contacts?.length || 0,
    events: db.events?.length || 0,
    scores: db.scores?.length || 0,
    action_queue: db.action_queue?.length || 0,
    sequences: db.sequences.length,
    campaigns: db.campaigns.length,
    sprints: db.sprints.length,
    touches: db.touches.length,
  };
}
