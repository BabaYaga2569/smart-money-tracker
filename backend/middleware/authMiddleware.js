/**
 * API Authentication Middleware
 * Verifies Firebase ID tokens on every /api request and ensures callers can
 * only act on their own userId.
 *
 * Modes (AUTH_MODE env var on Render):
 *   'log'     (default) — verifies tokens and LOGS violations, but allows all
 *                         requests through. Safe to deploy before the frontend
 *                         sends tokens. Watch Render logs for [AUTH] entries.
 *   'enforce'           — rejects requests without a valid token (401) or with
 *                         a userId that doesn't match the token (403).
 *   'off'               — disabled entirely (emergency escape hatch).
 *
 * Rollout: deploy in 'log' mode → deploy frontend interceptor → confirm logs
 * show "token ok" on real traffic → set AUTH_MODE=enforce in Render env vars.
 *
 * Exempt paths: health checks and the Plaid webhook (Plaid's servers cannot
 * send Firebase tokens; that endpoint must rely on Plaid's own verification).
 */

import admin from 'firebase-admin';

const EXEMPT_PATHS = new Set([
  '/healthz',
  '/api/health',
  '/api/plaid/webhook',
]);

const mode = () => (process.env.AUTH_MODE || 'log').toLowerCase();

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function requestedUserId(req) {
  return (req.body && req.body.userId) || (req.query && req.query.userId) || null;
}

export async function authMiddleware(req, res, next) {
  if (mode() === 'off') return next();
  if (EXEMPT_PATHS.has(req.path)) return next();
  // Only guard the API surface
  if (!req.path.startsWith('/api/')) return next();

  const enforce = mode() === 'enforce';
  const token = extractToken(req);
  const targetUserId = requestedUserId(req);

  if (!token) {
    console.warn(`[AUTH] NO TOKEN  ${req.method} ${req.path}  userId=${targetUserId || '-'} ip=${req.ip}`);
    if (enforce) {
      return res.status(401).json({ error: true, code: 'AUTH_REQUIRED', message: 'Authentication required' });
    }
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.authUid = decoded.uid;

    if (targetUserId && targetUserId !== decoded.uid) {
      console.warn(`[AUTH] UID MISMATCH  ${req.method} ${req.path}  token.uid=${decoded.uid} requested=${targetUserId}`);
      if (enforce) {
        return res.status(403).json({ error: true, code: 'FORBIDDEN', message: 'Cannot access another user\'s data' });
      }
    }
    return next();
  } catch (err) {
    console.warn(`[AUTH] INVALID TOKEN  ${req.method} ${req.path}  ${err.code || err.message}`);
    if (enforce) {
      return res.status(401).json({ error: true, code: 'AUTH_INVALID', message: 'Invalid or expired token' });
    }
    return next();
  }
}

export default authMiddleware;
