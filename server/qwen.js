const DEFAULT_MODEL = process.env.QWEN_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
const HF_ROUTER = 'https://router.huggingface.co/v1/chat/completions';

const PRESET_PROMPTS = {
  summarize:
    'Summarize the scraped webpage clearly in 5–8 sentences. Lead with the main idea, then cover the most important supporting points.',
  keypoints:
    'Extract 6–10 concise bullet-point key takeaways from the scraped webpage. Focus on facts, claims, and actionable insights.',
  extract:
    'Extract structured information from the scraped webpage: entities, dates, numbers, product/service names, and any contact or reference details. Use short labeled sections.',
  qa: null,
};

function truncateContent(text, max = 14000) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[Content truncated for model context]`;
}

export function resolvePrompt(mode, question) {
  if (mode === 'qa') {
    const q = String(question || '').trim();
    if (!q) throw new Error('A question is required for Q&A mode');
    return `Answer the user's question using only the scraped webpage content. If the answer is not present, say so.\n\nQuestion: ${q}`;
  }

  const preset = PRESET_PROMPTS[mode];
  if (!preset) throw new Error('Unknown analysis mode');
  return preset;
}

export async function analyzeWithQwen({
  page,
  mode = 'summarize',
  question,
  token,
  model = DEFAULT_MODEL,
}) {
  const apiToken = token || process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
  if (!apiToken) {
    const err = new Error(
      'Missing Hugging Face token. Add HF_TOKEN on the server or paste a token in Settings.'
    );
    err.code = 'NO_TOKEN';
    throw err;
  }

  const instruction = resolvePrompt(mode, question);
  const content = truncateContent(page.text || '');

  const messages = [
    {
      role: 'system',
      content:
        'You are Qwin, an AI research assistant powered by Qwen. You analyze scraped webpage content carefully, stay grounded in the source text, and write clearly for a general audience.',
    },
    {
      role: 'user',
      content: [
        `Source URL: ${page.url}`,
        `Title: ${page.title}`,
        page.description ? `Description: ${page.description}` : null,
        '',
        '--- PAGE CONTENT ---',
        content,
        '--- END CONTENT ---',
        '',
        instruction,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const response = await fetch(HF_ROUTER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      payload?.error?.message ||
      payload?.error ||
      payload?.message ||
      `Qwen request failed (${response.status})`;
    const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    err.code = 'QWEN_ERROR';
    err.status = response.status;
    throw err;
  }

  const answer = payload?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error('Qwen returned an empty response');
  }

  return {
    answer,
    model: payload.model || model,
    mode,
    usage: payload.usage || null,
  };
}
