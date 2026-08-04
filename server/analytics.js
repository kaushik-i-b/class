import { enrichmentCoverage } from './scoring.js';

export function buildDashboard(db) {
  const accounts = db.accounts || [];
  const byTier = { hot: 0, warm: 0, cold: 0 };
  for (const a of accounts) byTier[a.heatTier || 'cold'] = (byTier[a.heatTier || 'cold'] || 0) + 1;

  const coverageValues = accounts.map((a) => a.enrichment?.coverage ?? enrichmentCoverage(a));
  const dataCoverage = accounts.length
    ? Math.round(coverageValues.reduce((s, n) => s + n, 0) / accounts.length)
    : 0;

  const touches = db.touches || [];
  const sentTouches = touches.filter((t) => t.sentAt);
  const speedSamples = sentTouches
    .map((t) => t.signalToTouchHours)
    .filter((n) => typeof n === 'number');
  const speedToLeadHours = speedSamples.length
    ? Math.round((speedSamples.reduce((s, n) => s + n, 0) / speedSamples.length) * 10) / 10
    : null;

  const hotAccounts = accounts.filter((a) => a.heatTier === 'hot');
  const hotIds = new Set(hotAccounts.map((a) => a.id));
  const hotConverted = touches.filter(
    (t) => hotIds.has(t.accountId) && (t.status === 'replied' || t.status === 'meeting')
  ).length;
  const heatToConversion = hotAccounts.length
    ? Math.round((hotConverted / Math.max(hotAccounts.length, 1)) * 100)
    : 0;

  const activeSprint = (db.sprints || []).find((s) => s.status === 'active') || null;
  const sprintExperiments = (db.experiments || []).filter((e) =>
    activeSprint ? e.sprintId === activeSprint.id : false
  );
  const completedSprints = (db.sprints || []).filter((s) => s.status === 'completed');
  const sprintVelocity = completedSprints.length
    ? Math.round(
        ((db.experiments || []).filter((e) =>
          completedSprints.some((s) => s.id === e.sprintId)
        ).length /
          completedSprints.length) *
          10
      ) / 10
    : sprintExperiments.length;

  const liveCampaigns = (db.campaigns || []).filter((c) => c.status === 'live');

  return {
    kpis: {
      speedToLeadHours,
      dataCoverage,
      heatToConversion,
      sprintVelocity,
      liftPerExperiment: averageLift(db.experiments || []),
    },
    tiers: byTier,
    liveCampaigns: liveCampaigns.length,
    activeSprint,
    recentExperiments: (db.experiments || []).slice(0, 5),
    accountCount: accounts.length,
    touchCount: touches.length,
  };
}

function averageLift(experiments) {
  if (!experiments.length) return 0;
  const sum = experiments.reduce((s, e) => s + (Number(e.lift) || 0), 0);
  return Math.round((sum / experiments.length) * 1000) / 1000;
}
