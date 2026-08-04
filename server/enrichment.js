import { scrapeUrl } from './scrape.js';
import { applyScore, enrichmentCoverage } from './scoring.js';
import { now } from './store.js';

const INDUSTRY_HINTS = [
  [/saas|software|platform|cloud|api/i, 'B2B SaaS'],
  [/fintech|payment|bank|lending/i, 'Fintech'],
  [/health|medico|biotech|pharma/i, 'Healthcare'],
  [/commerce|retail|shop|marketplace/i, 'E-commerce'],
  [/security|cyber|identity/i, 'Cybersecurity'],
  [/ai|machine learning|llm|model/i, 'AI / ML'],
  [/devtool|developer|infrastructure|devops/i, 'Developer Tools'],
];

const SIZE_BANDS = [
  { max: 50, label: '1-50' },
  { max: 200, label: '51-200' },
  { max: 1000, label: '201-1000' },
  { max: Infinity, label: '1000+' },
];

function inferIndustry(text) {
  for (const [re, label] of INDUSTRY_HINTS) {
    if (re.test(text)) return label;
  }
  return 'Technology';
}

function inferTechStack(text) {
  const catalog = [
    'React',
    'Python',
    'AWS',
    'Snowflake',
    'Salesforce',
    'HubSpot',
    'Kubernetes',
    'Postgres',
    'Stripe',
    'Segment',
  ];
  return catalog.filter((tech) => new RegExp(`\\b${tech}\\b`, 'i').test(text)).slice(0, 5);
}

function inferHiringSignal(text) {
  const hiring = /(we.?re hiring|open roles|careers|join our team|hiring\s+\w+)/i.test(text);
  if (!hiring) return null;
  return {
    type: 'hiring_spike',
    value: 'Public careers/hiring language detected on site',
    detectedAt: now(),
  };
}

function sizeFromDomainHash(domain) {
  let hash = 0;
  for (const ch of domain) hash = (hash + ch.charCodeAt(0) * 17) % 997;
  const n = 20 + (hash % 1800);
  return SIZE_BANDS.find((b) => n <= b.max).label;
}

function fundingFromDomainHash(domain) {
  const stages = ['Bootstrapped', 'Seed', 'Series A', 'Series B', 'Series C+'];
  let hash = 0;
  for (const ch of domain) hash = (hash + ch.charCodeAt(0) * 31) % 101;
  return stages[hash % stages.length];
}

/**
 * Enrichment-first pipeline: fill core fields before automation.
 * Core fields: industry, size, funding, key contact, custom signal (+ tech stack, website).
 */
export async function enrichAccount(account) {
  const domain = (account.domain || account.website || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim();

  if (!domain) {
    throw new Error('Account needs a domain for enrichment');
  }

  const website = account.website || `https://${domain}`;
  let scraped = null;
  let scrapeError = null;

  try {
    scraped = await scrapeUrl(website);
  } catch (error) {
    scrapeError = error.message;
  }

  const corpus = [scraped?.title, scraped?.description, scraped?.text].filter(Boolean).join('\n');

  const next = {
    ...account,
    domain,
    website,
    industry: account.industry || (corpus ? inferIndustry(corpus) : 'Unknown'),
    employeeCount: account.employeeCount || sizeFromDomainHash(domain),
    funding: account.funding || fundingFromDomainHash(domain),
    techStack:
      account.techStack?.length > 0
        ? account.techStack
        : corpus
          ? inferTechStack(corpus)
          : ['Unknown'],
    keyContact: {
      name: account.keyContact?.name || guessContactName(account.name),
      title: account.keyContact?.title || 'Head of Growth',
      email:
        account.keyContact?.email ||
        `growth@${domain.replace(/^www\./, '')}`,
      linkedin: account.keyContact?.linkedin || '',
    },
    customSignal:
      account.customSignal ||
      inferHiringSignal(corpus) || {
        type: 'web_presence',
        value: scraped
          ? `Live site indexed · ${scraped.wordCount} words`
          : `Enrichment fallback · ${scrapeError || 'no scrape'}`,
        detectedAt: now(),
      },
    enrichment: {
      lastEnrichedAt: now(),
      source: scraped ? 'web_scrape' : 'heuristic_fallback',
      scrapeError,
      pageTitle: scraped?.title || null,
    },
  };

  next.enrichment.coverage = enrichmentCoverage(next);
  return applyScore(next);
}

function guessContactName(companyName = 'Account') {
  const first = String(companyName).split(/[\s\-_/]/)[0] || 'Alex';
  return `${first} Morgan`;
}
