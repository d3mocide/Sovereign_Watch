-- Requires pg_stat_statements in shared_preload_libraries (base Compose).
-- Tracks normalized query timing and temporary I/O without query logging.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
