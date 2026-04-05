-- Migration: V002__phase2_trajectory_states.sql
-- Phase 2 — HMM trajectory state persistence
--
-- Creates the trajectory_states hypertable used by hmm_trajectory.py to
-- persist per-step Viterbi state sequences. A 48-hour retention policy keeps
-- the table small on edge hardware.
--
-- Idempotent: safe to apply on a database that already has this table.

CREATE TABLE IF NOT EXISTS trajectory_states (
    time          TIMESTAMPTZ NOT NULL,
    uid           TEXT        NOT NULL,
    state         TEXT        NOT NULL,
    confidence    FLOAT       NOT NULL,
    anomaly_score FLOAT       NOT NULL
);

SELECT create_hypertable(
    'trajectory_states', 'time',
    if_not_exists       => TRUE,
    chunk_time_interval => INTERVAL '1 hour'
);

-- Retention policy — guard against duplicate policy error on re-run
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs j
        JOIN timescaledb_information.job_stats js USING (job_id)
        WHERE j.hypertable_name = 'trajectory_states'
          AND j.proc_name       = 'policy_retention'
    ) THEN
        PERFORM add_retention_policy('trajectory_states', INTERVAL '48 hours');
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_traj_uid ON trajectory_states (uid, time DESC);
