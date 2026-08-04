# Deploy on Render

Cycle is configured as a Render **Web Service** via [`render.yaml`](./render.yaml).

## One-click Blueprint

1. Open: [Deploy Blueprint on Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/kaushik-i-b/class&branch=cursor/qwin-ai-web-scraper-d5a6)
2. Sign in to Render and connect the `kaushik-i-b/class` GitHub repo if prompted
3. Apply the Blueprint (`cycle-gtm-os`, free plan)
4. Optional: set `HF_TOKEN` in the service Environment for Qwen outreach drafts
5. Wait for the first deploy; open the `onrender.com` URL

## Manual setup (Dashboard)

1. **New → Web Service** → select this GitHub repo  
2. Branch: `cursor/qwin-ai-web-scraper-d5a6`  
3. Runtime: **Node**  
4. Build command: `npm ci && npm run build`  
5. Start command: `npm start`  
6. Instance: **Free**  
7. Health check path: `/api/health`  
8. Add env `NODE_ENV=production` (and optional `HF_TOKEN`)

## Notes

- Free instances sleep after idle; first request may take ~30–60s
- Local JSON store is ephemeral on free tier (reseeds on cold start)
- Production serves the Vite `dist/` bundle from Express on `0.0.0.0:$PORT`
