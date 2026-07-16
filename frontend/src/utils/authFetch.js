/**
 * authFetch.js — Global fetch interceptor for API authentication.
 *
 * Imported ONCE (in main.jsx). Wraps window.fetch so that every request to
 * our backend API automatically carries the signed-in user's Firebase ID
 * token as `Authorization: Bearer <token>`. No call sites need to change.
 *
 * Non-API requests (Firebase, Plaid CDN, anything else) pass through
 * untouched. If anything goes wrong obtaining a token, the request proceeds
 * WITHOUT one — the backend's log/enforce mode decides what happens next;
 * this interceptor never breaks a request on its own.
 */

import { auth } from '../firebase';

const API_BASE = import.meta.env.VITE_API_URL || '';
const originalFetch = window.fetch.bind(window);

window.fetch = async function authenticatedFetch(input, init = {}) {
  try {
    const url =
      typeof input === 'string' ? input :
      input instanceof URL ? input.href :
      (input && input.url) || '';

    if (API_BASE && url.startsWith(API_BASE)) {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken(); // cached by SDK, auto-refreshes
        const headers = new Headers(
          init.headers || (typeof input === 'object' && input.headers) || {}
        );
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        init = { ...init, headers };
      }
    }
  } catch (err) {
    // Never block a request because token attachment failed
    console.warn('[authFetch] token attach failed:', err?.message);
  }
  return originalFetch(input, init);
};

export {}; // module has side effects only
