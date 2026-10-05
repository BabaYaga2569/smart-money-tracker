export const ACCOUNT_VISIBILITY_SCHEMA_VERSION = 1;

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

export function isCreditAccount(account = {}) {
  const type = String(account.type || account.originalType || "").toLowerCase();
  const subtype = String(account.subtype || account.originalSubtype || "").toLowerCase();
  return type === "credit" || subtype.includes("credit");
}

export function isDepositoryAccount(account = {}) {
  if (isCreditAccount(account)) return false;

  const type = String(account.type || account.originalType || "").toLowerCase();
  const subtype = String(account.subtype || account.originalSubtype || "").toLowerCase();

  if (type === "depository") return true;

  return [
    "checking",
    "savings",
    "money market",
    "cd",
    "hsa",
    "cash management"
  ].some(value => subtype === value || type === value);
}

export function accountIdentityMatch(existing = {}, fresh = {}) {
  if (!existing || !fresh) return false;

  if (existing.account_id && fresh.account_id && existing.account_id === fresh.account_id) {
    return true;
  }

  if (!existing.mask || !fresh.mask || existing.mask !== fresh.mask) {
    return false;
  }

  const sameItem =
    existing.item_id &&
    fresh.item_id &&
    existing.item_id === fresh.item_id;

  const sameInstitutionId =
    existing.institution_id &&
    fresh.institution_id &&
    existing.institution_id === fresh.institution_id;

  const sameInstitutionName =
    existing.institution_name &&
    fresh.institution_name &&
    existing.institution_name === fresh.institution_name;

  return Boolean(sameItem || sameInstitutionId || sameInstitutionName);
}

export function normalizePlaidAccount(fresh = {}, existing = {}) {
  const balances = fresh.balances || {};
  const current = money(
    balances.current ??
    fresh.current_balance ??
    fresh.current ??
    existing.current_balance ??
    existing.current ??
    existing.balance ??
    0
  );

  const availableRaw =
    balances.available ??
    fresh.available_balance ??
    fresh.available ??
    existing.available_balance ??
    existing.available ??
    null;

  const available = availableRaw === null || availableRaw === undefined
    ? null
    : money(availableRaw);

  const credit = isCreditAccount(fresh);
  const displayBalance = credit
    ? current
    : (available ?? current);

  return {
    ...existing,
    account_id: fresh.account_id || existing.account_id || "",
    name: fresh.name || existing.name || "Unknown Account",
    official_name: fresh.official_name ?? existing.official_name ?? null,
    mask: fresh.mask ?? existing.mask ?? null,
    type: fresh.type || existing.type || "depository",
    subtype: fresh.subtype ?? existing.subtype ?? null,
    originalType: fresh.type || existing.originalType || existing.type || null,
    originalSubtype: fresh.subtype ?? existing.originalSubtype ?? existing.subtype ?? null,
    institution_name: fresh.institution_name || existing.institution_name || "",
    institution_id: fresh.institution_id || existing.institution_id || "",
    item_id: fresh.item_id || existing.item_id || "",
    available_balance: available,
    current_balance: current,
    available,
    current,
    balance: money(displayBalance),
    balances: {
      available,
      current,
      limit: balances.limit ?? fresh.balances?.limit ?? existing.balances?.limit ?? null,
      iso_currency_code:
        balances.iso_currency_code ??
        existing.balances?.iso_currency_code ??
        "USD",
      unofficial_currency_code:
        balances.unofficial_currency_code ??
        existing.balances?.unofficial_currency_code ??
        null
    },
    source: "plaid"
  };
}

function getPreference(preferences, accountId) {
  const preference = preferences?.[accountId];
  return preference && typeof preference === "object" ? preference : {};
}

export function isAccountVisible(account, preferences = {}) {
  if (!account?.account_id) return true;

  if (account.connection_status === "inactive") return false;
  if (account.visible === false) return false;

  const preference = getPreference(preferences, account.account_id);
  return preference.visible !== false;
}

export function withVisibility(accounts = [], preferences = {}) {
  return accounts.map(account => ({
    ...account,
    visible: isAccountVisible(account, preferences)
  }));
}

export function visibleAccounts(accounts = [], preferences = {}) {
  return withVisibility(accounts, preferences).filter(account => account.visible !== false);
}

export function reconcileAccountRegistry({
  existingAccounts = [],
  freshAccounts = [],
  preferences = {},
  visibilitySchemaVersion = 0,
  completeSnapshot = false,
  newAccountsVisible = true
} = {}) {
  const nextPreferences = { ...(preferences || {}) };
  const matchedExistingIds = new Set();
  const normalizedFresh = [];

  for (const fresh of freshAccounts) {
    const existing = existingAccounts.find(account => accountIdentityMatch(account, fresh)) || {};
    const oldAccountId = existing.account_id;
    const newAccountId = fresh.account_id;

    if (oldAccountId) {
      matchedExistingIds.add(oldAccountId);
    }

    if (
      oldAccountId &&
      newAccountId &&
      oldAccountId !== newAccountId &&
      nextPreferences[oldAccountId] &&
      !nextPreferences[newAccountId]
    ) {
      nextPreferences[newAccountId] = { ...nextPreferences[oldAccountId] };
      delete nextPreferences[oldAccountId];
    }

    if (newAccountId && !nextPreferences[newAccountId]) {
      // The legacy Accounts page persisted only depository accounts, so a
      // credit card missing from the old Firestore array was often a storage bug,
      // not a user hide choice. Preserve legacy hide behavior for cash accounts,
      // while keeping newly discovered credit accounts visible.
      const isLegacyHiddenAccount =
        completeSnapshot &&
        visibilitySchemaVersion < ACCOUNT_VISIBILITY_SCHEMA_VERSION &&
        existingAccounts.length > 0 &&
        !oldAccountId &&
        isDepositoryAccount(fresh);

      nextPreferences[newAccountId] = {
        visible: isLegacyHiddenAccount ? false : newAccountsVisible
      };
    }

    normalizedFresh.push(normalizePlaidAccount(fresh, existing));
  }

  const untouchedExisting = existingAccounts
    .filter(existing => {
      if (!existing.account_id) return true;
      return !matchedExistingIds.has(existing.account_id);
    })
    .map(existing => {
      if (!completeSnapshot) return existing;

      // A full successful Plaid snapshot did not return this account. Keep a
      // tombstone for transaction/account-name history, but never let a stale
      // balance remain spendable or visible.
      if (existing.account_id) {
        nextPreferences[existing.account_id] = {
          ...(nextPreferences[existing.account_id] || {}),
          visible: false
        };
      }

      return {
        ...existing,
        connection_status: "inactive",
        disconnectedAt: existing.disconnectedAt || new Date().toISOString()
      };
    });

  const deduped = [];
  for (const account of [...untouchedExisting, ...normalizedFresh.map(account => ({
    ...account,
    connection_status: "active",
    disconnectedAt: null
  }))]) {
    const index = deduped.findIndex(existing => accountIdentityMatch(existing, account));
    if (index === -1) {
      deduped.push(account);
    } else {
      deduped[index] = normalizePlaidAccount(account, deduped[index]);
    }
  }

  // Existing accounts that predate the preference schema remain visible unless
  // the legacy migration can prove they were intentionally removed.
  for (const account of deduped) {
    if (account.account_id && !nextPreferences[account.account_id]) {
      nextPreferences[account.account_id] = { visible: true };
    }
  }

  return {
    accounts: deduped,
    preferences: nextPreferences,
    visibilitySchemaVersion:
      completeSnapshot
        ? ACCOUNT_VISIBILITY_SCHEMA_VERSION
        : visibilitySchemaVersion
  };
}

export function calculateVisibleDepositoryTotal(accounts = [], preferences = {}) {
  return money(
    visibleAccounts(accounts, preferences)
      .filter(isDepositoryAccount)
      .reduce((sum, account) => sum + money(account.balance), 0)
  );
}
