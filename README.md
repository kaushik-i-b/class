# Cycle — GTM Engineering OS

Implements the GTM Engineering product brief **and** the technical requirements architecture:

`CRM/SoR → Enrichment → Feature Store → Scoring Engine → Action Layer → Analytics`  
(with a feedback loop from outcomes back into the feature store).

## Spec alignment

| Requirement | Implementation |
|---|---|
| Identity resolution | `server/identity.js` — domain normalize + email/domain fuzzy match |
| Enrichment contract + confidence | Field-level `confidence` / `last_verified_at`; waterfall scrape → heuristic |
| Coverage gate (&lt;60%) | Scoring discounts/refuses; Action skips gated accounts |
| Feature store | `events[]` timestamped facts → decayed features (`server/features.js`) |
| Scoring v1 | Weighted linear model, 0–1 normalize, time decay, `scores[]` versioned rows |
| Decoupling | Action reads **only** `scores` / enqueue payload — never raw signals |
| Tier-transition triggers | Warm→Hot / Cold→Warm enqueue + 14-day cooldown |
| Draft-for-review | Default campaign/queue mode |
| score_at_send_time | Logged on every touch for attribution |
| Experiment variants | First-class `variant_id` + hypothesis + segment |
| KPI math | Speed-to-lead, coverage, heat→conversion (60d), sprint velocity, lift (directional flag) |

**Intentionally stubbed for local MVP (integrate later):** live Salesforce/HubSpot CDC, Clearbit/ZoomInfo waterfall vendors, Outreach/Salesloft send APIs, learned ML scoring (step 7 in build sequencing).

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Optional `HF_TOKEN` for Qwen outreach personalization.

## Build sequencing (followed)

1. Identity + SoR spine  
2. Enrichment + coverage gating  
3. Event/feature store  
4. Scoring engine v1 (hand-weighted, decoupled)  
5. Action layer draft-for-review  
6. Analytics + experiment framework  
7. Auto-send + learned model — **not enabled yet** (needs logged outcomes volume)
