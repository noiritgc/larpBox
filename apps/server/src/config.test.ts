import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3001,
      publicOrigin: 'http://localhost:5173',
      allowedOrigins: ['http://localhost:5173'],
      maxRooms: 100,
      maxSockets: 900,
      roomMaxAgeMs: 21_600_000,
      roomIdleMs: 1_800_000,
      roomAbandonedMs: 600_000,
      enableDevtools: false,
      gameTimeScale: 1,
      trustProxy: false,
      rateLimitMultiplier: 1,
    });
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ PORT: '', PUBLIC_ORIGIN: ' ' }).port).toBe(3001);
  });

  it('normalizes origins and always allows the public origin', () => {
    const config = loadConfig({
      PUBLIC_ORIGIN: 'http://192.168.1.20:5173/',
      ALLOWED_ORIGINS: 'http://localhost:5173, http://192.168.1.20:5173',
    });
    expect(config.publicOrigin).toBe('http://192.168.1.20:5173');
    expect(config.allowedOrigins).toEqual(['http://192.168.1.20:5173', 'http://localhost:5173']);
  });

  it.each([
    [{ PUBLIC_ORIGIN: 'not a url' }],
    [{ PUBLIC_ORIGIN: 'ftp://example.com' }],
    [{ PUBLIC_ORIGIN: 'https://example.com/path' }],
    [{ ALLOWED_ORIGINS: 'https://ok.example, nope' }],
    [{ PORT: '-1' }],
    [{ MAX_ROOMS: '-5' }],
    [{ ROOM_IDLE_MS: 'soon' }],
    [{ NODE_ENV: 'staging' }],
    [{ LOG_LEVEL: 'verbose' }],
    [{ TRUST_PROXY: 'true' }],
    [{ TRUST_PROXY: 'some proxy' }],
    [{ RATE_LIMIT_MULTIPLIER: '0.5' }],
  ])('fails clearly for invalid input %j', (env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });

  it('refuses devtools in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', ENABLE_DEVTOOLS: 'true' })).toThrow(/ENABLE_DEVTOOLS/);
    expect(loadConfig({ NODE_ENV: 'development', ENABLE_DEVTOOLS: 'true' }).enableDevtools).toBe(true);
  });

  it('allows GAME_TIME_SCALE only for loopback test servers', () => {
    expect(loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', GAME_TIME_SCALE: '0.2' }).gameTimeScale).toBe(0.2);
    expect(() => loadConfig({ NODE_ENV: 'production', GAME_TIME_SCALE: '0.2', HOST: '127.0.0.1' })).toThrow(
      /GAME_TIME_SCALE/,
    );
    expect(() => loadConfig({ NODE_ENV: 'test', HOST: '0.0.0.0', GAME_TIME_SCALE: '0.2' })).toThrow(
      /GAME_TIME_SCALE/,
    );
    expect(() => loadConfig({ NODE_ENV: 'development', HOST: '127.0.0.1', GAME_TIME_SCALE: '0.5' })).toThrow(
      /GAME_TIME_SCALE/,
    );
    expect(loadConfig({ NODE_ENV: 'production', GAME_TIME_SCALE: '1', PUBLIC_ORIGIN: 'https://play.example' }).gameTimeScale).toBe(1);
  });

  it('requires a public origin in production instead of building localhost QR codes', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/PUBLIC_ORIGIN must be set in production/);
    expect(loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://play.example' }).publicOrigin).toBe('https://play.example');
  });

  it("falls back to the platform's public URL (Render) and always allows it", () => {
    const render = loadConfig({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://larpbox-tv.onrender.com' });
    expect(render.publicOrigin).toBe('https://larpbox-tv.onrender.com');
    expect(render.allowedOrigins).toEqual(['https://larpbox-tv.onrender.com']);
    expect(loadConfig({ NODE_ENV: 'production', RENDER_EXTERNAL_HOSTNAME: 'larpbox-tv.onrender.com' }).publicOrigin).toBe(
      'https://larpbox-tv.onrender.com',
    );
    // A custom domain wins for QR codes; the onrender.com address keeps working.
    const custom = loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://larpbox.party', RENDER_EXTERNAL_URL: 'https://larpbox-tv.onrender.com' });
    expect(custom.publicOrigin).toBe('https://larpbox.party');
    expect(custom.allowedOrigins).toEqual(['https://larpbox.party', 'https://larpbox-tv.onrender.com']);
  });

  it('parses explicit proxy trust settings', () => {
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: '10.0.0.0/8' }).trustProxy).toBe('10.0.0.0/8');
    expect(loadConfig({ TRUST_PROXY: 'loopback' }).trustProxy).toBe('loopback');
  });
});
