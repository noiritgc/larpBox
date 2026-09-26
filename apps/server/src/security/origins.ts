import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import proxyaddr from 'proxy-addr';

/**
 * Loopback, RFC 1918 private, link-local, carrier-grade NAT (used by some VPN meshes) and mDNS
 * `.local` hosts: addresses that only exist on a local network.
 */
export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (isIP(host) === 4) {
    const [a = -1, b = -1] = host.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(host) === 6) return host === '::1' || host.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(host);
  return false;
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

export interface OriginPolicy {
  isAllowed(origin: string | undefined): boolean;
}

/**
 * Browser origin checks for HTTP mutations and the Socket.IO handshake. CORS is not an
 * authentication system: requests without an Origin header (non-browser clients, tests) still pass
 * here, and every socket must present a valid token anyway.
 *
 * Production allows only PUBLIC_ORIGIN and ALLOWED_ORIGINS. Development additionally allows
 * local-network origins so phones on the same Wi-Fi can reach the Vite dev server without editing
 * .env first. Rejections are reported once per origin so the operator can see what to add.
 */
export function createOriginPolicy(options: {
  allowedOrigins: readonly string[];
  allowLocalNetwork: boolean;
  onRejected?: (origin: string) => void;
}): OriginPolicy {
  const allowed = new Set(options.allowedOrigins);
  const reported = new Set<string>();
  return {
    isAllowed(origin) {
      if (origin === undefined || allowed.has(origin)) return true;
      if (options.allowLocalNetwork) {
        try {
          const url = new URL(origin);
          if ((url.protocol === 'http:' || url.protocol === 'https:') && isLocalNetworkHost(url.hostname)) return true;
        } catch {
          // Not a URL: rejected below.
        }
      }
      if (!reported.has(origin) && reported.size < 50) {
        reported.add(origin);
        options.onRejected?.(origin);
      }
      return false;
    },
  };
}

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
