-- Client / product activity (batched from the web app when Clerk session is present).
-- Complements api_process_logs (HTTP) and ai_usage_events (model usage).

CREATE TABLE IF NOT EXISTS user_activity_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity_events (user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_clerk_user_id ON user_activity_events (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_action ON user_activity_events (action);
