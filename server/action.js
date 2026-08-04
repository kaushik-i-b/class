import { id, now } from './store.js';
import { latestScore } from './scoring.js';
import { appendEvent } from './features.js';

export const TRIGGER_COOLDOWN_DAYS = 14;

/**
 * Tool-agnostic enqueue — Action Layer never reads raw signals.
 * Spec §2.5: enqueue_sequence(account_id, sequence_id, mode)
 */
export function enqueueSequence(db, { account_id, sequence_id, mode = 'draft', reason, trigger_signal }) {
  if (!db.action_queue) db.action_queue = [];

  const score = latestScore(db, account_id);
  if (!score) {
    return { ok: false, error: 'No score row — Action Layer refuses raw-signal triggers' };
  }
  if (score.refused || score.gated) {
    return {
      ok: false,
      error: `Score gated/refused: ${score.gateReason || 'low coverage'}`,
      score,
    };
  }

  if (isInCooldown(db, account_id)) {
    return { ok: false, error: `Cooldown active (${TRIGGER_COOLDOWN_DAYS}d)`, score };
  }

  const sequence =
    db.sequences.find((s) => s.id === sequence_id) ||
    db.sequences.find((s) => s.heatTier === score.tier && s.status === 'live');

  if (!sequence) {
    return { ok: false, error: `No sequence for tier ${score.tier}`, score };
  }

  const item = {
    id: id(),
    account_id,
    sequence_id: sequence.id,
    mode,
    status: 'queued',
    reason: reason || `tier=${score.tier}`,
    trigger_signal: trigger_signal || null,
    score_id: score.id,
    score_at_enqueue: score.score,
    tier_at_enqueue: score.tier,
    score_version: score.score_version,
    created_at: now(),
  };

  db.action_queue.unshift(item);
  return { ok: true, item, sequence, score };
}

export function isInCooldown(db, accountId) {
  const cutoff = Date.now() - TRIGGER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const recentTouch = (db.touches || []).find(
    (t) =>
      t.accountId === accountId &&
      t.sentAt &&
      new Date(t.sentAt).getTime() >= cutoff
  );
  const recentQueue = (db.action_queue || []).find(
    (q) =>
      q.account_id === accountId &&
      q.status !== 'cancelled' &&
      new Date(q.created_at).getTime() >= cutoff
  );
  return Boolean(recentTouch || recentQueue);
}

/**
 * Fire only on tier state transitions (e.g. warm→hot), not every recompute.
 */
export function detectTierTransitions(db) {
  const transitions = [];
  for (const account of db.accounts || []) {
    const scores = (db.scores || []).filter((s) => s.account_id === account.id);
    if (scores.length < 1) continue;
    const latest = scores[0];
    const previous = scores[1];
    const prevTier = latest.previous_tier || previous?.tier;
    if (prevTier && latest.tier && prevTier !== latest.tier) {
      transitions.push({
        account_id: account.id,
        from: prevTier,
        to: latest.tier,
        score_id: latest.id,
        score: latest.score,
      });
    }
  }
  return transitions;
}

export function processTierTriggers(db, { mode = 'draft' } = {}) {
  const transitions = detectTierTransitions(db);
  const results = [];

  for (const t of transitions) {
    // Prefer upgrades into hot/warm
    if (!(t.to === 'hot' || (t.from === 'cold' && t.to === 'warm'))) {
      results.push({ ...t, enqueued: false, reason: 'non-actionable transition' });
      continue;
    }

    appendEvent(db, {
      account_id: t.account_id,
      signal_type: 'tier_crossed',
      value: 1,
      source: 'scoring_engine',
      timestamp: now(),
    });

    const account = db.accounts.find((a) => a.id === t.account_id);
    const enq = enqueueSequence(db, {
      account_id: t.account_id,
      sequence_id: null,
      mode,
      reason: `tier_transition:${t.from}->${t.to}`,
      trigger_signal: account?.customSignal?.value || `crossed to ${t.to}`,
    });

    results.push({ ...t, enqueued: enq.ok, enqueue: enq });
  }

  return results;
}
