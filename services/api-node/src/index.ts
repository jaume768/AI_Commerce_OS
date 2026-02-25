import './tracing';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { createLogger } from '@ai-commerce-os/shared';
import { config } from './config';
import { authPlugin } from './plugins/auth';
import { tenantPlugin } from './plugins/tenant';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { taskRoutes } from './routes/tasks';
import { approvalRoutes } from './routes/approvals';
import { assetRoutes } from './routes/assets';
import { shopifyRoutes } from './routes/shopify';

const log = createLogger('api-node');

async function main() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
  });

  // Plugins
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });
  await app.register(cookie);
  await app.register(authPlugin);
  await app.register(tenantPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(taskRoutes);
  await app.register(approvalRoutes);
  await app.register(assetRoutes);
  await app.register(shopifyRoutes);

  // Start
  const host = '0.0.0.0';
  const port = 4000;

  try {
    await app.listen({ port, host });
    log.info({ port, host }, 'api-node started');
  } catch (err) {
    log.error(err, 'Failed to start api-node');
    process.exit(1);
  }
}

main();
