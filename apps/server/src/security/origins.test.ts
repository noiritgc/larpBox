import { describe, expect, it } from 'vitest';
import { createOriginPolicy, isLocalNetworkHost, isLoopbackHost } from './origins.js';

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
