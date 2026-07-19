-- Keel — deploy usage ledger
-- Backs the hard kill-switch in src/lib/sandbox/deployKillSwitch.js, same
-- rationale as sandbox_usage in 0001_init.sql: written only by server-side
-- code using the service-role key (see api/deploy/publish.js), no policies
-- granted to anon/authenticated so a client can't erase its own usage
-- history to bypass the monthly cap.
create table if not exists public.deploy_usage (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  deployment_url text,
  created_at timestamptz not null default now()
);

alter table public.deploy_usage enable row level security;

create index if not exists deploy_usage_created_at_idx on public.deploy_usage (created_at);
