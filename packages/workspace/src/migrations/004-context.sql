-- Context Dump: context items, extracted knowledge, and knowledge summaries
-- Supports both client-level and project-level context scoping (XOR)

CREATE TABLE context_items (
  id TEXT PRIMARY KEY,
  client_account_id TEXT,
  project_id TEXT,
  item_type TEXT NOT NULL,           -- 'text_note' | 'file' | 'directory' | 'url'
  title TEXT NOT NULL,
  file_path TEXT,                    -- for files/directories: path on disk
  content TEXT,                      -- for text_notes: the content; for files: extracted text
  mime_type TEXT,
  file_size_bytes INTEGER,
  extraction_status TEXT NOT NULL DEFAULT 'queued',  -- 'queued'|'extracting'|'extracted'|'failed'|'stored'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_account_id) REFERENCES client_accounts(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  CHECK ((client_account_id IS NOT NULL) != (project_id IS NOT NULL))
);

CREATE TABLE extracted_knowledge (
  id TEXT PRIMARY KEY,
  client_account_id TEXT,
  project_id TEXT,
  source_item_id TEXT NOT NULL REFERENCES context_items(id) ON DELETE CASCADE,
  category TEXT NOT NULL,            -- 'business' | 'technical' | 'design' | 'history'
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 0.8,
  flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE knowledge_summaries (
  id TEXT PRIMARY KEY,
  client_account_id TEXT,
  project_id TEXT,
  summary_type TEXT NOT NULL,        -- 'client_profile' | 'project_brief'
  content TEXT NOT NULL,
  brand_colors TEXT,                 -- JSON array of hex strings
  source_item_count INTEGER,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- COALESCE unique index: prevents duplicate summaries even when nullable columns are NULL
-- (SQLite treats NULLs as distinct in UNIQUE constraints, so table-level UNIQUE won't work)
CREATE UNIQUE INDEX idx_summaries_unique
  ON knowledge_summaries(COALESCE(client_account_id, ''), COALESCE(project_id, ''), summary_type);

-- FTS5 for knowledge search
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  key, value, category,
  content=extracted_knowledge,
  content_rowid=rowid,
  tokenize='porter unicode61'
);

-- FTS sync triggers (same pattern as artifact_fts in 001-initial.sql)
CREATE TRIGGER knowledge_fts_insert AFTER INSERT ON extracted_knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, key, value, category)
  VALUES (new.rowid, new.key, new.value, new.category);
END;

CREATE TRIGGER knowledge_fts_delete AFTER DELETE ON extracted_knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, key, value, category)
  VALUES ('delete', old.rowid, old.key, old.value, old.category);
END;

CREATE TRIGGER knowledge_fts_update AFTER UPDATE ON extracted_knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, key, value, category)
  VALUES ('delete', old.rowid, old.key, old.value, old.category);
  INSERT INTO knowledge_fts(rowid, key, value, category)
  VALUES (new.rowid, new.key, new.value, new.category);
END;

-- Partial indexes on FK columns for query performance
CREATE INDEX idx_context_items_client ON context_items(client_account_id) WHERE client_account_id IS NOT NULL;
CREATE INDEX idx_context_items_project ON context_items(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_knowledge_source ON extracted_knowledge(source_item_id);
CREATE INDEX idx_knowledge_client ON extracted_knowledge(client_account_id) WHERE client_account_id IS NOT NULL;
CREATE INDEX idx_knowledge_project ON extracted_knowledge(project_id) WHERE project_id IS NOT NULL;
