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

/** Rejects cross-origin browser mutations. Requests without an Origin header pass. */
export function requireAllowedOrigin(policy: OriginPolicy): RequestHandler {
  return (req, res, next) => {
    if (policy.isAllowed(req.headers.origin)) {
      next();
      return;
    }
    sendApiError(res, 'FORBIDDEN', 'This page is not allowed to create or join rooms here.');
  };
}
