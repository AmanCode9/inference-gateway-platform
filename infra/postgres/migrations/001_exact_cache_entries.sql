CREATE TABLE IF NOT EXISTS exact_cache_entries (
  id BIGSERIAL PRIMARY KEY,
  tenant_hash TEXT NOT NULL,
  exact_cache_key TEXT NOT NULL,
  response_body JSONB NOT NULL,
  model TEXT NULL,
  provider_id TEXT NULL,
  request_fingerprint TEXT NULL,
  cache_policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT exact_cache_entries_hit_count_nonnegative CHECK (hit_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS exact_cache_entries_tenant_key_unique
  ON exact_cache_entries (tenant_hash, exact_cache_key);

CREATE INDEX IF NOT EXISTS exact_cache_entries_lookup_idx
  ON exact_cache_entries (tenant_hash, exact_cache_key, expires_at);

CREATE INDEX IF NOT EXISTS exact_cache_entries_expires_at_idx
  ON exact_cache_entries (expires_at);
