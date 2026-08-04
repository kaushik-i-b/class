# Cycle — Scrape leads, AI outreach, auto follow-up

Usable campaign tool:

1. **Create a campaign** (ICP + offer + email/LinkedIn)
2. **Find leads** by scraping URLs or keyword search (emails + LinkedIn links)
3. **AI writes** first-touch email + LinkedIn messages (Qwen when `HF_TOKEN` is set)
4. **Auto follow-ups** on day 3 / 7 (configurable) until replied
5. **Send**: real email via SMTP, LinkedIn via copy → open profile → confirm

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Real email (optional)

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=secret
SMTP_FROM=You <you@example.com>
HF_TOKEN=hf_xxx
```

Without SMTP, emails are **simulated** (queued → marked sent) so you can still test the flow.

## LinkedIn

LinkedIn does not allow unattended auto-send from third-party apps without their partnership API. Cycle drafts AI messages, opens the profile, and schedules the next AI follow-up after you click **Mark LinkedIn sent**.

## Render

See `DEPLOY_RENDER.md` / `render.yaml`.
