import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { query } from '../db';

async function tenantPluginFn(app: FastifyInstance) {
  app.decorate('extractTenant', async function (request: FastifyRequest, reply: FastifyReply) {
    const storeId = request.headers['x-store-id'] as string;
    if (!storeId) {
      return reply.status(400).send({ error: 'Missing x-store-id header' });
    }

    const user = request.user as { sub: string; email?: string; type?: string; role?: string };

    // Service tokens (agent-service) — verify store exists but skip membership
    if (user.type === 'service') {
      if (!user.role) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Service token must specify a role' });
      }
      const allowedServiceRoles = ['admin', 'editor', 'viewer'];
      if (!allowedServiceRoles.includes(user.role)) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Invalid service token role' });
      }
      // Verify the store actually exists and is active
      const storeRows = await query(
        `SELECT id, slug, status FROM stores WHERE id = $1`,
        [storeId],
      );
      if (storeRows.length === 0 || (storeRows[0] as any).status !== 'active') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Store not found or inactive' });
      }
      (request as any).storeId = storeId;
      (request as any).role = user.role;
      (request as any).storeSlug = (storeRows[0] as any).slug || 'service';
      return;
    }

    const rows = await query(
      `SELECT m.role, s.id as store_id, s.slug, s.status as store_status
       FROM memberships m
       JOIN stores s ON s.id = m.store_id
       WHERE m.user_id = $1 AND m.store_id = $2`,
      [user.sub, storeId],
    );

    if (rows.length === 0) {
      return reply.status(403).send({ error: 'Forbidden', message: 'No access to this store' });
    }

    const membership = rows[0] as any;
    if (membership.store_status !== 'active') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Store is not active' });
    }

    (request as any).storeId = storeId;
    (request as any).role = membership.role;
    (request as any).storeSlug = membership.slug;
  });
}

export const tenantPlugin = fp(tenantPluginFn, { name: 'tenant-plugin' });

declare module 'fastify' {
  interface FastifyInstance {
    extractTenant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    storeId?: string;
    role?: string;
    storeSlug?: string;
  }
}
