import { pino, type Logger, type LoggerOptions } from 'pino';
import type { AppConfig } from './config.js';

export type { Logger };

/**
 * Structured logs carry action types, internal room IDs, counts, phases and error codes only.
 * Redaction is a backstop: call sites must not pass tokens, post text, guesses, ballots,
 * idempotency request IDs, commands or snapshots in the first place.
 */
const REDACT_PATHS = [
  'token',
  'hostToken',
  'playerToken',
  'createRequestId',
  'joinRequestId',
  'text',
  'draftText',
  'finalText',
  '*.token',
  '*.hostToken',
  '*.playerToken',
  '*.createRequestId',
  '*.joinRequestId',
  '*.text',
  'req.headers.authorization',
  'req.headers.cookie',
];

export function createLogger(config: Pick<AppConfig, 'logLevel' | 'nodeEnv'>, bootId: string): Logger {
  const options: LoggerOptions = {
    level: config.logLevel,
    base: { service: 'larpbox-server', bootId },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  };
  if (config.nodeEnv === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,bootId' },
    };
  }
  return pino(options);
}

export function createSilentLogger(): Logger {
  return pino({ level: 'silent' });
}
