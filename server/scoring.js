import { id, now } from './store.js';
import { materializeFeatures } from './features.js';

export const SCORE_VERSION = 'v1.linear.decay.2026-08';
export const COVERAGE_GATE = 60; // refuse / heavily discount below this (§2.2)

/** Hand-set weights — sum to 1. Spec §2.4 weighted linear model. */
export const WEIGHTS = {
  icp_fit: 0.3,
  site_visits: 0.2,
  content_engagement: 0.2,
  replies: 0.2,
  custom_signal: 0.1,
};

const CORE_FIELDS = [
  'industry',
  'employeeCount',
  'funding',
  'techStack',
  'keyContact',
  'customSignal',
  'icpFitScore',
  'domain',
];

export function enrichmentCoverage(account) {
  const checks = [
    account.industry,
    account.employeeCount,
    account.funding,
    account.techStack?.length,
    account.keyContact?.name,
    account.keyContact?.email || account.keyContact?.title,
    account.customSignal?.value,
    typeof account.icpFitScore === 'number' || account.signals?.icpFit,
    account.domain || account.website,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function fieldQuality(account) {
  const verifiedAt = account.enrichment?.lastEnrichedAt || account.updatedAt || now();
  const conf = (value, confidence = value ? 0.85 : 0) => ({
    value: value ?? null,
    confidence,
    last_verified_at: value ? verifiedAt : null,
  });

  return {
    industry: conf(account.industry, account.enrichment?.fieldConfidence?.industry ?? (account.industry ? 0.8 : 0)),
    employee_count: conf(
      account.employeeCount,
      account.enrichment?.fieldConfidence?.employeeCount ?? (account.employeeCount ? 0.7 : 0)
    ),
    funding: conf(account.funding, account.enrichment?.fieldConfidence?.funding ?? (account.funding ? 0.75 : 0)),
    tech_stack: conf(
      account.techStack,
      account.enrichment?.fieldConfidence?.techStack ?? (account.techStack?.length ? 0.7 : 0)
    ),
    key_contact: conf(
      account.keyContact,
      account.enrichment?.fieldConfidence?.keyContact ?? (account.keyContact?.name ? 0.8 : 0)
    ),
    custom_signal: conf(
      account.customSignal,
      account.enrichment?.fieldConfidence?.customSignal ?? (account.customSignal ? 0.65 : 0)
    ),
    icp_fit_score: conf(
      account.icpFitScore ?? account.signals?.icpFit,
      0.9
    ),
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function normalizeMinMax(value, min, max) {
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

/**
 * Percentile-ish tiering over the current active account universe.
 * Falls back to fixed cutoffs when universe is tiny.
 */
export function tierFromScore(score, universeScores = []) {
  if (universeScores.length >= 5) {
    const sorted = [...universeScores].sort((a, b) => a - b);
    const pct = (sorted.filter((s) => s <= score).length / sorted.length) * 100;
    if (pct >= 75) return 'hot';
    if (pct >= 40) return 'warm';
    return 'cold';
  }
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

/**
 * Scoring engine v1 — reads features + enrichment, writes versioned score rows.
 * Action layer must only consume these rows, never raw signals.
 */
export function computeScoreRecord(db, account) {
  const coverage = enrichmentCoverage(account);
  const features = materializeFeatures(db, account.id);
  const icpRaw = Number(account.icpFitScore ?? account.signals?.icpFit ?? 0);

  // Normalize each signal to 0–1 before weighting (§2.4)
  const normalized = {
    icp_fit: normalizeMinMax(icpRaw, 0, 30),
    site_visits: normalizeMinMax(features.site_visits_decayed, 0, 8),
    content_engagement: normalizeMinMax(features.content_engagement_decayed, 0, 5),
    replies: normalizeMinMax(features.replies_decayed, 0, 4),
    custom_signal: normalizeMinMax(features.custom_signal_decayed, 0, 2),
  };

  let raw =
    WEIGHTS.icp_fit * normalized.icp_fit +
    WEIGHTS.site_visits * normalized.site_visits +
    WEIGHTS.content_engagement * normalized.content_engagement +
    WEIGHTS.replies * normalized.replies +
    WEIGHTS.custom_signal * normalized.custom_signal;

  let gated = false;
  let gateReason = null;

  // Coverage gate: refuse / heavily discount below threshold (§2.2 / §5)
  if (coverage < COVERAGE_GATE) {
    gated = true;
    gateReason = `coverage ${coverage}% < ${COVERAGE_GATE}% gate`;
    raw *= 0.35; // heavy discount; Action should still treat as non-triggerable when refused
  }

  const heatScore = Math.round(clamp01(raw) * 1000) / 10; // 0–100 one decimal

  return {
    account_id: account.id,
    score: heatScore,
    coverage,
    gated,
    gateReason,
    score_version: SCORE_VERSION,
    computed_at: now(),
    features,
    normalized,
    weights: WEIGHTS,
    refused: coverage < COVERAGE_GATE && heatScore < 25,
  };
}

export function writeScore(db, account, previousTier = null) {
  if (!db.scores) db.scores = [];
  const record = computeScoreRecord(db, account);

  // Universe for percentile tiers excludes currently computing account's old score
  const universe = db.accounts
    .map((a) => {
      const latest = latestScore(db, a.id);
      return a.id === account.id ? record.score : latest?.score;
    })
    .filter((n) => typeof n === 'number');

  const tier = record.refused ? 'cold' : tierFromScore(record.score, universe);
  const scoreRow = {
    id: id(),
    ...record,
    tier,
    previous_tier: previousTier || latestScore(db, account.id)?.tier || null,
  };

  db.scores.unshift(scoreRow);

  // Keep account denormalized for UI convenience, but Action must use scores table
  account.heatScore = scoreRow.score;
  account.heatTier = scoreRow.tier;
  account.scoreBreakdown = {
    coverage: scoreRow.coverage,
    gated: scoreRow.gated,
    gateReason: scoreRow.gateReason,
    features: scoreRow.features,
    normalized: scoreRow.normalized,
    weights: scoreRow.weights,
    score_version: scoreRow.score_version,
  };
  account.enrichment = {
    ...(account.enrichment || {}),
    coverage: scoreRow.coverage,
  };
  account.fieldQuality = fieldQuality(account);
  account.updatedAt = now();

  return scoreRow;
}

export function latestScore(db, accountId) {
  return (db.scores || []).find((s) => s.account_id === accountId) || null;
}

export function rescoreAll(db) {
  const rows = [];
  for (const account of db.accounts || []) {
    const prev = latestScore(db, account.id)?.tier || account.heatTier || null;
    rows.push(writeScore(db, account, prev));
  }
  return rows;
}

/** @deprecated use writeScore — kept for transitional callers */
export function applyScore(account, db = { events: [], scores: [], accounts: [account] }) {
  const local = {
    ...db,
    accounts: db.accounts?.length ? db.accounts : [account],
    events: db.events || [],
    scores: db.scores || [],
  };
  writeScore(local, account, account.heatTier || null);
  return account;
}

export { CORE_FIELDS };
