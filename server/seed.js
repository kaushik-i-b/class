import { id, now, readDb, writeDb } from './store.js';
import { applyScore } from './scoring.js';

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
  const db = readDb();
  if (!force && db.meta?.seededAt && db.accounts.length > 0) return db;

  const accounts = [
    {
      id: id(),
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
      signals: { icpFit: 28, siteVisits: 14, contentEngagement: 12, replies: 8 },
      createdAt: daysAgo(20),
      updatedAt: daysAgo(1),
    },
    {
      id: id(),
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
      signals: { icpFit: 22, siteVisits: 18, contentEngagement: 16, replies: 4 },
      createdAt: daysAgo(18),
      updatedAt: daysAgo(2),
    },
    {
      id: id(),
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
      signals: { icpFit: 18, siteVisits: 6, contentEngagement: 9, replies: 2 },
      createdAt: daysAgo(15),
      updatedAt: daysAgo(4),
    },
    {
      id: id(),
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
      signals: { icpFit: 26, siteVisits: 11, contentEngagement: 15, replies: 10 },
      createdAt: daysAgo(12),
      updatedAt: daysAgo(1),
    },
    {
      id: id(),
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
      signals: { icpFit: 12, siteVisits: 4, contentEngagement: 5, replies: 0 },
      createdAt: daysAgo(10),
      updatedAt: daysAgo(6),
    },
    {
      id: id(),
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
      signals: { icpFit: 30, siteVisits: 16, contentEngagement: 14, replies: 12 },
      createdAt: daysAgo(9),
      updatedAt: daysAgo(0),
    },
  ].map((a) =>
    applyScore({
      ...a,
      enrichment: {
        coverage: 0,
        lastEnrichedAt: daysAgo(2),
        source: 'seed',
      },
    })
  );

  const sequences = [
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

  const experiments = [
    {
      id: id(),
      sprintId: activeSprint.id,
      name: 'Hot opener: signal vs product',
      variantA: 'Signal-led subject',
      variantB: 'Product-led subject',
      metric: 'reply_rate',
      lift: 0.18,
      shippedAt: daysAgo(6),
      status: 'running',
    },
    {
      id: id(),
      sprintId: previousSprint.id,
      name: 'Enrich-before-send gate',
      variantA: 'Send with partial fields',
      variantB: 'Block until coverage ≥ 80%',
      metric: 'meetings',
      lift: 0.04,
      shippedAt: daysAgo(16),
      status: 'completed',
    },
  ];

  const hotSeq = sequences[0];
  const warmSeq = sequences[1];
  const hotAccounts = accounts.filter((a) => a.heatTier === 'hot').map((a) => a.id);
  const warmAccounts = accounts.filter((a) => a.heatTier === 'warm').map((a) => a.id);

  const campaigns = [
    {
      id: id(),
      name: 'Hot burst — Sprint 12',
      sequenceId: hotSeq.id,
      sprintId: activeSprint.id,
      accountIds: hotAccounts,
      mode: 'draft',
      status: 'live',
      createdAt: daysAgo(5),
      stats: { drafted: 4, sent: 3, replies: 1, meetings: 0 },
    },
    {
      id: id(),
      name: 'Warm nurture — Sprint 12',
      sequenceId: warmSeq.id,
      sprintId: activeSprint.id,
      accountIds: warmAccounts,
      mode: 'draft',
      status: 'live',
      createdAt: daysAgo(4),
      stats: { drafted: 3, sent: 2, replies: 0, meetings: 0 },
    },
  ];

  const touches = [
    {
      id: id(),
      accountId: hotAccounts[0],
      campaignId: campaigns[0].id,
      channel: 'email',
      subject: 'Northstar Analytics × timing on hiring',
      body: 'Drafted touch',
      status: 'replied',
      createdAt: daysAgo(4),
      sentAt: daysAgo(4),
      outcomeAt: daysAgo(3),
      signalToTouchHours: 5,
    },
    {
      id: id(),
      accountId: hotAccounts[1] || hotAccounts[0],
      campaignId: campaigns[0].id,
      channel: 'email',
      subject: 'Signal follow-up',
      body: 'Drafted touch',
      status: 'sent',
      createdAt: daysAgo(2),
      sentAt: daysAgo(2),
      outcomeAt: null,
      signalToTouchHours: 8,
    },
    {
      id: id(),
      accountId: warmAccounts[0],
      campaignId: campaigns[1].id,
      channel: 'email',
      subject: 'Hypothesis note',
      body: 'Drafted touch',
      status: 'sent',
      createdAt: daysAgo(3),
      sentAt: daysAgo(3),
      outcomeAt: null,
      signalToTouchHours: 20,
    },
  ];

  const seeded = {
    accounts,
    sequences,
    campaigns,
    touches,
    sprints: [activeSprint, previousSprint],
    experiments,
    meta: { seededAt: now() },
  };

  writeDb(seeded);
  return seeded;
}
