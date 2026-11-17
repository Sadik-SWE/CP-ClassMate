import path from 'path';
import express from 'express';
import { env } from './src/server/config/env.ts';
import { connectDatabase } from './src/server/config/db.ts';
import { logger } from './src/server/utils/logger.ts';
import { createExpressApp } from './src/server/app.ts';

async function bootstrap() {
  if (env.missingRequiredSecrets.length > 0) {
    logger.warn(
      { missingSecrets: env.missingRequiredSecrets },
      'Some required secrets are missing. Configure them in the AI Studio Secrets panel.'
    );
  }

  await connectDatabase();

  const { app, errorHandler } = createExpressApp();

  if (env.isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  app.listen(env.port, '0.0.0.0', () => {
    logger.info(
      { port: env.port, frontendUrl: env.frontendUrl },
      `ClassMate server listening on http://0.0.0.0:${env.port}`
    );
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start ClassMate server');
  process.exit(1);
});
