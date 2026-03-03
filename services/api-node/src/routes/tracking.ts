import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireRole } from '../middleware/rbac';
import {
  getTrackingStatus,
  testMetaConnection,
  testTikTokConnection,
  sendMetaEvent,
  sendTikTokEvent,
  isTrackingEnabled,
} from '../tracking';

export async function trackingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.extractTenant);

  // === Tracking status (config overview) ===
  app.get('/tracking/status', async () => {
    return getTrackingStatus();
  });

  // === Test Meta CAPI connection ===
  app.post('/tracking/meta/test', {
    preHandler: [requireRole('admin')],
  }, async (_request, reply) => {
    const result = await testMetaConnection();
    return reply.status(result.ok ? 200 : 502).send(result);
  });

  // === Test TikTok Events API connection ===
  app.post('/tracking/tiktok/test', {
    preHandler: [requireRole('admin')],
  }, async (_request, reply) => {
    const result = await testTikTokConnection();
    return reply.status(result.ok ? 200 : 502).send(result);
  });

  // === Send a manual test event (admin only) ===
  app.post('/tracking/test-event', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    if (!isTrackingEnabled()) {
      return reply.status(400).send({ error: 'Tracking is not enabled. Set TRACKING_ENABLED=true in .env' });
    }

    const storeId = (request as any).storeId;
    const { platform, eventName } = request.body as { platform?: string; eventName?: string };

    const results: Record<string, unknown> = {};

    if (!platform || platform === 'meta') {
      results.meta = await sendMetaEvent(storeId, {
        eventName: eventName || 'PageView',
        actionSource: 'system_generated',
        eventTime: Math.floor(Date.now() / 1000),
        userData: {
          externalId: 'test_event_user',
          clientIpAddress: '127.0.0.1',
          clientUserAgent: 'AI-Commerce-OS/1.0 (test)',
        },
      }, 'manual', 'test');
    }

    if (!platform || platform === 'tiktok') {
      results.tiktok = await sendTikTokEvent(storeId, {
        eventName: eventName || 'ViewContent',
        eventTime: Math.floor(Date.now() / 1000),
        userData: {
          externalId: 'test_event_user',
          ip: '127.0.0.1',
          userAgent: 'AI-Commerce-OS/1.0 (test)',
        },
      }, 'manual', 'test');
    }

    return results;
  });

  // === List tracking events (audit log) ===
  app.get('/tracking/events', async (request) => {
    const storeId = (request as any).storeId;
    const { limit, platform, status, event_name } = request.query as Record<string, string>;
    const qLimit = Math.min(parseInt(limit || '50', 10), 200);

    let sql = 'SELECT * FROM tracking_events WHERE store_id = $1';
    const params: any[] = [storeId];
    let idx = 2;

    if (platform) {
      sql += ` AND platform = $${idx}`;
      params.push(platform);
      idx++;
    }
    if (status) {
      sql += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (event_name) {
      sql += ` AND event_name = $${idx}`;
      params.push(event_name);
      idx++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(qLimit);

    const events = await query(sql, params);
    return { events };
  });

  // === Tracking events stats ===
  app.get('/tracking/stats', async (request) => {
    const storeId = (request as any).storeId;

    const stats = await query(
      `SELECT
        platform,
        event_name,
        status,
        COUNT(*)::int as count,
        MAX(created_at) as last_event_at
       FROM tracking_events
       WHERE store_id = $1
       GROUP BY platform, event_name, status
       ORDER BY platform, event_name, status`,
      [storeId],
    );

    const totals = await query(
      `SELECT
        platform,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'sent')::int as sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending
       FROM tracking_events
       WHERE store_id = $1
       GROUP BY platform`,
      [storeId],
    );

    return { stats, totals };
  });
}
