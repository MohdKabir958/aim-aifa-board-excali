-- Request / process audit trail (one row per finished /v1/* HTTP response)
CREATE TABLE IF NOT EXISTS api_process_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
  clerk_user_id TEXT,
  route TEXT NOT NULL,
  http_method TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  client_ip TEXT,
  user_agent TEXT,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_process_logs_user_id ON api_process_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_api_process_logs_clerk_user_id ON api_process_logs (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_api_process_logs_created_at ON api_process_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_process_logs_route ON api_process_logs (route);

-- Last successful API touch (updated on authenticated /v1 requests that complete)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_api_at TIMESTAMPTZ;
