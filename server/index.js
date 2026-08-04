import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { scrapeUrl } from './scrape.js';
import { analyzeWithQwen } from './qwen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 8787;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'qwin',
    model: process.env.QWEN_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    hasServerToken: Boolean(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN),
  });
});

app.post('/api/scrape', async (req, res) => {
  try {
    const page = await scrapeUrl(req.body?.url);
    res.json({ ok: true, page });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Scrape failed' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { page, mode, question, token, model } = req.body || {};
    if (!page?.text || !page?.url || !page?.title) {
      return res.status(400).json({ ok: false, error: 'Scraped page payload is required' });
    }

    const headerToken = req.get('x-hf-token');
    const result = await analyzeWithQwen({
      page,
      mode,
      question,
      token: token || headerToken,
      model,
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.code === 'NO_TOKEN' ? 401 : error.status || 500;
    res.status(status).json({
      ok: false,
      error: error.message || 'Analysis failed',
      code: error.code || 'ANALYZE_ERROR',
    });
  }
});

if (isProd) {
  const distDir = path.join(rootDir, 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Qwin server listening on http://localhost:${PORT}`);
});
