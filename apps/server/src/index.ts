import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { createService } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config.js';
import { loadPromptPack, PromptPackError, type PromptPack } from './content/loadPrompts.js';
import { createLogger, type Logger } from './logger.js';
import { isLoopbackHost } from './security/origins.js';

/** Development only: list this machine's network URLs so phones can be pointed at one of them. */
function logLanHint(config: AppConfig, logger: Logger): void {
  const publicUrl = new URL(config.publicOrigin);
  const port = publicUrl.port || '5173';
  const phoneUrls = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net !== undefined && net.family === 'IPv4' && !net.internal)
    .map((net) => `http://${net?.address}:${port}`);
  if (isLoopbackHost(publicUrl.hostname)) {
    logger.warn(
      { publicOrigin: config.publicOrigin, phoneUrls },
      'dev.qr_localhost: PUBLIC_ORIGIN is localhost, so QR codes and join links only work on this computer. For phones, set PUBLIC_ORIGIN (and ALLOWED_ORIGINS) in .env to a phoneUrls entry the phones can reach, then restart.',
    );
  } else {
    logger.info({ publicOrigin: config.publicOrigin, phoneUrls }, 'dev.phone_urls');
  }
}

/** Validate config, load content, compose the service, then listen. */
async function main(): Promise<void> {
  let config: AppConfig;
  let promptPack: PromptPack;
  try {
    config = loadConfig();
    promptPack = loadPromptPack();
  } catch (error) {
    if (error instanceof ConfigError || error instanceof PromptPackError) {
      console.error(`[larpbox] Refusing to start. ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const bootId = randomUUID();
  const logger = createLogger(config, bootId);
  const service = createService({ config, promptPack, logger, bootId });
  const address = await service.listen(config.port, config.host);
  logger.info(
    {
      host: address.address,
      port: address.port,
      publicOrigin: config.publicOrigin,
      nodeEnv: config.nodeEnv,
      prompts: promptPack.prompts.length,
      timeScale: config.gameTimeScale,
      version: config.version,
    },
    'server.listening',
  );
  if (config.nodeEnv === 'development') logLanHint(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, rooms: service.engine.store.size }, 'server.shutdown');
    const force = setTimeout(() => process.exit(0), 5_000);
    force.unref();
    service
      .close()
      .catch((error: unknown) => logger.error({ err: error }, 'server.shutdown_failed'))
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('[larpbox] Fatal startup error', error);
  process.exit(1);
});
