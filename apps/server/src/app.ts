import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { PROTOCOL_VERSION, type HealthResponse } from '@larpbox/shared';
import type { AppConfig } from './config.js';
import type { PromptPack } from './content/loadPrompts.js';
import { apiErrorHandler, sendApiError } from './http/errors.js';
import { defaultWebDistDir, installStaticClient } from './http/static.js';
import type { Logger } from './logger.js';

export interface ServiceOptions {
  config: AppConfig;
  promptPack: PromptPack;
  logger: Logger;
  bootId?: string;
  /** Directory of the built web client; null disables static serving. */
  webDistDir?: string | null;
}

export interface LarpboxService {
  app: Express;
  httpServer: HttpServer;
  bootId: string;
  listen(port: number, host: string): Promise<AddressInfo>;
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

/** Testable HTTP application factory. The caller decides when and where to listen. */
export function createService(options: ServiceOptions): LarpboxService {
  const { config, logger } = options;
  const bootId = options.bootId ?? randomUUID();
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

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      bootId,
      version: config.version,
    };
    res.json(body);
  });

  app.use('/api', (_req, res) => {
    sendApiError(res, 'NOT_FOUND', 'No such API route.');
  });
  app.use('/api', apiErrorHandler(logger));

  const webDistDir = options.webDistDir === undefined ? defaultWebDistDir() : options.webDistDir;
  if (webDistDir) {
    const serving = installStaticClient(app, webDistDir);
    logger.info({ serving, webDistDir }, serving ? 'static.enabled' : 'static.missing_build');
  }

  const httpServer = createServer(app);

  return {
    app,
    httpServer,
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
    close() {
      return new Promise((resolve) => {
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      });
    },
  };
}
