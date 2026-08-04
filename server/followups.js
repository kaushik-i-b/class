import { updateDb, id, now, daysFromNow, readDb } from './store.js';
import { craftMessages } from './messages.js';
import { sendEmail } from './mailer.js';

/**
 * Process due queued messages: send email or mark LinkedIn ready.
 * Then schedule the next AI follow-up if the campaign has more steps.
 */
export async function processDueMessages({ token } = {}) {
  const due = [];
  const dbSnap = readDb();
  const nowMs = Date.now();

  for (const msg of dbSnap.messages || []) {
    if (msg.status !== 'queued') continue;
    if (msg.scheduledAt && new Date(msg.scheduledAt).getTime() > nowMs) continue;
    due.push(msg.id);
  }

  const results = [];

  for (const messageId of due) {
    try {
      const result = await dispatchMessage(messageId, token);
      results.push(result);
    } catch (error) {
      results.push({ messageId, ok: false, error: error.message });
    }
  }

  return { processed: results.length, results };
}

async function dispatchMessage(messageId, token) {
  const db = readDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (!msg) throw new Error('Message not found');
  const lead = db.leads.find((l) => l.id === msg.leadId);
  const campaign = db.campaigns.find((c) => c.id === msg.campaignId);
  if (!lead || !campaign) throw new Error('Lead/campaign missing');

  if (msg.channel === 'email') {
    const sent = await sendEmail({ to: lead.email, subject: msg.subject, body: msg.body });
    updateDb((d) => {
      const m = d.messages.find((x) => x.id === messageId);
      if (!m) return d;
      m.status = 'sent';
      m.sentAt = now();
      m.delivery = sent;
      const l = d.leads.find((x) => x.id === lead.id);
      if (l) l.status = msg.step === 0 ? 'messaged' : 'followed_up';
      return d;
    });
    await maybeEnqueueFollowUp({ campaign, lead, step: msg.step, channel: 'email', token });
    return { messageId, ok: true, channel: 'email', simulated: sent.simulated };
  }

  // LinkedIn: cannot auto-send without LinkedIn API — mark ready for user to send
  updateDb((d) => {
    const m = d.messages.find((x) => x.id === messageId);
    if (!m) return d;
    m.status = 'awaiting_linkedin_send';
    m.readyAt = now();
    return d;
  });
  return { messageId, ok: true, channel: 'linkedin', needsManualSend: true };
}

export async function confirmLinkedInSent(messageId, token) {
  let lead = null;
  let campaign = null;
  let step = 0;

  updateDb((d) => {
    const m = d.messages.find((x) => x.id === messageId);
    if (!m) return d;
    m.status = 'sent';
    m.sentAt = now();
    lead = d.leads.find((l) => l.id === m.leadId);
    campaign = d.campaigns.find((c) => c.id === m.campaignId);
    step = m.step;
    if (lead) lead.status = step === 0 ? 'messaged' : 'followed_up';
    return d;
  });

  if (campaign && lead) {
    await maybeEnqueueFollowUp({ campaign, lead, step, channel: 'linkedin', token });
  }
  return { ok: true };
}

async function maybeEnqueueFollowUp({ campaign, lead, step, channel, token }) {
  const gaps = campaign.followUpDays || [3, 7];
  const nextStep = step + 1;
  if (nextStep > gaps.length) return null;

  // Don't follow up if lead replied
  if (lead.status === 'replied') return null;

  const delayDays = gaps[nextStep - 1] || 3;
  const crafted = await craftMessages({ campaign, lead, step: nextStep, channel, token });

  const message = {
    id: id(),
    leadId: lead.id,
    campaignId: campaign.id,
    channel,
    step: nextStep,
    subject: crafted.subject,
    body: crafted.body,
    status: 'queued',
    scheduledAt: daysFromNow(delayDays),
    createdAt: now(),
    sentAt: null,
    meta: { mode: crafted.mode, model: crafted.model, warning: crafted.warning },
  };

  updateDb((d) => {
    // Avoid duplicate follow-ups for same step/channel
    const exists = d.messages.some(
      (m) =>
        m.leadId === lead.id &&
        m.channel === channel &&
        m.step === nextStep &&
        ['queued', 'sent', 'awaiting_linkedin_send'].includes(m.status)
    );
    if (!exists) d.messages.unshift(message);
    return d;
  });

  return message;
}

export async function enqueueInitialOutreach({ campaignId, leadIds, channels, token }) {
  const db = readDb();
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const selected = db.leads.filter(
    (l) => l.campaignId === campaignId && (!leadIds?.length || leadIds.includes(l.id))
  );

  const created = [];
  for (const lead of selected) {
    for (const channel of channels) {
      if (channel === 'email' && !lead.email) continue;
      if (channel === 'linkedin' && !lead.linkedinUrl && !lead.email) {
        // still allow LinkedIn draft without URL — user can paste
      }

      const exists = db.messages.some(
        (m) => m.leadId === lead.id && m.channel === channel && m.step === 0
      );
      if (exists) continue;

      const crafted = await craftMessages({ campaign, lead, step: 0, channel, token });
      const message = {
        id: id(),
        leadId: lead.id,
        campaignId: campaign.id,
        channel,
        step: 0,
        subject: crafted.subject,
        body: crafted.body,
        status: 'queued',
        scheduledAt: now(),
        createdAt: now(),
        sentAt: null,
        meta: { mode: crafted.mode, model: crafted.model, warning: crafted.warning },
      };
      created.push(message);
    }
  }

  updateDb((d) => {
    for (const message of created) {
      d.messages.unshift(message);
      const lead = d.leads.find((l) => l.id === message.leadId);
      if (lead && lead.status === 'new') lead.status = 'queued';
    }
    return d;
  });

  return created;
}
