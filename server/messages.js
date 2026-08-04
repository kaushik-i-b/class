import { analyzeWithQwen } from './qwen.js';

function fallbackEmail(campaign, lead, step) {
  const first = (lead.name || 'there').split(' ')[0];
  if (step === 0) {
    return {
      subject: `Quick idea for ${lead.company || 'your team'}`,
      body: `Hi ${first},\n\nI help ${campaign.icp || 'teams like yours'} with ${campaign.offer || 'pipeline that compounds'}.\n\nWorth a 10-minute look this week?\n\nBest`,
    };
  }
  if (step === 1) {
    return {
      subject: `Re: Quick idea for ${lead.company || 'your team'}`,
      body: `Hi ${first},\n\nBumping this once — happy to send a short teardown relevant to ${lead.company || 'you'}.\n\nEither way, appreciate the time.\n\nBest`,
    };
  }
  return {
    subject: `Last note — ${lead.company || 'your team'}`,
    body: `Hi ${first},\n\nClosing the loop on my earlier note about ${campaign.offer || 'GTM'}. If timing is off, I can check back next quarter.\n\nBest`,
  };
}

function fallbackLinkedIn(campaign, lead, step) {
  const first = (lead.name || 'there').split(' ')[0];
  if (step === 0) {
    return `Hi ${first} — saw ${lead.company || 'your work'}. We help ${campaign.icp || 'teams'} with ${campaign.offer || 'outbound that actually converts'}. Open to a short chat?`;
  }
  if (step === 1) {
    return `Hi ${first}, following up in case my note got buried. Happy to share what similar ${campaign.icp || 'companies'} tested recently.`;
  }
  return `Last bump from me, ${first}. If useful later, I’m easy to find here.`;
}

function parseEmail(answer, fallback) {
  const text = String(answer || '').trim();
  const subjectMatch = text.match(/^\s*Subject:\s*(.+)$/im);
  if (!subjectMatch) return { subject: fallback.subject, body: text || fallback.body };
  return {
    subject: subjectMatch[1].trim() || fallback.subject,
    body: text.replace(subjectMatch[0], '').trim() || fallback.body,
  };
}

export async function craftMessages({ campaign, lead, step = 0, channel = 'email', token }) {
  const fbEmail = fallbackEmail(campaign, lead, step);
  const fbLi = fallbackLinkedIn(campaign, lead, step);

  const stepLabel =
    step === 0 ? 'initial outreach' : step === 1 ? 'first follow-up' : 'final follow-up';

  try {
    const page = {
      url: lead.sourceUrl || lead.domain || 'https://example.com',
      title: `${lead.name} @ ${lead.company}`,
      description: campaign.offer,
      text: [
        `Campaign: ${campaign.name}`,
        `ICP: ${campaign.icp}`,
        `Offer: ${campaign.offer}`,
        `Lead: ${lead.name}`,
        `Title: ${lead.title || 'unknown'}`,
        `Company: ${lead.company}`,
        `Email: ${lead.email || 'n/a'}`,
        `LinkedIn: ${lead.linkedinUrl || 'n/a'}`,
        `Snippet: ${lead.snippet || ''}`,
        `Step: ${stepLabel}`,
        `Channel: ${channel}`,
      ].join('\n'),
    };

    if (channel === 'linkedin') {
      const result = await analyzeWithQwen({
        page,
        mode: 'qa',
        question: `Write a short LinkedIn ${stepLabel} message (max 300 characters). No subject line. No markdown. Personalized, not salesy.`,
        token,
      });
      return {
        subject: '',
        body: (result.answer || fbLi).trim().slice(0, 500),
        mode: 'qwen',
        model: result.model,
      };
    }

    const result = await analyzeWithQwen({
      page,
      mode: 'qa',
      question: `Write a concise ${stepLabel} sales email. Return exactly: first line "Subject: ..." then the body under 120 words. No markdown fences.`,
      token,
    });
    const parsed = parseEmail(result.answer, fbEmail);
    return { ...parsed, mode: 'qwen', model: result.model };
  } catch (error) {
    if (channel === 'linkedin') {
      return { subject: '', body: fbLi, mode: 'template', model: null, warning: error.message };
    }
    return { ...fbEmail, mode: 'template', model: null, warning: error.message };
  }
}
