import pino from 'pino';

export interface LogContext {
  service?: string;
  storeId?: string;
  taskId?: string;
  runId?: string;
  traceId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function createLogger(service: string, extra: Record<string, unknown> = {}) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    base: {
      service,
      ...extra,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(process.env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  });
}

export function childLogger(
  logger: pino.Logger,
  context: LogContext,
): pino.Logger {
  return logger.child(context);
}
