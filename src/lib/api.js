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

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['x-hf-token'] = token;
  return h;
}

export const api = {
  health: () => fetch('/api/health').then(parseJson),
  dashboard: () => fetch('/api/dashboard').then(parseJson),
  accounts: () => fetch('/api/accounts').then(parseJson),
  account: (id) => fetch(`/api/accounts/${id}`).then(parseJson),
  createAccount: (body) =>
    fetch('/api/accounts', { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(
      parseJson
    ),
  updateAccount: (id, body) =>
    fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  enrichAccount: (id) =>
    fetch(`/api/accounts/${id}/enrich`, { method: 'POST', headers: headers() }).then(parseJson),
  addEvent: (id, body) =>
    fetch(`/api/accounts/${id}/events`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  sequences: () => fetch('/api/sequences').then(parseJson),
  updateSequence: (id, body) =>
    fetch(`/api/sequences/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  campaigns: () => fetch('/api/campaigns').then(parseJson),
  createCampaign: (body) =>
    fetch('/api/campaigns', { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(
      parseJson
    ),
  draftCampaign: (id, body = {}, token) =>
    fetch(`/api/campaigns/${id}/draft`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(body),
    }).then(parseJson),
  sendTouch: (id) =>
    fetch(`/api/touches/${id}/send`, { method: 'POST', headers: headers() }).then(parseJson),
  touchOutcome: (id, status) =>
    fetch(`/api/touches/${id}/outcome`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ status }),
    }).then(parseJson),
  touches: () => fetch('/api/touches').then(parseJson),
  sprints: () => fetch('/api/sprints').then(parseJson),
  createSprint: (body) =>
    fetch('/api/sprints', { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(
      parseJson
    ),
  createExperiment: (sprintId, body) =>
    fetch(`/api/sprints/${sprintId}/experiments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  updateExperiment: (id, body) =>
    fetch(`/api/experiments/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(body),
    }).then(parseJson),
  actionQueue: () => fetch('/api/action-queue').then(parseJson),
  processTriggers: () =>
    fetch('/api/action/process-triggers', { method: 'POST', headers: headers() }).then(parseJson),
  recomputeScores: () =>
    fetch('/api/score/recompute', { method: 'POST', headers: headers() }).then(parseJson),
  reseed: () => fetch('/api/seed', { method: 'POST' }).then(parseJson),
};
