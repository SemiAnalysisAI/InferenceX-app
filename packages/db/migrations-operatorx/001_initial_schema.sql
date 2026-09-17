-- Raw documents retain reproducibility after GitHub's artifact retention expires.
CREATE TABLE IF NOT EXISTS opx_runs (
    run_id bigint PRIMARY KEY,
    run_attempt integer NOT NULL CHECK (run_attempt > 0),
    bundle jsonb NOT NULL,
    summary jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
