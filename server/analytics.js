import { enrichmentCoverage } from './scoring.js';
import { latestScore } from './scoring.js';

const ATTRIBUTION_WINDOW_DAYS = 60;

export function buildDashboard(db) {
  const accounts = db.accounts || [];
  const byTier = { hot: 0, warm: 0, cold: 0 };
  for (const a of accounts) {
    const tier = latestScore(db, a.id)?.tier || a.heatTier || 'cold';
    byTier[tier] = (byTier[tier] || 0) + 1;
  }

  // Data coverage — average of core fields populated / expected (§3)
  const coverageValues = accounts.map((a) => a.enrichment?.coverage ?? enrichmentCoverage(a));
  const dataCoverage = accounts.length
    ? Math.round(coverageValues.reduce((s, n) => s + n, 0) / accounts.length)
    : 0;

  const touches = db.touches || [];

  // Speed-to-lead: first_outreach - signal_crossed_threshold (§3)
  const speedSamples = touches
    .filter((t) => t.sentAt && typeof t.signalToTouchHours === 'number')
    .map((t) => t.signalToTouchHours);
  const speedToLeadHours = speedSamples.length
    ? Math.round((speedSamples.reduce((s, n) => s + n, 0) / speedSamples.length) * 10) / 10
    : null;

  // Heat→conversion over attribution window using score_at_send_time / current hot tier
  const cutoff = Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const hotAccountIds = new Set(
    accounts
      .filter((a) => (latestScore(db, a.id)?.tier || a.heatTier) === 'hot')
      .map((a) => a.id)
  );
  const hotConverted = new Set(
    touches
      .filter(
        (t) =>
          hotAccountIds.has(t.accountId) &&
          (t.status === 'meeting' || t.status === 'opportunity' || t.status === 'replied') &&
          t.sentAt &&
          new Date(t.sentAt).getTime() >= cutoff
      )
      .map((t) => t.accountId)
  );
  const heatToConversion = hotAccountIds.size
    ? Math.round((hotConverted.size / hotAccountIds.size) * 100)
    : 0;

  const activeSprint = (db.sprints || []).find((s) => s.status === 'active') || null;
  const experiments = db.experiments || [];
  const completedSprints = (db.sprints || []).filter((s) => s.status === 'completed');
  const sprintVelocity = completedSprints.length
    ? Math.round(
        (experiments.filter((e) => completedSprints.some((s) => s.id === e.sprintId)).length /
          completedSprints.length) *
          10
      ) / 10
    : experiments.filter((e) => e.sprintId === activeSprint?.id).length;

  const lift = computeLift(experiments);
  const liveCampaigns = (db.campaigns || []).filter((c) => c.status === 'live');
  const queued = (db.action_queue || []).filter((q) => q.status === 'queued').length;
  const gatedScores = (db.scores || []).filter((s) => s.gated).length;

  return {
    kpis: {
      speedToLeadHours,
      dataCoverage,
      heatToConversion,
      heatToConversionWindowDays: ATTRIBUTION_WINDOW_DAYS,
      sprintVelocity,
      liftPerExperiment: lift.average,
      liftDirectionalOnly: lift.directionalOnly,
    },
    tiers: byTier,
    liveCampaigns: liveCampaigns.length,
    queuedActions: queued,
    gatedScores,
    activeSprint,
    recentExperiments: experiments.slice(0, 5),
    accountCount: accounts.length,
    touchCount: touches.length,
    eventCount: (db.events || []).length,
    scoreVersion: (db.scores || [])[0]?.score_version || null,
    architecture: [
      'SoR',
      'Enrichment',
      'FeatureStore',
      'ScoringEngine',
      'ActionLayer',
      'Analytics',
    ],
  };
}

function computeLift(experiments) {
  if (!experiments.length) return { average: 0, directionalOnly: true };
  const withSamples = experiments.filter((e) => typeof e.lift === 'number');
  if (!withSamples.length) return { average: 0, directionalOnly: true };
  const sum = withSamples.reduce((s, e) => s + Number(e.lift), 0);
  // Low volume → directional only (§3)
  const directionalOnly = withSamples.every((e) => (e.sampleSize || 0) < 100);
  return {
    average: Math.round((sum / withSamples.length) * 1000) / 1000,
    directionalOnly,
  };
}
