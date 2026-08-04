import { analyzeWithQwen } from './qwen.js';

const FALLBACK_OPENERS = {
  hot: 'Saw the recent momentum on your side and wanted to make this concrete.',
  warm: 'Been tracking a few signals that suggest timing might be right.',
  cold: 'Quick note — sharing a hypothesis, not a pitch deck.',
};

export function renderTemplate(template, account) {
  const contact = account.keyContact || {};
  const map = {
    '{{company}}': account.name || 'there',
    '{{domain}}': account.domain || '',
    '{{industry}}': account.industry || 'your space',
    '{{contact_name}}': contact.name || 'there',
    '{{contact_title}}': contact.title || 'leader',
    '{{funding}}': account.funding || 'your stage',
    '{{signal}}': account.customSignal?.value || 'recent activity',
    '{{heat_tier}}': account.heatTier || 'warm',
    '{{tech}}': (account.techStack || []).slice(0, 2).join(', ') || 'your stack',
  };

  return Object.entries(map).reduce(
    (body, [token, value]) => body.split(token).join(value),
    template
  );
}

export async function draftOutreach({ account, sequenceStep, token, useAi = true }) {
  const subject = renderTemplate(sequenceStep.subjectTemplate, account);
  const baseBody = renderTemplate(sequenceStep.bodyTemplate, account);

  if (!useAi) {
    return {
      subject,
      body: baseBody,
      mode: 'template',
      model: null,
    };
  }

  try {
    const page = {
      url: account.website || `https://${account.domain}`,
      title: account.name,
      description: `${account.industry} · ${account.funding} · heat ${account.heatTier}`,
      text: [
        `Company: ${account.name}`,
        `Domain: ${account.domain}`,
        `Industry: ${account.industry}`,
        `Employees: ${account.employeeCount}`,
        `Funding: ${account.funding}`,
        `Tech: ${(account.techStack || []).join(', ')}`,
        `Contact: ${account.keyContact?.name} (${account.keyContact?.title})`,
        `Signal: ${account.customSignal?.value}`,
        `Heat: ${account.heatScore} (${account.heatTier})`,
        `Template subject: ${subject}`,
        `Template body: ${baseBody}`,
      ].join('\n'),
    };

    const result = await analyzeWithQwen({
      page,
      mode: 'qa',
      question:
        'Rewrite the outreach email for an SDR. Keep it under 120 words, personalized, non-hype, and grounded in the account signals. Return exactly two lines first as "Subject: ..." then the email body. No markdown fences.',
      token,
    });

    const parsed = parseAiEmail(result.answer, subject, baseBody);
    return {
      ...parsed,
      mode: 'qwen',
      model: result.model,
    };
  } catch (error) {
    if (error.code === 'NO_TOKEN') {
      return {
        subject,
        body: `${FALLBACK_OPENERS[account.heatTier] || FALLBACK_OPENERS.warm}\n\n${baseBody}`,
        mode: 'template_fallback',
        model: null,
        warning: error.message,
      };
    }
    throw error;
  }
}

function parseAiEmail(answer, fallbackSubject, fallbackBody) {
  const text = String(answer || '').trim();
  const subjectMatch = text.match(/^\s*Subject:\s*(.+)$/im);
  if (!subjectMatch) {
    return { subject: fallbackSubject, body: text || fallbackBody };
  }
  const subject = subjectMatch[1].trim();
  const body = text.replace(subjectMatch[0], '').trim();
  return { subject: subject || fallbackSubject, body: body || fallbackBody };
}
