/** Identity resolution — normalize domains/emails before joining signals. */

export function normalizeDomain(raw = '') {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export function emailDomain(email = '') {
  const parts = String(email).toLowerCase().split('@');
  return parts.length === 2 ? normalizeDomain(parts[1]) : '';
}

export function domainsMatch(a, b) {
  const left = normalizeDomain(a);
  const right = normalizeDomain(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

/**
 * Resolve an inbound identity (domain / email / linkedin) to an account.
 * Deterministic first, then fuzzy domain suffix match.
 */
export function resolveAccount(db, identity = {}) {
  const domain = normalizeDomain(identity.domain || identity.website || '');
  const fromEmail = emailDomain(identity.email || '');
  const linkedin = String(identity.linkedin || '').toLowerCase().replace(/\/$/, '');

  const accounts = db.accounts || [];

  const exact =
    accounts.find((a) => domain && normalizeDomain(a.domain) === domain) ||
    accounts.find((a) => fromEmail && normalizeDomain(a.domain) === fromEmail) ||
    accounts.find(
      (a) =>
        linkedin &&
        String(a.keyContact?.linkedin || '')
          .toLowerCase()
          .replace(/\/$/, '') === linkedin
    );

  if (exact) {
    return { account: exact, method: 'deterministic', confidence: 1 };
  }

  const fuzzy = accounts.find(
    (a) =>
      (domain && domainsMatch(a.domain, domain)) ||
      (fromEmail && domainsMatch(a.domain, fromEmail))
  );

  if (fuzzy) {
    return { account: fuzzy, method: 'fuzzy_domain', confidence: 0.8 };
  }

  return { account: null, method: 'unresolved', confidence: 0 };
}

export function ensureCanonicalIds(account) {
  return {
    ...account,
    account_id: account.account_id || account.id,
    domain: normalizeDomain(account.domain || account.website || ''),
  };
}
