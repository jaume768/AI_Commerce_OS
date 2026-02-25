import { FastifyInstance } from 'fastify';
import { healthCheck as dbHealth } from '../db';
import { taskQueue } from '../queue';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return { status: 'ok', service: 'api-node', timestamp: new Date().toISOString() };
  });

  app.get('/ready', async (_req, reply) => {
    const db = await dbHealth();
    let redis = false;
    try {
      await taskQueue.client;
      redis = true;
    } catch {}

    const ready = db && redis;
    reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      service: 'api-node',
      checks: { db, redis },
      timestamp: new Date().toISOString(),
    });
  });
}
