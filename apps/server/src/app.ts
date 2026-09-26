import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import type { PromptPack } from './content/loadPrompts.js';
import { systemClock, systemScheduler, type Clock, type Scheduler, type TimerHandle } from './game/clock.js';
import { GameEngine } from './game/engine.js';
import { apiErrorHandler, sendApiError } from './http/errors.js';
import { createApiRouter } from './http/routes.js';
import { defaultWebDistDir, installStaticClient } from './http/static.js';
import type { Logger } from './logger.js';
import { createRealtime } from './realtime/server.js';
import type { LarpboxServer } from './realtime/types.js';
import { createIpResolver, createOriginPolicy } from './security/origins.js';
import { createRateLimiters, purgeLimiters } from './security/rateLimits.js';

export interface ServiceOptions {
  config: AppConfig;
  promptPack: PromptPack;
  logger: Logger;
  bootId?: string;
  /** Game clock and scheduler (fake in tests). Rate limiting always uses wall time. */
  clock?: Clock;
  scheduler?: Scheduler;
  /** Directory of the built web client; null disables static serving. */
  webDistDir?: string | null;
  newId?: () => string;
}

export interface LarpboxService {
  app: Express;
  httpServer: HttpServer;
  io: LarpboxServer;
  engine: GameEngine;
  bootId: string;
  listen(port: number, host: string): Promise<AddressInfo>;
  /** Stop new rooms, end every room honestly (room:closed), close sockets and the server. */
  close(): Promise<void>;
}

function contentSecurityPolicy(config: AppConfig) {
  const origin = new URL(config.publicOrigin);
  const socketOrigin = `${origin.protocol === 'https:' ? 'wss:' : 'ws:'}//${origin.host}`;
  return helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", socketOrigin],
      manifestSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  });
}

/** Testable service factory: config and content are validated by the caller before this runs. */
export function createService(options: ServiceOptions): LarpboxService {
  const { config, logger } = options;
  const bootId = options.bootId ?? randomUUID();
  const clock = options.clock ?? systemClock;
  const scheduler = options.scheduler ?? systemScheduler;
  let shuttingDown = false;

  const engineOptions: ConstructorParameters<typeof GameEngine>[0] = {
    config: {
      publicOrigin: config.publicOrigin,
      maxRooms: config.maxRooms,
      roomMaxAgeMs: config.roomMaxAgeMs,
      roomIdleMs: config.roomIdleMs,
      roomAbandonedMs: config.roomAbandonedMs,
      gameTimeScale: config.gameTimeScale,
    },
    promptPack: options.promptPack,
    clock,
    scheduler,
    logger,
    bootId,
  };
  if (options.newId) engineOptions.newId = options.newId;
  const engine = new GameEngine(engineOptions);
  const limiters = createRateLimiters(systemClock, config.rateLimitMultiplier);
  const originPolicy = createOriginPolicy(config.allowedOrigins);
  const clientIp = createIpResolver(config.trustProxy);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.publicOrigin.startsWith('https:'),
    }),
  );
  app.use(contentSecurityPolicy(config));

  app.use('/api', (_req, res, next) => {
    res.locals['requestId'] = randomUUID();
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: '8kb', strict: true }));
  app.use(
    '/api',
    createApiRouter({
      engine,
      limiters,
      originPolicy,
      clientIp: (req: Request) => clientIp(req),
      version: config.version,
      isShuttingDown: () => shuttingDown,
    }),
  );
  app.use('/api', (_req, res) => {
    sendApiError(res, 'NOT_FOUND', 'No such API route.');
  });
  app.use('/api', apiErrorHandler(logger));

  const webDistDir = options.webDistDir === undefined ? defaultWebDistDir() : options.webDistDir;
  if (webDistDir) {
    const serving = installStaticClient(app, webDistDir);
    logger.info({ serving }, serving ? 'static.enabled' : 'static.missing_build');
  }

  const httpServer = createServer(app);
  const io = createRealtime({
    httpServer,
    engine,
    clock,
    logger,
    limiters,
    originPolicy,
    clientIp,
    publicOrigin: config.publicOrigin,
    maxSockets: config.maxSockets,
  });

  engine.startSweeper();
  let limiterPurge: TimerHandle | null = null;
  const schedulePurge = () => {
    limiterPurge = systemScheduler.schedule(60_000, () => {
      purgeLimiters(limiters);
      schedulePurge();
    });
  };
  schedulePurge();

  let closed = false;
  return {
    app,
    httpServer,
    io,
    engine,
    bootId,
    listen(port, host) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          resolve(httpServer.address() as AddressInfo);
        });
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      shuttingDown = true;
      limiterPurge?.cancel();
      engine.shutdown();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
        httpServer.closeAllConnections();
      });
    },
  };
}
