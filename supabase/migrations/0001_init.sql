-- Keel — initial schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

-- ── Projects ────────────────────────────────────────────────────────────
-- Saved user projects (mirrors the "save/load projects" feature of prior
-- art in this category, backed by Postgres instead of a proprietary
-- document store).
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  files jsonb not null default '[]'::jsonb,
  needs_backend boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Users manage only their own projects"
  on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Sandbox usage ledger ────────────────────────────────────────────────
-- Backs the hard kill-switch in src/lib/sandbox/killSwitch.js. This table
-- is written only by server-side code using the service-role key (see
-- api/sandbox/start.js) — it is intentionally NOT writable by clients, so a
-- malicious client can't zero out its own usage history to bypass the cap.
create table if not exists public.sandbox_usage (
  id uuid primary key default gen_random_uuid(),
  sandbox_id text not null,
  started_at timestamptz not null,
  duration_seconds integer not null default 0
);

alter table public.sandbox_usage enable row level security;

-- No policies granted to `anon` or `authenticated` roles on purpose: only
-- the service-role key (used server-side only, never shipped to the
-- browser) can read/write this table.

create index if not exists sandbox_usage_started_at_idx on public.sandbox_usage (started_at);
create index if not exists projects_user_id_idx on public.projects (user_id);
