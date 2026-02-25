import { Queue } from 'bullmq';
import { config } from './config';
import type { TaskJobData } from '@ai-commerce-os/shared';

const connection = {
  host: new URL(config.REDIS_URL).hostname,
  port: parseInt(new URL(config.REDIS_URL).port || '6379', 10),
};

export const taskQueue = new Queue<TaskJobData>('tasks', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export async function enqueueTask(data: TaskJobData): Promise<string> {
  const job = await taskQueue.add(data.taskType, data, {
    jobId: data.taskId, // idempotent: same taskId = same job
  });
  return job.id!;
}
