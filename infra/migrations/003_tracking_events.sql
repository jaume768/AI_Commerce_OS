-- AI Commerce OS — Fase 3: Tracking events table
-- Stores server-side events sent to Meta CAPI and TikTok Events API for audit and debugging

CREATE TABLE tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,          -- 'meta' or 'tiktok'
  event_name VARCHAR(100) NOT NULL,       -- e.g. 'Purchase', 'AddToCart', 'CompletePayment'
  event_id VARCHAR(100),                  -- dedup ID sent to platform
  source VARCHAR(50) DEFAULT 'webhook',   -- 'webhook', 'api', 'manual'
  source_id VARCHAR(255),                 -- e.g. webhook_event_id or order ID
  status VARCHAR(20) DEFAULT 'pending',   -- pending, sent, failed
  request_payload JSONB DEFAULT '{}',
  response_payload JSONB DEFAULT '{}',
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracking_events_store ON tracking_events(store_id);
CREATE INDEX idx_tracking_events_platform ON tracking_events(platform);
CREATE INDEX idx_tracking_events_status ON tracking_events(status);
CREATE INDEX idx_tracking_events_event_name ON tracking_events(event_name);
CREATE INDEX idx_tracking_events_created ON tracking_events(created_at DESC);
CREATE INDEX idx_tracking_events_source ON tracking_events(source, source_id);
