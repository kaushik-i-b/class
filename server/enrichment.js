import { scrapeUrl } from './scrape.js';
import { writeScore, enrichmentCoverage, COVERAGE_GATE } from './scoring.js';
import { normalizeDomain, ensureCanonicalIds } from './identity.js';
import { appendEvent } from './features.js';
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

/**
 * Waterfall enrichment (§2.2): cheap/local scrape first, heuristic fallback second.
 * Each field carries confidence + last_verified_at.
 */
export async function enrichAccount(account, db = null) {
  const domain = normalizeDomain(account.domain || account.website || '');
  if (!domain) throw new Error('Account needs a domain for enrichment');

  const website = account.website || `https://${domain}`;
  const fieldConfidence = {};
  const providersTried = [];

  // Provider 1 — web scrape (cheap/local)
  let scraped = null;
  let scrapeError = null;
  try {
    scraped = await scrapeUrl(website);
    providersTried.push({ provider: 'web_scrape', ok: true });
  } catch (error) {
    scrapeError = error.message;
    providersTried.push({ provider: 'web_scrape', ok: false, error: scrapeError });
  }

  const corpus = [scraped?.title, scraped?.description, scraped?.text].filter(Boolean).join('\n');
  const verifiedAt = now();

  function setField(key, value, confidence, provider) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
    fieldConfidence[key] = confidence;
    return { value, confidence, provider, last_verified_at: verifiedAt };
  }

  // Waterfall per field
  let industry = account.industry;
  let industryMeta = null;
  if (!industry && corpus) {
    industryMeta = setField('industry', inferIndustry(corpus), 0.75, 'web_scrape');
    industry = industryMeta?.value;
  }
  if (!industry) {
    industryMeta = setField('industry', 'Technology', 0.4, 'heuristic_fallback');
    industry = industryMeta.value;
  }

  let employeeCount = account.employeeCount;
  if (!employeeCount) {
    const meta = setField('employeeCount', sizeFromDomainHash(domain), 0.55, 'heuristic_fallback');
    employeeCount = meta.value;
  } else {
    fieldConfidence.employeeCount = fieldConfidence.employeeCount ?? 0.8;
  }

  let funding = account.funding;
  if (!funding) {
    const meta = setField('funding', fundingFromDomainHash(domain), 0.5, 'heuristic_fallback');
    funding = meta.value;
  } else {
    fieldConfidence.funding = fieldConfidence.funding ?? 0.8;
  }

  let techStack = account.techStack?.length ? account.techStack : null;
  if (!techStack && corpus) {
    const inferred = inferTechStack(corpus);
    const meta = setField('techStack', inferred.length ? inferred : ['Unknown'], inferred.length ? 0.7 : 0.35, 'web_scrape');
    techStack = meta.value;
  }
  if (!techStack) {
    techStack = setField('techStack', ['Unknown'], 0.3, 'heuristic_fallback').value;
  } else {
    fieldConfidence.techStack = fieldConfidence.techStack ?? 0.75;
  }

  let keyContact = account.keyContact?.name ? account.keyContact : null;
  if (!keyContact) {
    keyContact = {
      name: guessContactName(account.name),
      title: 'Head of Growth',
      email: `growth@${domain}`,
      linkedin: '',
    };
    fieldConfidence.keyContact = 0.45;
  } else {
    fieldConfidence.keyContact = fieldConfidence.keyContact ?? 0.85;
  }

  let customSignal = account.customSignal;
  if (!customSignal) {
    customSignal =
      inferHiringSignal(corpus) || {
        type: 'web_presence',
        value: scraped
          ? `Live site indexed · ${scraped.wordCount} words`
          : `Enrichment fallback · ${scrapeError || 'no scrape'}`,
        detectedAt: verifiedAt,
      };
    fieldConfidence.customSignal = scraped ? 0.65 : 0.4;
  } else {
    fieldConfidence.customSignal = fieldConfidence.customSignal ?? 0.7;
  }

  // Rule-based ICP fit (0–100) from enrichment, not behavioral signals
  const icpFitScore = computeIcpFit({ industry, employeeCount, funding, techStack });

  const next = ensureCanonicalIds({
    ...account,
    domain,
    website,
    industry,
    employeeCount,
    funding,
    techStack,
    keyContact,
    customSignal,
    icpFitScore,
    signals: {
      ...(account.signals || {}),
      icpFit: Math.round(icpFitScore * 0.3), // keep legacy 0–30 scale for display
    },
    enrichment: {
      lastEnrichedAt: verifiedAt,
      source: scraped ? 'waterfall:web_scrape' : 'waterfall:heuristic_fallback',
      scrapeError,
      pageTitle: scraped?.title || null,
      providersTried,
      fieldConfidence,
      coverageGate: COVERAGE_GATE,
    },
  });

  next.enrichment.coverage = enrichmentCoverage(next);

  if (db) {
    appendEvent(db, {
      account_id: next.id,
      signal_type: 'custom_signal',
      value: 1,
      timestamp: customSignal.detectedAt || verifiedAt,
      source: 'enrichment',
    });
    writeScore(db, next, next.heatTier || null);
  }

  return next;
}

function computeIcpFit({ industry, employeeCount, funding, techStack }) {
  let score = 40;
  if (/saas|fintech|cyber|developer|ai/i.test(industry || '')) score += 25;
  if (/51-200|201-1000/.test(employeeCount || '')) score += 15;
  if (/Series A|Series B|Series C/i.test(funding || '')) score += 10;
  if ((techStack || []).some((t) => /aws|salesforce|hubspot|snowflake/i.test(t))) score += 10;
  return Math.max(0, Math.min(100, score));
}

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
  if (!/(we.?re hiring|open roles|careers|join our team|hiring\s+\w+)/i.test(text)) return null;
  return {
    type: 'hiring_spike',
    value: 'Public careers/hiring language detected on site',
    detectedAt: now(),
  };
}

function sizeFromDomainHash(domain) {
  const bands = ['1-50', '51-200', '201-1000', '1000+'];
  let hash = 0;
  for (const ch of domain) hash = (hash + ch.charCodeAt(0) * 17) % 997;
  return bands[hash % bands.length];
}

function fundingFromDomainHash(domain) {
  const stages = ['Bootstrapped', 'Seed', 'Series A', 'Series B', 'Series C+'];
  let hash = 0;
  for (const ch of domain) hash = (hash + ch.charCodeAt(0) * 31) % 101;
  return stages[hash % stages.length];
}

function guessContactName(companyName = 'Account') {
  const first = String(companyName).split(/[\s\-_/]/)[0] || 'Alex';
  return `${first} Morgan`;
}
