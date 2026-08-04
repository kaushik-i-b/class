import { id, now, readDb, writeDb } from './store.js';
import { writeScore } from './scoring.js';
import { seedBehavioralEvents } from './features.js';
import { normalizeDomain } from './identity.js';
import { processTierTriggers } from './action.js';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFrom(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function startOfSprint(offsetWeeks = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + toMonday + offsetWeeks * 14);
  return d.toISOString();
}

export function seedIfEmpty(force = false) {
  const existing = readDb();
  if (!force && existing.meta?.seededAt && existing.accounts?.length > 0) return existing;

  const db = {
    accounts: [],
    contacts: [],
    sequences: [],
    campaigns: [],
    touches: [],
    sprints: [],
    experiments: [],
    events: [],
    scores: [],
    action_queue: [],
    meta: { seededAt: now(), score_version: 'v1.linear.decay.2026-08' },
  };

  const rawAccounts = [
    {
      name: 'Northstar Analytics',
      domain: 'example.com',
      website: 'https://example.com',
      industry: 'B2B SaaS',
      employeeCount: '51-200',
      funding: 'Series A',
      techStack: ['React', 'AWS', 'Snowflake'],
      keyContact: {
        name: 'Priya Chen',
        title: 'VP Marketing',
        email: 'priya@example.com',
        linkedin: '',
      },
      customSignal: {
        type: 'hiring_spike',
        value: '3 open GTM roles posted this month',
        detectedAt: daysAgo(3),
      },
      icpFitScore: 88,
      behavior: { siteVisits: 8, replies: 2, content: 3 },
    },
    {
      name: 'Harbor Payments',
      domain: 'stripe.com',
      website: 'https://stripe.com',
      industry: 'Fintech',
      employeeCount: '1000+',
      funding: 'Series C+',
      techStack: ['Ruby', 'AWS', 'Kubernetes'],
      keyContact: {
        name: 'Marcus Lee',
        title: 'Director of Sales Ops',
        email: 'marcus@harbor.example',
        linkedin: '',
      },
      customSignal: {
        type: 'product_usage',
        value: 'Expanded payments stack language on homepage',
        detectedAt: daysAgo(5),
      },
      icpFitScore: 76,
      behavior: { siteVisits: 12, replies: 1, content: 4 },
    },
    {
      name: 'LeafClinic',
      domain: 'wikipedia.org',
      website: 'https://en.wikipedia.org/wiki/Health_technology',
      industry: 'Healthcare',
      employeeCount: '201-1000',
      funding: 'Series B',
      techStack: ['Python', 'Postgres', 'AWS'],
      keyContact: {
        name: 'Elena Ruiz',
        title: 'Chief Growth Officer',
        email: 'elena@leafclinic.example',
        linkedin: '',
      },
      customSignal: {
        type: 'funding',
        value: 'Series B announced in niche trade press',
        detectedAt: daysAgo(8),
      },
      icpFitScore: 58,
      behavior: { siteVisits: 3, replies: 0, content: 2 },
    },
    {
      name: 'Stackwright',
      domain: 'github.com',
      website: 'https://github.com',
      industry: 'Developer Tools',
      employeeCount: '201-1000',
      funding: 'Series B',
      techStack: ['Go', 'Kubernetes', 'Postgres'],
      keyContact: {
        name: 'Jonah Park',
        title: 'Head of Demand Gen',
        email: 'jonah@stackwright.example',
        linkedin: '',
      },
      customSignal: {
        type: 'tech_change',
        value: 'Migrating docs to new developer portal',
        detectedAt: daysAgo(2),
      },
      icpFitScore: 84,
      behavior: { siteVisits: 7, replies: 3, content: 3 },
    },
    {
      name: 'Copperline Retail',
      domain: 'shopify.com',
      website: 'https://www.shopify.com',
      industry: 'E-commerce',
      employeeCount: '1000+',
      funding: 'Series C+',
      techStack: ['Ruby', 'React', 'Kafka'],
      keyContact: {
        name: 'Ava Brooks',
        title: 'Revenue Operations Lead',
        email: 'ava@copperline.example',
        linkedin: '',
      },
      customSignal: {
        type: 'web_presence',
        value: 'Heavy merchandising + AI shopping messaging',
        detectedAt: daysAgo(6),
      },
      icpFitScore: 42,
      behavior: { siteVisits: 2, replies: 0, content: 1 },
    },
    {
      name: 'Nimbus Security',
      domain: 'cloudflare.com',
      website: 'https://www.cloudflare.com',
      industry: 'Cybersecurity',
      employeeCount: '1000+',
      funding: 'Series C+',
      techStack: ['Rust', 'Go', 'Kubernetes'],
      keyContact: {
        name: 'Sam Okonkwo',
        title: 'VP Revenue',
        email: 'sam@nimbus.example',
        linkedin: '',
      },
      customSignal: {
        type: 'hiring_spike',
        value: 'Enterprise AE hiring wave',
        detectedAt: daysAgo(1),
      },
      icpFitScore: 92,
      behavior: { siteVisits: 10, replies: 3, content: 4 },
    },
    {
      // Thin account — demonstrates coverage gate (§2.2 / §5)
      name: 'Sparse Co',
      domain: 'example.org',
      website: 'https://example.org',
      industry: '',
      employeeCount: '',
      funding: '',
      techStack: [],
      keyContact: { name: '', title: '', email: '', linkedin: '' },
      customSignal: null,
      icpFitScore: 20,
      behavior: { siteVisits: 1, replies: 0, content: 0 },
    },
  ];

  for (const raw of rawAccounts) {
    const account = {
      id: id(),
      account_id: null,
      name: raw.name,
      domain: normalizeDomain(raw.domain),
      website: raw.website,
      industry: raw.industry,
      employeeCount: raw.employeeCount,
      funding: raw.funding,
      techStack: raw.techStack,
      keyContact: raw.keyContact,
      customSignal: raw.customSignal,
      icpFitScore: raw.icpFitScore,
      signals: { icpFit: Math.round(raw.icpFitScore * 0.3) },
      enrichment: {
        coverage: 0,
        lastEnrichedAt: daysAgo(2),
        source: 'seed',
        fieldConfidence: {},
      },
      createdAt: daysAgo(20),
      updatedAt: daysAgo(1),
    };
    account.account_id = account.id;

    if (account.keyContact?.name) {
      db.contacts.push({
        id: id(),
        contact_id: null,
        account_id: account.id,
        name: account.keyContact.name,
        title: account.keyContact.title,
        email: account.keyContact.email,
        linkedin: account.keyContact.linkedin,
      });
      db.contacts[db.contacts.length - 1].contact_id = db.contacts[db.contacts.length - 1].id;
    }

    db.accounts.push(account);
    seedBehavioralEvents(db, account, raw.behavior);
  }

  // First pass scores (cold baseline), then bump events and rescore to create transitions
  for (const account of db.accounts) {
    writeScore(db, account, 'cold');
  }
  // Force a warm→hot style previous_tier on top accounts by rewriting with prior tier
  for (const account of db.accounts.filter((a) => a.icpFitScore >= 80)) {
    writeScore(db, account, 'warm');
  }

  db.sequences = [
    {
      id: id(),
      name: 'Hot account — 3-touch sprint',
      heatTier: 'hot',
      status: 'live',
      steps: [
        {
          day: 0,
          channel: 'email',
          subjectTemplate: '{{company}} × timing on {{signal}}',
          bodyTemplate:
            'Hi {{contact_name}},\n\nNoticed {{signal}}. For {{industry}} teams at {{funding}}, we usually see speed-to-lead collapse when scoring and outreach are decoupled.\n\nWorth a 15-min look this week?\n',
        },
        {
          day: 3,
          channel: 'linkedin',
          subjectTemplate: 'Quick bump — {{company}}',
          bodyTemplate:
            'Following up on the note about {{signal}}. Happy to share what similar {{industry}} teams tested last sprint.',
        },
        {
          day: 7,
          channel: 'email',
          subjectTemplate: 'Closing the loop on {{company}}',
          bodyTemplate:
            'Last note from me — if pipeline visibility by segment/message is a Q-priority, I can send the sprint report we use internally.',
        },
      ],
    },
    {
      id: id(),
      name: 'Warm nurture — signal-led',
      heatTier: 'warm',
      status: 'live',
      steps: [
        {
          day: 0,
          channel: 'email',
          subjectTemplate: 'Hypothesis for {{company}}',
          bodyTemplate:
            'Hi {{contact_name}},\n\nSaw {{signal}}. Curious if your team is still stitching enrichment → scoring → sequences by hand.\n\nOpen to a short teardown?\n',
        },
        {
          day: 5,
          channel: 'email',
          subjectTemplate: 'One metric that usually moves first',
          bodyTemplate:
            'For warm accounts like {{company}}, the first lift we track is speed-to-lead — not reply rate. Sharing in case useful.',
        },
      ],
    },
    {
      id: id(),
      name: 'Cold — ICP probe',
      heatTier: 'cold',
      status: 'draft',
      steps: [
        {
          day: 0,
          channel: 'email',
          subjectTemplate: 'Should {{company}} even be on this list?',
          bodyTemplate:
            'Hi {{contact_name}},\n\nKeeping this short — we think {{industry}} + {{funding}} is ICP-adjacent, but heat is still cold. If GTM measurement is a 2026 goal, I can send a one-pager.\n',
        },
      ],
    },
  ];

  const activeSprint = {
    id: id(),
    name: 'Sprint 12 — Heat-tier messaging',
    startDate: startOfSprint(0),
    endDate: daysFrom(13),
    hypothesis:
      'Personalized openers for Hot tier lift replies vs generic templates without increasing send volume.',
    status: 'active',
    tested: [
      'Hot-tier subject lines referencing custom hiring signals',
      'Warm-tier speed-to-lead framing',
    ],
    results: {
      repliesDelta: 0.18,
      meetingsDelta: 0.06,
      notes: 'In progress — Hot variant leading after 6 days.',
    },
  };

  const previousSprint = {
    id: id(),
    name: 'Sprint 11 — Enrichment coverage',
    startDate: startOfSprint(-1),
    endDate: startOfSprint(0),
    hypothesis: 'Raising core-field coverage above 80% improves heat-score-to-conversion.',
    status: 'completed',
    tested: ['Forced enrichment before sequence enrollment', 'Coverage KPI on dashboard'],
    results: {
      repliesDelta: 0.11,
      meetingsDelta: 0.04,
      notes: 'Coverage ↑ 61% → 84%. Hot conversion improved.',
    },
  };

  db.sprints = [activeSprint, previousSprint];

  // First-class experiment/variant objects (§2.6)
  db.experiments = [
    {
      id: id(),
      sprintId: activeSprint.id,
      variant_id: id(),
      name: 'Hot opener: signal vs product',
      hypothesis: 'Signal-led subjects beat product-led for Hot tier',
      variantA: 'Signal-led subject',
      variantB: 'Product-led subject',
      messageCopy: {
        A: 'Saw {{signal}} — timing check',
        B: 'Introducing Cycle for {{company}}',
      },
      targetSegment: 'hot',
      metric: 'reply_rate',
      lift: 0.18,
      sampleSize: 42,
      shippedAt: daysAgo(6),
      status: 'running',
    },
    {
      id: id(),
      sprintId: previousSprint.id,
      variant_id: id(),
      name: 'Enrich-before-send gate',
      hypothesis: 'Blocking sends below 80% coverage improves meetings',
      variantA: 'Send with partial fields',
      variantB: 'Block until coverage ≥ 80%',
      messageCopy: { A: 'n/a', B: 'n/a' },
      targetSegment: 'all',
      metric: 'meetings',
      lift: 0.04,
      sampleSize: 110,
      shippedAt: daysAgo(16),
      status: 'completed',
    },
  ];

  const hotSeq = db.sequences[0];
  const warmSeq = db.sequences[1];
  const hotAccounts = db.accounts.filter((a) => a.heatTier === 'hot').map((a) => a.id);
  const warmAccounts = db.accounts.filter((a) => a.heatTier === 'warm').map((a) => a.id);

  db.campaigns = [
    {
      id: id(),
      name: 'Hot burst — Sprint 12',
      sequenceId: hotSeq.id,
      sprintId: activeSprint.id,
      variant_id: db.experiments[0].variant_id,
      accountIds: hotAccounts,
      mode: 'draft',
      status: 'live',
      createdAt: daysAgo(5),
      stats: { drafted: 0, sent: 0, replies: 0, meetings: 0 },
    },
    {
      id: id(),
      name: 'Warm nurture — Sprint 12',
      sequenceId: warmSeq.id,
      sprintId: activeSprint.id,
      variant_id: null,
      accountIds: warmAccounts,
      mode: 'draft',
      status: 'live',
      createdAt: daysAgo(4),
      stats: { drafted: 0, sent: 0, replies: 0, meetings: 0 },
    },
  ];

  // Seed touches with score_at_send_time (§2.6)
  if (hotAccounts[0]) {
    const score = db.scores.find((s) => s.account_id === hotAccounts[0]);
    db.touches.push({
      id: id(),
      accountId: hotAccounts[0],
      contact_id: db.contacts.find((c) => c.account_id === hotAccounts[0])?.id || null,
      campaignId: db.campaigns[0].id,
      sequence_id: hotSeq.id,
      variant_id: db.experiments[0].variant_id,
      channel: 'email',
      subject: 'Northstar Analytics × timing on hiring',
      body: 'Seeded touch',
      status: 'replied',
      score_at_send_time: score?.score ?? null,
      tier_at_send_time: score?.tier ?? null,
      score_version: score?.score_version ?? null,
      createdAt: daysAgo(4),
      sentAt: daysAgo(4),
      outcomeAt: daysAgo(3),
      signalToTouchHours: 5,
      signal_crossed_at: daysAgo(4.2),
    });
  }

  processTierTriggers(db, { mode: 'draft' });

  writeDb(db);
  return db;
}
