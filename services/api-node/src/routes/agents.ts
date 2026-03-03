import { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac';
import { query, queryOne } from '../db';
import { createLogger } from '@ai-commerce-os/shared';

const log = createLogger('api-node');

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://agent-service:8000';
const INTERNAL_AUTH_TOKEN = process.env.INTERNAL_AUTH_TOKEN || '';

async function proxyToAgentService(
  method: string,
  path: string,
  body?: unknown,
  queryParams?: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
  const url = new URL(path, AGENT_SERVICE_URL);
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (INTERNAL_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${INTERNAL_AUTH_TOKEN}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function agentRoutes(app: FastifyInstance) {
  // All agent routes require auth + tenant
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.extractTenant);

  // === List agents ===
  app.get('/agents', async (request, reply) => {
    const storeId = (request as any).storeId;
    const { status, data } = await proxyToAgentService('GET', '/agents', undefined, { store_id: storeId });
    return reply.status(status).send(data);
  });

  // === Toggle agent (kill switch) ===
  app.patch('/agents/:name/toggle', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const storeId = (request as any).storeId;
    const body = request.body as { enabled: boolean };

    const { status, data } = await proxyToAgentService(
      'PATCH', `/agents/${name}/toggle`, body, { store_id: storeId },
    );

    if (status < 300) {
      const userId = request.user.sub;
      await query(
        `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_id, actor_type, changes)
         VALUES ($1, 'agent_config', $2, 'agent_toggled', $3, 'user', $4)`,
        [storeId, name, userId, JSON.stringify({ agent: name, enabled: body.enabled })],
      );
    }

    return reply.status(status).send(data);
  });

  // === Run agent manually ===
  app.post('/agents/run', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const storeId = (request as any).storeId;
    const body = request.body as { agent_name: string; params?: Record<string, unknown>; dry_run?: boolean; user_note?: string };

    const { status, data } = await proxyToAgentService('POST', '/agents/run', {
      agent_name: body.agent_name,
      store_id: storeId,
      params: body.params || {},
      dry_run: body.dry_run,
      user_note: body.user_note || null,
    });

    return reply.status(status).send(data);
  });

  // === List agent runs ===
  app.get('/agents/runs', async (request, reply) => {
    const storeId = (request as any).storeId;
    const { agent_name, status: runStatus, limit, offset } = request.query as Record<string, string>;

    const params: Record<string, string> = { store_id: storeId };
    if (agent_name) params.agent_name = agent_name;
    if (runStatus) params.status = runStatus;
    if (limit) params.limit = limit;
    if (offset) params.offset = offset;

    const { status, data } = await proxyToAgentService('GET', '/agents/runs', undefined, params);
    return reply.status(status).send(data);
  });

  // === Get run detail ===
  app.get('/agents/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const storeId = (request as any).storeId;
    const { status, data } = await proxyToAgentService('GET', `/agents/runs/${id}`, undefined, { store_id: storeId });
    return reply.status(status).send(data);
  });

  // === Schedule info ===
  app.get('/agents/schedule', async (_request, reply) => {
    const { status, data } = await proxyToAgentService('GET', '/agents/schedule');
    return reply.status(status).send(data);
  });

  // === Force trigger scheduled agent ===
  app.post('/agents/schedule/trigger', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const storeId = (request as any).storeId;
    const { agent_name } = request.query as { agent_name: string };

    const { status, data } = await proxyToAgentService(
      'POST', '/agents/schedule/trigger', undefined,
      { agent_name, store_id: storeId },
    );
    return reply.status(status).send(data);
  });
}
