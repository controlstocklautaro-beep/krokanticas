CREATE TABLE IF NOT EXISTS storage_fallback (
  path TEXT PRIMARY KEY NOT NULL,
  contents BYTEA NOT NULL,
  content_type TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS storage_fallback_created_idx ON storage_fallback (created_at);
