import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import http from 'http';
import { createLogger, type TaskJobData } from '@ai-commerce-os/shared';
import { createS3Client } from '@ai-commerce-os/connectors';
import { config } from './config';
import { handleDummyTask } from './handlers/dummy';

const log = createLogger('worker');

// DB pool
const db = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});

// S3 client
const storage = createS3Client({
  endpoint: config.S3_ENDPOINT,
  accessKey: config.S3_ACCESS_KEY,
  secretKey: config.S3_SECRET_KEY,
  bucket: config.S3_BUCKET,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
});

// Redis connection
const redisUrl = new URL(config.REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
};

// Task handler registry
const handlers: Record<string, (job: TaskJobData, db: Pool, storage: any) => Promise<void>> = {
  dummy: handleDummyTask,
  // Add more handlers here as needed
};

// BullMQ Worker
const worker = new Worker<TaskJobData>(
  'tasks',
  async (job: Job<TaskJobData>) => {
    const { taskId, storeId, taskType } = job.data;
    const jobLog = log.child({ taskId, storeId, taskType, jobId: job.id });

    jobLog.info('Job received');

    // Idempotency check: skip if already completed
    const { rows } = await db.query(
      'SELECT status FROM tasks WHERE id = $1 AND store_id = $2',
      [taskId, storeId],
    );

    if (rows.length === 0) {
      jobLog.warn('Task not found in DB, skipping');
      return;
    }

    if (rows[0].status === 'completed') {
      jobLog.info('Task already completed, skipping (idempotent)');
      return;
    }

    // Update status to processing
    await db.query(
      'UPDATE tasks SET status = $1, started_at = NOW(), attempts = attempts + 1 WHERE id = $2',
      ['processing', taskId],
    );

    // Find handler
    const handler = handlers[taskType];
    if (!handler) {
      jobLog.error({ taskType }, 'No handler registered for task type');
      await db.query(
        "UPDATE tasks SET status = 'failed', error = $1 WHERE id = $2",
        [`No handler for task type: ${taskType}`, taskId],
      );
      throw new Error(`No handler for task type: ${taskType}`);
    }

    // Execute handler
    try {
      if (config.DRY_RUN) {
        jobLog.info('DRY_RUN enabled — simulating task execution');
      }
      await handler(job.data, db, storage);

      // Mark completed
      await db.query(
        "UPDATE tasks SET status = 'completed', completed_at = NOW(), result = $1 WHERE id = $2",
        [JSON.stringify({ success: true, dryRun: config.DRY_RUN }), taskId],
      );

      jobLog.info('Job completed successfully');
    } catch (err: any) {
      jobLog.error({ err: err.message }, 'Job failed');

      await db.query(
        "UPDATE tasks SET status = 'failed', error = $1 WHERE id = $2",
        [err.message, taskId],
      );

      throw err; // Let BullMQ handle retry
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  },
);

worker.on('completed', (job) => {
  log.info({ jobId: job?.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});

// Health endpoint
const healthServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'worker', timestamp: new Date().toISOString() }));
});

healthServer.listen(4001, '0.0.0.0', () => {
  log.info({ port: 4001 }, 'Worker health server started');
});

log.info('Worker started, waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('Shutting down worker...');
  await worker.close();
  await db.end();
  healthServer.close();
  process.exit(0);
});
