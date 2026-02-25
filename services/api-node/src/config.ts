import { ApiEnvSchema, validateEnv } from '@ai-commerce-os/shared';

export const config = validateEnv(ApiEnvSchema);
