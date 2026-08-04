import * as cheerio from 'cheerio';
import { scrapeUrl } from './scrape.js';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SKIP_EMAIL = /noreply|no-reply|donotreply|privacy|support@|hello@example|sentry\.io|wixpress|schema\.org/i;

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function companyFromDomain(domain) {
  const root = domain.split('.')[0] || domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function extractEmails(text) {
  const found = text.match(EMAIL_RE) || [];
  return [...new Set(found.map((e) => e.toLowerCase()))].filter((e) => !SKIP_EMAIL.test(e));
}

function guessNameFromEmail(email) {
  const local = email.split('@')[0] || '';
  const parts = local.split(/[._-]+/).filter((p) => p && !/^\d+$/.test(p));
  if (!parts.length) return 'Team';
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function extractPeople($, pageUrl) {
  const people = [];
  const seen = new Set();

  $('a[href^="mailto:"]').each((_, el) => {
    const href = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0];
    const email = href.toLowerCase();
    if (!email || SKIP_EMAIL.test(email) || seen.has(email)) return;
    seen.add(email);
    const label = ($(el).text() || '').trim();
    people.push({
      name: label && !label.includes('@') ? label : guessNameFromEmail(email),
      email,
      title: '',
      linkedinUrl: '',
      sourceUrl: pageUrl,
    });
  });

  // LinkedIn profile links near text
  $('a[href*="linkedin.com/in/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let linkedinUrl = href;
    try {
      linkedinUrl = new URL(href, pageUrl).toString();
    } catch {
      /* keep */
    }
    const name = ($(el).text() || '').trim() || 'LinkedIn contact';
    const key = linkedinUrl.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    people.push({
      name,
      email: '',
      title: '',
      linkedinUrl,
      sourceUrl: pageUrl,
    });
  });

  return people;
}

async function scrapeOnePage(url) {
  const page = await scrapeUrl(url);
  const $ = cheerio.load(`<body>${page.text}</body>`);
  // Re-scrape raw HTML for structure — scrapeUrl already parsed; fetch again lightly via page fields
  // Use emails from text + structured pass on a fresh fetch is expensive; use text emails + title
  const emails = extractEmails(`${page.title}\n${page.description}\n${page.text}`);
  const leads = emails.map((email) => ({
    name: guessNameFromEmail(email),
    email,
    title: '',
    company: companyFromDomain(domainFromUrl(page.url)),
    domain: domainFromUrl(page.url),
    linkedinUrl: '',
    sourceUrl: page.url,
    snippet: page.description || page.text.slice(0, 180),
  }));

  // Also try HTML fetch for mailto/linkedin
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CycleBot/2.0 (+lead-finder)' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      const $html = cheerio.load(html);
      for (const person of extractPeople($html, page.url)) {
        const domain = domainFromUrl(page.url);
        const existing = leads.find(
          (l) =>
            (person.email && l.email === person.email) ||
            (person.linkedinUrl && l.linkedinUrl === person.linkedinUrl)
        );
        if (existing) {
          if (person.linkedinUrl) existing.linkedinUrl = person.linkedinUrl;
          if (person.name && existing.name === 'Team') existing.name = person.name;
        } else {
          leads.push({
            ...person,
            company: companyFromDomain(domain),
            domain,
            snippet: page.description || '',
          });
        }
      }

      // Catch emails only in HTML attributes
      for (const email of extractEmails(html)) {
        if (leads.some((l) => l.email === email)) continue;
        leads.push({
          name: guessNameFromEmail(email),
          email,
          title: '',
          company: companyFromDomain(domainFromUrl(page.url)),
          domain: domainFromUrl(page.url),
          linkedinUrl: '',
          sourceUrl: page.url,
          snippet: page.description || '',
        });
      }
    }
  } catch {
    /* text-based leads already collected */
  }

  return { page, leads };
}

async function discoverUrlsFromKeyword(keyword, limit = 6) {
  const q = encodeURIComponent(`${keyword} contact email OR team OR "about us"`);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${q}`;
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CycleBot/2.0)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const urls = [];
  $('a.result__a, a.result__url, a[href]').each((_, el) => {
    if (urls.length >= limit) return false;
    let href = $(el).attr('href') || '';
    // DDG redirect links
    if (href.includes('uddg=')) {
      try {
        const u = new URL(href, 'https://duckduckgo.com');
        href = decodeURIComponent(u.searchParams.get('uddg') || '');
      } catch {
        return;
      }
    }
    const normalized = normalizeUrl(href);
    if (!normalized) return;
    if (/duckduckgo\.|google\.|facebook\.|youtube\.|wikipedia\./i.test(normalized)) return;
    if (!urls.includes(normalized)) urls.push(normalized);
  });
  return urls;
}

const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us', '/team', '/company'];

/**
 * Find leads for a campaign by scraping URLs and/or searching a keyword.
 */
export async function findLeads({ urls = [], keyword = '' }) {
  let targets = urls.map(normalizeUrl).filter(Boolean);

  if (keyword?.trim()) {
    try {
      const discovered = await discoverUrlsFromKeyword(keyword.trim());
      targets = [...new Set([...targets, ...discovered])];
    } catch (error) {
      if (!targets.length) throw new Error(`Keyword search failed: ${error.message}`);
    }
  }

  if (!targets.length) {
    throw new Error('Provide at least one URL or a search keyword');
  }

  const results = [];
  const errors = [];

  for (const url of targets.slice(0, 8)) {
    try {
      const primary = await scrapeOnePage(url);
      results.push(...primary.leads);

      // Follow common contact paths on same origin
      const origin = new URL(url).origin;
      for (const path of CONTACT_PATHS.slice(0, 3)) {
        const next = `${origin}${path}`;
        if (next === url) continue;
        try {
          const extra = await scrapeOnePage(next);
          results.push(...extra.leads);
        } catch {
          /* path may 404 */
        }
      }
    } catch (error) {
      errors.push({ url, error: error.message });
    }
  }

  // Dedupe by email or linkedin or name+domain
  const deduped = [];
  const keys = new Set();
  for (const lead of results) {
    const key = (lead.email || lead.linkedinUrl || `${lead.name}|${lead.domain}`).toLowerCase();
    if (keys.has(key)) continue;
    keys.add(key);
    if (!lead.email && !lead.linkedinUrl) continue;
    deduped.push(lead);
  }

  // If a URL produced no contacts, still create a company stub lead for LinkedIn/manual email
  for (const url of targets.slice(0, 8)) {
    const domain = domainFromUrl(url);
    if (!domain) continue;
    const hasForDomain = deduped.some((l) => l.domain === domain);
    if (hasForDomain) continue;
    const failed = errors.some((e) => e.url === url);
    if (failed) continue;
    deduped.push({
      name: `${companyFromDomain(domain)} team`,
      email: `hello@${domain}`,
      title: 'Team',
      company: companyFromDomain(domain),
      domain,
      linkedinUrl: '',
      sourceUrl: url,
      snippet: 'Company stub from scraped site — verify email before sending',
    });
  }

  return { leads: deduped, scrapedUrls: targets.length, errors };
}
