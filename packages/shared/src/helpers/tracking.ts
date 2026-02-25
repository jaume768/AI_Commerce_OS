export interface TrackingConfig {
  enabled: boolean;
  pixelIds: {
    meta?: string;
    tiktok?: string;
    google?: string;
  };
  serverSideEnabled: boolean;
  consentRequired: boolean;
}

export interface TrackingEvent {
  eventName: string;
  channel: string;
  storeId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  userId?: string;
  sessionId?: string;
}

const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  enabled: false,
  pixelIds: {},
  serverSideEnabled: false,
  consentRequired: true,
};

export function getTrackingConfig(
  overrides: Partial<TrackingConfig> = {},
): TrackingConfig {
  return { ...DEFAULT_TRACKING_CONFIG, ...overrides };
}

export function buildTrackingEvent(
  params: Omit<TrackingEvent, 'timestamp'>,
): TrackingEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}

export const TRACKING_CHANNELS = ['meta', 'tiktok', 'google', 'email', 'sms'] as const;
export type TrackingChannel = (typeof TRACKING_CHANNELS)[number];

// Placeholder: will be implemented per-channel in Fase 5+
export interface ChannelEventSender {
  channel: TrackingChannel;
  send(event: TrackingEvent): Promise<void>;
}
