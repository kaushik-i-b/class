# Cycle — GTM Engineering OS

A go-to-market operating system that runs like a product: ingest accounts, enrich them, score heat, trigger personalized outreach, and measure what works on a two-week sprint cycle.

This is **not** another outbound tool — it is a compounding GTM engine.

## Architecture (4 layers)

1. **System of record** — local account/contact store (CRM-shaped; swap for Salesforce/HubSpot later)
2. **Enrichment layer** — scrapes company sites + fills core fields (industry, size, funding, key contact, custom signal, tech stack)
3. **Action layer** — heat-tier sequences with draft-for-review outreach (Qwen personalization when an HF token is set)
4. **Analytics engine** — touches, outcomes, sprint experiments, and KPI dashboard

## MVP features

- Enrichment pipeline for core fields + coverage %
- Composite **heat score** (ICP fit, site visits, content engagement, replies, coverage bonus)
- Editable outreach sequences tied to Hot / Warm / Cold tiers
- Dashboard: accounts by heat, live campaigns, sprint results
- Two-week sprint workflow with experiment logging and lift

## KPIs surfaced

- Speed-to-lead
- Data coverage
- Heat-score-to-conversion
- Sprint velocity
- Lift per experiment

## Stack

- React + Vite frontend
- Express API + JSON system of record
- Cheerio web scraper for enrichment
- Qwen (`Qwen/Qwen2.5-7B-Instruct`) via Hugging Face Inference Providers for outreach drafts

## Setup

```bash
npm install
cp .env.example .env   # optional HF_TOKEN
npm run dev
```

Open `http://localhost:5173`.

### Optional AI token

Add `HF_TOKEN` in `.env` or paste a Hugging Face token in **Settings**. Enrichment and scoring work without it; Qwen drafting falls back to templates.

## Build order (as designed)

1. Data quality / enrichment  
2. Scoring (decoupled from raw signals)  
3. Outreach triggering from score tier  
4. Sprint measurement loop  

## Scripts

```bash
npm run dev      # API :8787 + Vite :5173
npm run build
npm start        # serve built app from Express
npm run seed     # reset demo data
```
