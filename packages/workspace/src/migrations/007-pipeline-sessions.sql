CREATE TABLE IF NOT EXISTS pipeline_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  user_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  conversation_history TEXT NOT NULL DEFAULT '[]',
  active_spec_id TEXT,
  autopilot INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pipeline_sessions_project ON pipeline_sessions(project_id);
CREATE INDEX idx_pipeline_sessions_user ON pipeline_sessions(user_id);
CREATE UNIQUE INDEX idx_pipeline_sessions_active ON pipeline_sessions(project_id, user_id) WHERE status = 'active';
