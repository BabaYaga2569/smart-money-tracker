const RECOVERY_KEY = 'smt_stale_chunk_recovery_at';
const RECOVERY_WINDOW_MS = 60 * 1000;

export function isStaleChunkError(error) {
  const message = String(
    error?.message ||
    error?.toString?.() ||
    error ||
    ''
  );

  return [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'Expected a JavaScript-or-Wasm module script',
    'ChunkLoadError',
    'Loading chunk'
  ].some(fragment => message.includes(fragment));
}

async function resetAppCachesAndServiceWorker() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    } catch (error) {
      console.warn('[ChunkRecovery] Could not unregister service worker:', error);
    }
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName)));
    } catch (error) {
      console.warn('[ChunkRecovery] Could not clear Cache Storage:', error);
    }
  }
}

export async function importWithStaleChunkRecovery(importer, label = 'page') {
  try {
    const module = await importer();

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(RECOVERY_KEY);
    }

    return module;
  } catch (error) {
    if (
      typeof window === 'undefined' ||
      typeof sessionStorage === 'undefined' ||
      !isStaleChunkError(error)
    ) {
      throw error;
    }

    const now = Date.now();
    const previousRecovery = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);

    // Never create a reload loop. If a fresh reload also cannot load the
    // current chunk, allow the normal ErrorBoundary to show a useful fallback.
    if (previousRecovery && now - previousRecovery < RECOVERY_WINDOW_MS) {
      console.error(
        '[ChunkRecovery] Stale chunk recovery already attempted; showing fallback instead.',
        { label, error }
      );
      throw error;
    }

    sessionStorage.setItem(RECOVERY_KEY, String(now));

    console.warn(
      '[ChunkRecovery] Detected a stale deployment chunk. Resetting app cache and reloading once.',
      { label }
    );

    await resetAppCachesAndServiceWorker();

    const url = new URL(window.location.href);
    url.searchParams.set('_smt_reload', String(now));

    window.location.replace(url.toString());

    // Keep React.lazy pending while the browser navigates away.
    return new Promise(() => {});
  }
}
