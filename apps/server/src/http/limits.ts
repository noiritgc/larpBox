import type { RequestHandler } from 'express';
import type { OriginPolicy } from '../security/origins.js';
import type { TokenBucketLimiter } from '../security/rateLimits.js';
import { sendApiError } from './errors.js';

export function rateLimit(limiter: TokenBucketLimiter, clientIp: (req: Parameters<RequestHandler>[0]) => string): RequestHandler {
  return (req, res, next) => {
    const result = limiter.take(clientIp(req));
    if (result.ok) {
      next();
      return;
    }
    sendApiError(res, 'RATE_LIMITED', 'Too many requests. Wait a moment and try again.', {
      retryAfterMs: result.retryAfterMs,
    });
  };
}

/**
 * Rejects cross-origin browser mutations. Requests without an Origin header pass. In development
 * the message names the origin and the setting to change; in production it stays generic.
 */
export function requireAllowedOrigin(policy: OriginPolicy, options: { verbose: boolean }): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (policy.isAllowed(origin)) {
      next();
      return;
    }
    sendApiError(
      res,
      'FORBIDDEN',
      options.verbose
        ? `This address (${origin}) isn't allowed to reach the game server. Add it to ALLOWED_ORIGINS in .env (and use it as PUBLIC_ORIGIN so QR codes point here), then restart the server.`
        : "This page's address isn't allowed to reach the game server. Ask the host to check the server's PUBLIC_ORIGIN and ALLOWED_ORIGINS settings.",
    );
  };
}
