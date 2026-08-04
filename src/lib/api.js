async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function scrapePage(url) {
  const response = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return parseJson(response);
}

export async function analyzePage({ page, mode, question, token }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-hf-token'] = token;

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({ page, mode, question, token }),
  });
  return parseJson(response);
}

export async function getHealth() {
  const response = await fetch('/api/health');
  return parseJson(response);
}
