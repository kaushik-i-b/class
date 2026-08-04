import * as cheerio from 'cheerio';

const MAX_TEXT_CHARS = 24_000;
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT =
  'QwinBot/1.0 (+https://github.com/kaushik-i-b/class; educational research scraper)';

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('URL is required');

  let url;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are supported');
  }

  return url.toString();
}

function cleanText(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function nodeText($, node) {
  const parts = [];
  node.contents().each((_, child) => {
    if (child.type === 'text') {
      parts.push(child.data || '');
      return;
    }
    if (child.type !== 'tag') return;

    const tag = child.name?.toLowerCase();
    const blockTags = new Set([
      'p',
      'div',
      'section',
      'article',
      'li',
      'ul',
      'ol',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'br',
      'tr',
      'blockquote',
      'pre',
    ]);

    if (tag === 'br') {
      parts.push('\n');
      return;
    }

    const inner = nodeText($, $(child));
    if (!inner) return;
    parts.push(blockTags.has(tag) ? `\n${inner}\n` : ` ${inner} `);
  });

  return cleanText(parts.join(''));
}

function extractMainText($) {
  $(
    'script, style, noscript, iframe, svg, canvas, nav, footer, header, aside, form, button'
  ).remove();

  const candidates = [
    'article',
    'main',
    '[role="main"]',
    '.content',
    '#content',
    '.post',
    '.article',
    'body',
  ];

  let best = '';
  for (const selector of candidates) {
    const node = $(selector).first();
    if (!node.length) continue;
    const text = nodeText($, node);
    if (text.length > best.length) best = text;
  }

  return best;
}

function extractLinks($, baseUrl) {
  const seen = new Set();
  const links = [];

  $('a[href]').each((_, el) => {
    if (links.length >= 25) return false;
    const href = $(el).attr('href');
    const label = cleanText($(el).text()).slice(0, 120);
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    let absolute;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    if (seen.has(absolute)) return;
    seen.add(absolute);
    links.push({ href: absolute, label: label || absolute });
  });

  return links;
}

export async function scrapeUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': USER_AGENT,
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Timed out while fetching the page');
    }
    throw new Error(`Failed to fetch URL: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Upstream responded with ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error('URL did not return HTML content');
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title =
    cleanText($('meta[property="og:title"]').attr('content') || '') ||
    cleanText($('title').first().text()) ||
    'Untitled page';

  const description =
    cleanText($('meta[name="description"]').attr('content') || '') ||
    cleanText($('meta[property="og:description"]').attr('content') || '');

  const text = extractMainText($).slice(0, MAX_TEXT_CHARS);
  if (!text) {
    throw new Error('Could not extract readable text from this page');
  }

  return {
    url: response.url || url,
    title,
    description,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    links: extractLinks($, response.url || url),
    scrapedAt: new Date().toISOString(),
  };
}
