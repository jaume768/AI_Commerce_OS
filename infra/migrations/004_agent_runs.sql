-- AI Commerce OS — Fase 6: Agent runs & config tables
-- Stores agent execution history and per-store agent configuration (kill switch)

-- ============================================================
-- agent_runs — one row per agent execution
-- ============================================================
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  agent_name VARCHAR(50) NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'running',   -- running, completed, failed, cancelled
  trigger VARCHAR(30) DEFAULT 'manual',   -- manual, schedule, webhook, approval
  input_payload JSONB DEFAULT '{}',
  output_payload JSONB DEFAULT '{}',
  actions_taken JSONB DEFAULT '[]',
  actions_proposed JSONB DEFAULT '[]',
  error TEXT,
  tokens_used JSONB DEFAULT '{}',         -- {prompt_tokens, completion_tokens, total_tokens, cost_usd}
  artifacts JSONB DEFAULT '[]',           -- [{key, type, size, name}]
  duration_ms INTEGER,
  dry_run BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_store ON agent_runs(store_id);
CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_name);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_created ON agent_runs(created_at DESC);
CREATE INDEX idx_agent_runs_store_agent ON agent_runs(store_id, agent_name);

-- ============================================================
-- agent_config — per-store agent settings + kill switch
-- ============================================================
CREATE TABLE agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  agent_name VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, agent_name)
);

CREATE INDEX idx_agent_config_store ON agent_config(store_id);

CREATE TRIGGER trg_agent_config_updated_at BEFORE UPDATE ON agent_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- email_inbox — stores fetched emails for SupportAgent
-- ============================================================
CREATE TABLE email_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  message_id VARCHAR(500) UNIQUE,          -- IMAP Message-ID header (dedup)
  from_address VARCHAR(500) NOT NULL,
  to_address VARCHAR(500),
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ,
  is_customer BOOLEAN DEFAULT false,       -- classified by agent
  classification VARCHAR(50),              -- complaint, question, return_request, spam, other
  auto_reply_sent BOOLEAN DEFAULT false,
  suggested_response TEXT,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'new',        -- new, processing, responded, archived
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_inbox_store ON email_inbox(store_id);
CREATE INDEX idx_email_inbox_status ON email_inbox(status);
CREATE INDEX idx_email_inbox_message_id ON email_inbox(message_id);
CREATE INDEX idx_email_inbox_created ON email_inbox(created_at DESC);
