import {
  getCanonicalDisplayBalance,
  getVisiblePlaidAccounts,
  isDepositoryAccount
} from './accountVisibility';

export function summarizeCanonicalAccounts(accounts = [], settings = {}) {
  const visibleAccounts = getVisiblePlaidAccounts(accounts, settings);
  const depositoryAccounts = visibleAccounts.filter(isDepositoryAccount);
  const totalAvailable = depositoryAccounts.reduce(
    (sum, account) => sum + getCanonicalDisplayBalance(account),
    0
  );

  return {
    visibleAccounts,
    depositoryAccounts,
    totalAvailable
  };
}

export async function loadCanonicalFinancialAccounts({
  userId,
  settings = {},
  apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com',
  timeoutMs = 5000
} = {}) {
  const fallback = () => ({
    source: 'firebase-cache',
    ...summarizeCanonicalAccounts(settings.plaidAccounts || [], settings)
  });

  if (!userId || typeof fetch !== 'function') {
    return fallback();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${apiUrl}/api/accounts?userId=${encodeURIComponent(userId)}&_t=${Date.now()}`,
      { signal: controller.signal }
    );

    if (!response.ok) return fallback();

    const payload = await response.json();
    if (!payload?.success || !Array.isArray(payload.accounts) || payload.accounts.length === 0) {
      return fallback();
    }

    return {
      source: 'live-api',
      ...summarizeCanonicalAccounts(payload.accounts, settings)
    };
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('Canonical account load failed; using Firebase cache:', error);
    }
    return fallback();
  } finally {
    clearTimeout(timeout);
  }
}

export default loadCanonicalFinancialAccounts;
