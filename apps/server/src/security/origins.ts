import type { IncomingMessage } from 'node:http';
import proxyaddr from 'proxy-addr';

/**
 * Browser origin checks for HTTP mutations and the Socket.IO handshake. CORS is not an
 * authentication system: requests without an Origin header (non-browser clients, tests) are still
 * allowed through here, and every socket must present a valid token anyway.
 */
export function createOriginPolicy(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return {
    isAllowed(origin: string | undefined): boolean {
      return origin === undefined || allowed.has(origin);
    },
  };
}

export type OriginPolicy = ReturnType<typeof createOriginPolicy>;

/**
 * Client IP for rate limiting. Uses the same trust rules as Express's `trust proxy` so arbitrary
 * X-Forwarded-For headers are ignored unless the deployment configured an exact proxy hop.
 */
export function createIpResolver(trustProxy: false | number | string) {
  if (trustProxy === false) {
    return (req: IncomingMessage): string => req.socket.remoteAddress ?? 'unknown';
  }
  const trust =
    typeof trustProxy === 'number'
      ? (_address: string, hop: number) => hop < trustProxy
      : proxyaddr.compile(trustProxy.split(',').map((part) => part.trim()));
  return (req: IncomingMessage): string => proxyaddr(req, trust);
}
