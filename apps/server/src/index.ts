import { randomUUID } from 'node:crypto';
import { createService } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config.js';
import { loadPromptPack, PromptPackError, type PromptPack } from './content/loadPrompts.js';
import { createLogger } from './logger.js';

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
