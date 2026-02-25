-- AI Commerce OS — Fase 5: Webhook events table
-- Stores incoming Shopify webhook events for processing and audit

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  topic VARCHAR(100) NOT NULL,           -- e.g. 'orders/create', 'products/update'
  shopify_id VARCHAR(100),               -- Shopify resource ID from header
  shopify_event_id VARCHAR(100),         -- X-Shopify-Event-Id (dedup)
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'received', -- received, processing, processed, failed
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_store ON webhook_events(store_id);
CREATE INDEX idx_webhook_events_topic ON webhook_events(topic);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_shopify_event ON webhook_events(shopify_event_id);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at DESC);
