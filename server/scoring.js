/** Heat score is composite — signals feed the score; score (not raw signal) drives outreach. */

export const HEAT_TIERS = {
  hot: { min: 70, label: 'Hot', color: '#ff6b4a' },
  warm: { min: 40, label: 'Warm', color: '#f0a35e' },
  cold: { min: 0, label: 'Cold', color: '#6b8f8a' },
};

export function tierFromScore(score) {
  if (score >= HEAT_TIERS.hot.min) return 'hot';
  if (score >= HEAT_TIERS.warm.min) return 'warm';
  return 'cold';
}

export function enrichmentCoverage(account) {
  const fields = [
    account.industry,
    account.employeeCount,
    account.funding,
    account.techStack?.length,
    account.keyContact?.name,
    account.keyContact?.email || account.keyContact?.title,
    account.customSignal?.value,
    account.website || account.domain,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

export function computeHeatScore(account) {
  const signals = account.signals || {};
  const icpFit = clamp(Number(signals.icpFit) || 0, 0, 30);
  const siteVisits = clamp(Number(signals.siteVisits) || 0, 0, 20);
  const contentEngagement = clamp(Number(signals.contentEngagement) || 0, 0, 20);
  const replies = clamp(Number(signals.replies) || 0, 0, 20);
  const coverage = enrichmentCoverage(account);
  const coverageBonus = Math.round((coverage / 100) * 10);

  const score = clamp(icpFit + siteVisits + contentEngagement + replies + coverageBonus, 0, 100);
  const breakdown = {
    icpFit,
    siteVisits,
    contentEngagement,
    replies,
    coverageBonus,
    coverage,
  };

  return {
    heatScore: score,
    heatTier: tierFromScore(score),
    breakdown,
  };
}

export function applyScore(account) {
  const scored = computeHeatScore(account);
  return {
    ...account,
    heatScore: scored.heatScore,
    heatTier: scored.heatTier,
    scoreBreakdown: scored.breakdown,
    enrichment: {
      ...(account.enrichment || {}),
      coverage: scored.breakdown.coverage,
    },
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
