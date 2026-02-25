import { FastifyInstance } from 'fastify';
import { CreateApprovalSchema, UpdateApprovalSchema, PaginationSchema } from '@ai-commerce-os/shared';
import { query, queryOne } from '../db';
import { requireRole } from '../middleware/rbac';
import { createLogger } from '@ai-commerce-os/shared';

const log = createLogger('api-node');

export async function approvalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.extractTenant);

  // List approvals
  app.get('/approvals', async (request) => {
    const { page, limit } = PaginationSchema.parse(request.query);
    const offset = (page - 1) * limit;
    const storeId = (request as any).storeId;

    const approvals = await query(
      'SELECT * FROM approvals WHERE store_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [storeId, limit, offset],
    );

    const [{ count }] = await query<{ count: string }>(
      'SELECT count(*) FROM approvals WHERE store_id = $1',
      [storeId],
    );

    return { data: approvals, pagination: { page, limit, total: parseInt(count, 10) } };
  });

  // Get single approval
  app.get('/approvals/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const storeId = (request as any).storeId;

    const approval = await queryOne(
      'SELECT * FROM approvals WHERE id = $1 AND store_id = $2',
      [id, storeId],
    );

    if (!approval) return reply.status(404).send({ error: 'Approval not found' });
    return approval;
  });

  // Create approval (admin only)
  app.post('/approvals', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const parsed = CreateApprovalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const data = parsed.data;
    const storeId = (request as any).storeId;
    const userId = request.user.sub;

    const [approval] = await query(
      `INSERT INTO approvals (store_id, title, description, task_id, approval_type, diff_payload, metadata, created_by, actor_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'user','pending')
       RETURNING *`,
      [
        storeId, data.title, data.description || null, data.task_id || null,
        data.approval_type || null, JSON.stringify(data.diff_payload),
        JSON.stringify(data.metadata), userId,
      ],
    );

    log.info({ storeId, approvalId: approval.id }, 'Approval created');

    await query(
      `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_id, actor_type, changes)
       VALUES ($1, 'approval', $2, 'created', $3, 'user', $4)`,
      [storeId, approval.id, userId, JSON.stringify({ title: data.title, status: 'pending' })],
    );

    return reply.status(201).send(approval);
  });

  // Update approval status (admin only)
  app.patch('/approvals/:id', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const storeId = (request as any).storeId;
    const userId = request.user.sub;

    const parsed = UpdateApprovalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { status, reason } = parsed.data;

    const existing = await queryOne<{ status: string }>(
      'SELECT status FROM approvals WHERE id = $1 AND store_id = $2',
      [id, storeId],
    );
    if (!existing) return reply.status(404).send({ error: 'Approval not found' });

    // State machine validation
    const validTransitions: Record<string, string[]> = {
      draft: ['pending', 'cancelled'],
      pending: ['approved', 'rejected', 'cancelled'],
    };
    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(status)) {
      return reply.status(400).send({
        error: 'Invalid transition',
        message: `Cannot transition from ${existing.status} to ${status}`,
      });
    }

    const decidedAt = ['approved', 'rejected'].includes(status) ? new Date().toISOString() : null;

    const [approval] = await query(
      `UPDATE approvals SET status = $1, reason = $2, decided_by = $3, decided_at = $4
       WHERE id = $5 AND store_id = $6 RETURNING *`,
      [status, reason || null, userId, decidedAt, id, storeId],
    );

    log.info({ storeId, approvalId: id, status }, 'Approval updated');

    await query(
      `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_id, actor_type, changes)
       VALUES ($1, 'approval', $2, 'status_changed', $3, 'user', $4)`,
      [storeId, id, userId, JSON.stringify({ from: existing.status, to: status, reason })],
    );

    return approval;
  });
}
