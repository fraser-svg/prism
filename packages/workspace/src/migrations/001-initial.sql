CREATE TABLE _migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  root_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  primary_platform TEXT,
  product_type TEXT,
  autodetect_dismissed INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  instance_label TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'disconnected',
  scope TEXT,
  config TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, instance_label)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE artifact_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT,
  content_preview TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE(project_id, entity_type, entity_id)
);

CREATE VIRTUAL TABLE artifact_fts USING fts5(
  title, content_preview,
  content='artifact_index',
  content_rowid='id'
);

CREATE TRIGGER artifact_index_ai AFTER INSERT ON artifact_index BEGIN
  INSERT INTO artifact_fts(rowid, title, content_preview)
  VALUES (new.id, new.title, new.content_preview);
END;

CREATE TRIGGER artifact_index_ad AFTER DELETE ON artifact_index BEGIN
  INSERT INTO artifact_fts(artifact_fts, rowid, title, content_preview)
  VALUES ('delete', old.id, old.title, old.content_preview);
END;

CREATE TRIGGER artifact_index_au AFTER UPDATE ON artifact_index BEGIN
  INSERT INTO artifact_fts(artifact_fts, rowid, title, content_preview)
  VALUES ('delete', old.id, old.title, old.content_preview);
  INSERT INTO artifact_fts(rowid, title, content_preview)
  VALUES (new.id, new.title, new.content_preview);
END;

CREATE INDEX idx_events_project ON events(project_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_artifact_project ON artifact_index(project_id);
CREATE INDEX idx_artifact_type ON artifact_index(entity_type);
