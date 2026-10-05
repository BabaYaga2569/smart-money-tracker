export function getAccountPreferences(settings = {}) {
  return settings?.accountPreferences || {};
}

export function isAccountVisible(account, settingsOrPreferences = {}) {
  if (!account?.account_id) return true;
  if (account.connection_status === "inactive") return false;
  if (account.visible === false) return false;

  const preferences = settingsOrPreferences?.accountPreferences
    ? settingsOrPreferences.accountPreferences
    : settingsOrPreferences;

  return preferences?.[account.account_id]?.visible !== false;
}

export function getVisiblePlaidAccounts(accounts = [], settingsOrPreferences = {}) {
  return (accounts || []).filter(account =>
    isAccountVisible(account, settingsOrPreferences)
  );
}

export function getHiddenPlaidAccounts(accounts = [], settingsOrPreferences = {}) {
  return (accounts || []).filter(account =>
    !isAccountVisible(account, settingsOrPreferences)
  );
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
  ].some(value => type === value || subtype === value);
}

export function getCanonicalDisplayBalance(account = {}) {
  const current = Number(
    account.current_balance ??
    account.current ??
    account.balances?.current ??
    account.balance ??
    0
  );

  const availableRaw =
    account.available_balance ??
    account.available ??
    account.balances?.available;

  const available = availableRaw === null || availableRaw === undefined
    ? null
    : Number(availableRaw);

  return isCreditAccount(account)
    ? (Number.isFinite(current) ? current : 0)
    : (Number.isFinite(available) ? available : (Number.isFinite(current) ? current : 0));
}
