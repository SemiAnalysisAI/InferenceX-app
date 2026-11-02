-- Explicitly applied only by the guarded experiment importer to its approved child DB.
-- Published configs, workflow_runs, benchmark_results and latest views remain untouched.
create table if not exists experiment_campaigns (
  slug text primary key,
  title text not null,
  description text not null,
  reference_points jsonb not null,
  comparison_notes jsonb not null,
  manifest_sha256 text not null check (length(manifest_sha256)=64),
  expected_run_count integer not null check (expected_run_count>0),
  complete boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists experiment_runs (
  campaign_slug text not null references experiment_campaigns(slug),
  run_id text not null,
  series text not null check (series in ('weka','native','recovered-c150')),
  concurrency integer not null check(concurrency>0),
  replicate integer,
  metrics jsonb not null,
  plot_metrics jsonb not null,
  configuration jsonb not null,
  provenance jsonb not null,
  health jsonb not null,
  cache_evidence jsonb not null,
  clean_backend_qualified boolean not null,
  frontier_eligible boolean not null,
  record_sha256 text not null check(length(record_sha256)=64),
  aggregate_stats jsonb not null,
  chart_series jsonb not null,
  request_timeline jsonb not null,
  payload_inventory jsonb not null,
  created_at timestamptz not null default now(),
  primary key (campaign_slug,run_id)
);
create table if not exists experiment_payload_chunks (
  campaign_slug text not null,
  run_id text not null,
  kind text not null check(kind in ('profile','server_metrics','server_log')),
  part integer not null check(part>=0),
  data bytea not null,
  sha256 text not null check(length(sha256)=64),
  primary key(campaign_slug,run_id,kind,part),
  foreign key(campaign_slug,run_id) references experiment_runs(campaign_slug,run_id)
);
