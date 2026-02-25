import { FastifyInstance } from 'fastify';
import { CreateTaskSchema, UpdateTaskSchema, PaginationSchema } from '@ai-commerce-os/shared';
import { query, queryOne } from '../db';
import { enqueueTask } from '../queue';
import { requireRole } from '../middleware/rbac';
import { createLogger } from '@ai-commerce-os/shared';

const log = createLogger('api-node');

export async function taskRoutes(app: FastifyInstance) {
  // All task routes require auth + tenant
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.extractTenant);

  // List tasks
  app.get('/tasks', async (request) => {
    const { page, limit } = PaginationSchema.parse(request.query);
    const offset = (page - 1) * limit;
    const storeId = (request as any).storeId;

    const tasks = await query(
      `SELECT * FROM tasks WHERE store_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [storeId, limit, offset],
    );

    const [{ count }] = await query<{ count: string }>(
      'SELECT count(*) FROM tasks WHERE store_id = $1',
      [storeId],
    );

    return { data: tasks, pagination: { page, limit, total: parseInt(count, 10) } };
  });

  // Get single task
  app.get('/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const storeId = (request as any).storeId;

    const task = await queryOne(
      'SELECT * FROM tasks WHERE id = $1 AND store_id = $2',
      [id, storeId],
    );

    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return task;
  });

  // Create task (admin only)
  app.post('/tasks', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const parsed = CreateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const data = parsed.data;
    const storeId = (request as any).storeId;
    const userId = request.user.sub;

    // Idempotency check
    if (data.idempotency_key) {
      const existing = await queryOne(
        'SELECT id, status FROM tasks WHERE idempotency_key = $1 AND store_id = $2',
        [data.idempotency_key, storeId],
      );
      if (existing) {
        return reply.status(200).send(existing);
      }
    }

    const [task] = await query(
      `INSERT INTO tasks (store_id, title, description, task_type, priority, payload, goal_id,
        scheduled_at, idempotency_key, dry_run, metadata, created_by, actor_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'user','queued')
       RETURNING *`,
      [
        storeId, data.title, data.description || null, data.task_type, data.priority,
        JSON.stringify(data.payload), data.goal_id || null,
        data.scheduled_at || null, data.idempotency_key || null,
        data.dry_run, JSON.stringify(data.metadata), userId,
      ],
    );

    // Enqueue for worker processing
    await enqueueTask({ taskId: task.id, storeId, taskType: data.task_type });

    log.info({ storeId, taskId: task.id, taskType: data.task_type }, 'Task created and enqueued');

    // Audit log
    await query(
      `INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_id, actor_type, changes)
       VALUES ($1, 'task', $2, 'created', $3, 'user', $4)`,
      [storeId, task.id, userId, JSON.stringify({ task_type: data.task_type, title: data.title })],
    );

    return reply.status(201).send(task);
  });

  // Update task (admin only)
  app.patch('/tasks/:id', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const storeId = (request as any).storeId;

    const parsed = UpdateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const updates = parsed.data;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        values.push(key === 'metadata' ? JSON.stringify(value) : value);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    values.push(id, storeId);
    const task = await queryOne(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${idx} AND store_id = $${idx + 1} RETURNING *`,
      values,
    );

    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return task;
  });
}
