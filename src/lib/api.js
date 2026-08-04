async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['x-hf-token'] = token;
  return h;
}

export const api = {
  health: () => fetch('/api/health').then(parseJson),
  overview: () => fetch('/api/overview').then(parseJson),
  campaigns: () => fetch('/api/campaigns').then(parseJson),
  campaign: (id) => fetch(`/api/campaigns/${id}`).then(parseJson),
  createCampaign: (body) =>
    fetch('/api/campaigns', { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(
      parseJson
    ),
  findLeads: (id, body) =>
    fetch(`/api/campaigns/${id}/find-leads`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  addLead: (id, body) =>
    fetch(`/api/campaigns/${id}/leads`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  enqueue: (id, body, token) =>
    fetch(`/api/campaigns/${id}/enqueue`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(body),
    }).then(parseJson),
  queue: () => fetch('/api/queue').then(parseJson),
  processDue: (token) =>
    fetch('/api/messages/process-due', {
      method: 'POST',
      headers: headers(token),
      body: '{}',
    }).then(parseJson),
  regenerate: (id, token) =>
    fetch(`/api/messages/${id}/regenerate`, {
      method: 'POST',
      headers: headers(token),
      body: '{}',
    }).then(parseJson),
  patchMessage: (id, body) =>
    fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  linkedInSent: (id, token) =>
    fetch(`/api/messages/${id}/linkedin-sent`, {
      method: 'POST',
      headers: headers(token),
      body: '{}',
    }).then(parseJson),
  markReplied: (id) =>
    fetch(`/api/leads/${id}/replied`, { method: 'POST', headers: headers() }).then(parseJson),
};
