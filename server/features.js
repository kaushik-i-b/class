import { id, now } from './store.js';

export const SIGNAL_TYPES = [
  'site_visit',
  'email_reply',
  'content_download',
  'meeting_booked',
  'opportunity_created',
  'tier_crossed',
  'custom_signal',
];

/** Half-life in days for exponential decay of behavioral signals. */
export const SIGNAL_HALF_LIFE_DAYS = {
  site_visit: 14,
  email_reply: 21,
  content_download: 21,
  meeting_booked: 45,
  opportunity_created: 60,
  custom_signal: 30,
  tier_crossed: 14,
};

export function appendEvent(db, event) {
  if (!db.events) db.events = [];
  const row = {
    id: id(),
    account_id: event.account_id,
    signal_type: event.signal_type,
    value: event.value ?? 1,
    timestamp: event.timestamp || now(),
    source: event.source || 'system',
  };
  db.events.unshift(row);
  return row;
}

function decayWeight(timestamp, halfLifeDays, asOf = new Date()) {
  const ageMs = asOf.getTime() - new Date(timestamp).getTime();
  const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Materialize timestamped events into decayed feature values per account.
 * Spec §2.3: event-sourced facts → features (not just current-state fields).
 */
export function materializeFeatures(db, accountId, asOf = new Date()) {
  const events = (db.events || []).filter((e) => e.account_id === accountId);
  const features = {
    site_visits_7d: 0,
    site_visits_decayed: 0,
    replies_decayed: 0,
    content_engagement_decayed: 0,
    conversions_decayed: 0,
    custom_signal_decayed: 0,
    last_signal_at: null,
  };

  const sevenDaysAgo = asOf.getTime() - 7 * 24 * 60 * 60 * 1000;

  for (const event of events) {
    const ts = new Date(event.timestamp).getTime();
    if (!features.last_signal_at || ts > new Date(features.last_signal_at).getTime()) {
      features.last_signal_at = event.timestamp;
    }

    const value = Number(event.value) || 1;
    if (event.signal_type === 'site_visit') {
      if (ts >= sevenDaysAgo) features.site_visits_7d += value;
      features.site_visits_decayed +=
        value * decayWeight(event.timestamp, SIGNAL_HALF_LIFE_DAYS.site_visit, asOf);
    }
    if (event.signal_type === 'email_reply') {
      features.replies_decayed +=
        value * decayWeight(event.timestamp, SIGNAL_HALF_LIFE_DAYS.email_reply, asOf);
    }
    if (event.signal_type === 'content_download') {
      features.content_engagement_decayed +=
        value * decayWeight(event.timestamp, SIGNAL_HALF_LIFE_DAYS.content_download, asOf);
    }
    if (event.signal_type === 'meeting_booked' || event.signal_type === 'opportunity_created') {
      features.conversions_decayed +=
        value *
        decayWeight(
          event.timestamp,
          event.signal_type === 'meeting_booked'
            ? SIGNAL_HALF_LIFE_DAYS.meeting_booked
            : SIGNAL_HALF_LIFE_DAYS.opportunity_created,
          asOf
        );
    }
    if (event.signal_type === 'custom_signal') {
      features.custom_signal_decayed +=
        value * decayWeight(event.timestamp, SIGNAL_HALF_LIFE_DAYS.custom_signal, asOf);
    }
  }

  // Round for stable display
  for (const key of Object.keys(features)) {
    if (typeof features[key] === 'number') {
      features[key] = Math.round(features[key] * 1000) / 1000;
    }
  }

  return features;
}

export function seedBehavioralEvents(db, account, profile) {
  const { siteVisits = 0, replies = 0, content = 0, daysSpread = 10 } = profile;
  const events = [];

  for (let i = 0; i < siteVisits; i++) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor((i * daysSpread) / Math.max(siteVisits, 1)));
    events.push(
      appendEvent(db, {
        account_id: account.id,
        signal_type: 'site_visit',
        value: 1,
        timestamp: d.toISOString(),
        source: 'web',
      })
    );
  }
  for (let i = 0; i < content; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (2 + i * 3));
    events.push(
      appendEvent(db, {
        account_id: account.id,
        signal_type: 'content_download',
        value: 1,
        timestamp: d.toISOString(),
        source: 'content',
      })
    );
  }
  for (let i = 0; i < replies; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (1 + i * 4));
    events.push(
      appendEvent(db, {
        account_id: account.id,
        signal_type: 'email_reply',
        value: 1,
        timestamp: d.toISOString(),
        source: 'email',
      })
    );
  }

  if (account.customSignal?.value) {
    events.push(
      appendEvent(db, {
        account_id: account.id,
        signal_type: 'custom_signal',
        value: 1,
        timestamp: account.customSignal.detectedAt || now(),
        source: 'enrichment',
      })
    );
  }

  return events;
}
