ALTER TABLE exact_cache_entries
  ADD COLUMN IF NOT EXISTS semantic_cache_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS semantic_input_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS semantic_embedding JSONB NULL,
  ADD COLUMN IF NOT EXISTS embedding_provider TEXT NULL,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER NULL,
  ADD COLUMN IF NOT EXISTS semantic_policy_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS system_prompt_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS semantic_created_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS exact_cache_entries_semantic_candidates_idx
  ON exact_cache_entries (
    tenant_hash,
    model,
    embedding_provider,
    embedding_dimensions,
    semantic_policy_version,
    system_prompt_hash,
    expires_at
  )
  WHERE semantic_cache_eligible = true;
