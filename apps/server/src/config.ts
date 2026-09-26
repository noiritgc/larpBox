import { z } from 'zod';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  PUBLIC_ORIGIN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  // Set automatically by Render for web services (https://<service>.onrender.com).
  RENDER_EXTERNAL_URL: z.string().optional(),
  RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
  MAX_ROOMS: positiveInt(100),
  MAX_SOCKETS: positiveInt(900),
  ROOM_MAX_AGE_MS: positiveInt(6 * 60 * 60 * 1000),
  ROOM_IDLE_MS: positiveInt(30 * 60 * 1000),
  ROOM_ABANDONED_MS: positiveInt(10 * 60 * 1000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ENABLE_DEVTOOLS: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
  GAME_TIME_SCALE: z.coerce.number().positive().max(1).default(1),
  TRUST_PROXY: z.string().default('false'),
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).max(1000).default(1),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicOrigin: string;
  allowedOrigins: string[];
  maxRooms: number;
  maxSockets: number;
  roomMaxAgeMs: number;
  roomIdleMs: number;
  roomAbandonedMs: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  enableDevtools: boolean;
  gameTimeScale: number;
  trustProxy: false | number | string;
  rateLimitMultiplier: number;
  version: string;
}

/** Parses an origin such as `https://example.com` or `http://192.168.1.20:5173`. */
export function parseOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ConfigError(`${label} must be an absolute http(s) origin, got "${value}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${label} must use http or https, got "${value}".`);
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username) {
    throw new ConfigError(`${label} must be an origin with no path, query or credentials: "${value}".`);
  }
  return url.origin;
}

function parseTrustProxy(value: string): false | number | string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'false' || trimmed === '0') return false;
  if (trimmed === 'true') {
    throw new ConfigError(
      'TRUST_PROXY=true would trust any X-Forwarded-For header. Use a hop count or exact proxy address/subnet.',
    );
  }
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(',').map((part) => part.trim());
  const valid = parts.every(
    (part) => TRUST_PROXY_KEYWORDS.has(part) || /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(part),
  );
  if (!valid) throw new ConfigError(`TRUST_PROXY is not a hop count or proxy address list: "${value}".`);
  return parts.join(',');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Treat empty assignments (e.g. `PORT=`) as unset rather than as zero or empty strings.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value;
  }
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid environment: ${details}`);
  }
  const e = parsed.data;

  if (e.NODE_ENV === 'production' && e.ENABLE_DEVTOOLS) {
    throw new ConfigError('ENABLE_DEVTOOLS must be false when NODE_ENV=production.');
  }
  if (e.GAME_TIME_SCALE !== 1 && (e.NODE_ENV !== 'test' || !LOOPBACK_HOSTS.has(e.HOST))) {
    throw new ConfigError(
      'GAME_TIME_SCALE may differ from 1 only when NODE_ENV=test and HOST is a loopback address.',
    );
  }

  // The platform's own public URL (Render sets it for every web service) is a safe fallback: it is
  // configuration, never a request header.
  const platformUrl =
    e.RENDER_EXTERNAL_URL ?? (e.RENDER_EXTERNAL_HOSTNAME ? `https://${e.RENDER_EXTERNAL_HOSTNAME}` : undefined);
  const platformOrigin = platformUrl ? parseOrigin(platformUrl, 'RENDER_EXTERNAL_URL') : undefined;
  if (e.NODE_ENV === 'production' && !e.PUBLIC_ORIGIN && !platformOrigin) {
    throw new ConfigError(
      'PUBLIC_ORIGIN must be set in production to the public URL players open (for example https://larpbox.example). QR codes and join links are built from it.',
    );
  }
  const publicOrigin = e.PUBLIC_ORIGIN
    ? parseOrigin(e.PUBLIC_ORIGIN, 'PUBLIC_ORIGIN')
    : (platformOrigin ?? 'http://localhost:5173');
  const allowed = new Set<string>([publicOrigin]);
  if (platformOrigin) allowed.add(platformOrigin);
  for (const origin of (e.ALLOWED_ORIGINS ?? '').split(',')) {
    if (origin.trim()) allowed.add(parseOrigin(origin, 'ALLOWED_ORIGINS'));
  }

  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    publicOrigin,
    allowedOrigins: [...allowed],
    maxRooms: e.MAX_ROOMS,
    maxSockets: e.MAX_SOCKETS,
    roomMaxAgeMs: e.ROOM_MAX_AGE_MS,
    roomIdleMs: e.ROOM_IDLE_MS,
    roomAbandonedMs: e.ROOM_ABANDONED_MS,
    logLevel: e.LOG_LEVEL,
    enableDevtools: e.ENABLE_DEVTOOLS,
    gameTimeScale: e.GAME_TIME_SCALE,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    rateLimitMultiplier: e.RATE_LIMIT_MULTIPLIER,
    version: process.env.LARPBOX_VERSION ?? 'dev',
  };
}
