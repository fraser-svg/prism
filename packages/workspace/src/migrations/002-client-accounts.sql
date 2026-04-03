CREATE TABLE client_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE projects ADD COLUMN client_account_id TEXT REFERENCES client_accounts(id);
ALTER TABLE projects ADD COLUMN owner TEXT;
ALTER TABLE projects ADD COLUMN priority TEXT DEFAULT 'normal';
ALTER TABLE projects ADD COLUMN risk_state TEXT DEFAULT 'healthy';
ALTER TABLE projects ADD COLUMN deploy_url TEXT;

CREATE INDEX idx_projects_client ON projects(client_account_id);
CREATE INDEX idx_client_accounts_status ON client_accounts(status);
