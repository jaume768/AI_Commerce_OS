import { WorkerEnvSchema, validateEnv } from '@ai-commerce-os/shared';

export const config = validateEnv(WorkerEnvSchema);
