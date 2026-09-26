import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createIpResolver, createOriginPolicy, isLocalNetworkHost, isLoopbackHost } from './origins.js';

describe('origin policy', () => {
  it('recognizes local-network hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '10.104.218.84', '172.16.0.4', '172.31.255.1', '192.168.1.20', '169.254.3.3', '100.64.0.7', 'laptop.local', '[::1]', 'fd12:3456::1']) {
      expect(isLocalNetworkHost(host)).toBe(true);
    }
    for (const host of ['8.8.8.8', '172.32.0.1', '192.169.0.1', 'example.com', 'larpbox.party', '100.128.0.1']) {
      expect(isLocalNetworkHost(host)).toBe(false);
    }
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('192.168.1.20')).toBe(false);
  });

  it('allows only configured origins in production, plus the local network in development', () => {
    const rejected: string[] = [];
    const production = createOriginPolicy({ allowedOrigins: ['https://play.example'], allowLocalNetwork: false, onRejected: (o) => rejected.push(o) });
    expect(production.isAllowed(undefined)).toBe(true);
    expect(production.isAllowed('https://play.example')).toBe(true);
    expect(production.isAllowed('http://10.104.218.84:5173')).toBe(false);
    expect(production.isAllowed('http://10.104.218.84:5173')).toBe(false);
    // Each rejected origin is reported once, so the logs name what to add without flooding.
    expect(rejected).toEqual(['http://10.104.218.84:5173']);

    const development = createOriginPolicy({ allowedOrigins: ['http://localhost:5173'], allowLocalNetwork: true });
    expect(development.isAllowed('http://10.104.218.84:5173')).toBe(true);
    expect(development.isAllowed('http://192.168.1.20:5173')).toBe(true);
    expect(development.isAllowed('https://evil.example')).toBe(false);
    expect(development.isAllowed('not a url')).toBe(false);
  });
});

describe('client IP resolver', () => {
  const request = (remoteAddress: string, forwardedFor?: string) =>
    ({
      socket: { remoteAddress },
      headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
    }) as unknown as IncomingMessage;

  it('ignores X-Forwarded-For unless a proxy is trusted', () => {
    expect(createIpResolver(false)(request('203.0.113.9', '198.51.100.1'))).toBe('203.0.113.9');
  });

  it("finds the player behind Render's three proxies, even when the header is spoofed", () => {
    // Cloudflare, Render's load balancer and a local proxy each append the address they saw.
    const resolve = createIpResolver(3);
    expect(resolve(request('127.0.0.1', '41.90.172.99, 172.71.146.118, 10.26.236.170'))).toBe('41.90.172.99');
    expect(resolve(request('127.0.0.1', '6.6.6.6, 41.90.172.99, 172.71.146.118, 10.26.236.170'))).toBe('41.90.172.99');
  });

  it('trusts exact proxy subnets', () => {
    const resolve = createIpResolver('loopback, 10.0.0.0/8');
    expect(resolve(request('127.0.0.1', '198.51.100.7, 10.1.2.3'))).toBe('198.51.100.7');
    expect(resolve(request('203.0.113.9', '198.51.100.7'))).toBe('203.0.113.9');
  });
});
