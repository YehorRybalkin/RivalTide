-- RivalTide core schema.
-- Conventions: UUID primary keys, organization_id on every tenant-owned row,
-- created_at/updated_at timestamps, explicit foreign keys and indexes.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null default '',
  password_hash text not null,
  email_verified_at timestamptz,
  is_operator boolean not null default false,
  is_demo boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expires_idx on sessions(expires_at);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_tokens_user_idx on password_reset_tokens(user_id);

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  is_demo boolean not null default false,
  demo_expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type membership_role as enum ('owner', 'member');

create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role membership_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email citext not null,
  role membership_role not null default 'member',
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on invitations(organization_id);

-- A client workspace. For agencies, one per client; for founders, usually one.
-- Designed so end-client access can later be granted per workspace.
create table client_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  client_name text,
  description text,
  brand_name text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  default_check_interval_hours int not null default 24 check (default_check_interval_hours between 1 and 720),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_workspaces_org_idx on client_workspaces(organization_id);

-- ---------------------------------------------------------------------------
-- Competitors & monitored pages
-- ---------------------------------------------------------------------------
create type competitor_status as enum ('active', 'paused', 'archived');

create table competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  website_url text not null,
  description text,
  category text,
  industry text,
  notes text,
  status competitor_status not null default 'active',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competitors_ws_idx on competitors(workspace_id, status);
create index competitors_org_idx on competitors(organization_id);

create type page_type as enum ('homepage', 'pricing', 'features', 'product', 'blog', 'changelog', 'announcements', 'other');
create type page_status as enum ('active', 'paused', 'removed');
create type page_health as enum ('pending', 'healthy', 'delayed', 'failed', 'paused', 'restricted');
create type render_mode as enum ('static', 'browser');

create table monitored_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  page_type page_type not null default 'other',
  label text,
  render_mode render_mode not null default 'static',
  status page_status not null default 'active',
  health page_health not null default 'pending',
  health_detail text,
  check_interval_hours int not null default 24 check (check_interval_hours between 1 and 720),
  next_check_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_snapshot_id uuid,
  snapshot_count int not null default 0,
  consecutive_failures int not null default 0,
  http_etag text,
  http_last_modified text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index monitored_pages_unique_url on monitored_pages(competitor_id, url) where status <> 'removed';
create index monitored_pages_due_idx on monitored_pages(next_check_at) where status = 'active';
create index monitored_pages_ws_idx on monitored_pages(workspace_id);

-- ---------------------------------------------------------------------------
-- Monitoring queue
-- ---------------------------------------------------------------------------
create type job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type job_trigger as enum ('scheduled', 'manual', 'baseline');

create table monitoring_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  page_id uuid not null references monitored_pages(id) on delete cascade,
  trigger job_trigger not null default 'scheduled',
  status job_status not null default 'queued',
  idempotency_key text not null unique,
  run_after timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_by text,
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one active job per page: prevents duplicate concurrent checks.
create unique index monitoring_jobs_one_active on monitoring_jobs(page_id) where status in ('queued', 'running');
create index monitoring_jobs_claim_idx on monitoring_jobs(run_after) where status = 'queued';
create index monitoring_jobs_lease_idx on monitoring_jobs(locked_until) where status = 'running';
create index monitoring_jobs_org_idx on monitoring_jobs(organization_id, created_at desc);

create type attempt_outcome as enum (
  'changed', 'unchanged', 'baseline', 'not_modified',
  'http_error', 'timeout', 'network_error', 'blocked_robots', 'blocked_url',
  'access_denied', 'too_large', 'unsupported_content', 'empty_content', 'render_error', 'rate_limited'
);

create table monitoring_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid references monitoring_jobs(id) on delete set null,
  page_id uuid not null references monitored_pages(id) on delete cascade,
  outcome attempt_outcome not null,
  http_status int,
  final_url text,
  render_mode render_mode not null default 'static',
  duration_ms int,
  bytes int,
  error_message text,
  created_at timestamptz not null default now()
);
create index monitoring_attempts_page_idx on monitoring_attempts(page_id, created_at desc);
create index monitoring_attempts_org_idx on monitoring_attempts(organization_id, created_at desc);

-- Normalized content snapshots. Content is immutable once written.
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  page_id uuid not null references monitored_pages(id) on delete cascade,
  attempt_id uuid references monitoring_attempts(id) on delete set null,
  content_hash text not null,
  content jsonb not null,
  text_length int not null default 0,
  final_url text not null,
  http_status int,
  extractor_version int not null default 1,
  -- Snapshots referenced by changes/reports are pinned and exempt from retention cleanup.
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index snapshots_page_idx on snapshots(page_id, created_at desc);

alter table monitored_pages
  add constraint monitored_pages_last_snapshot_fk foreign key (last_snapshot_id) references snapshots(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Changes & intelligence
-- ---------------------------------------------------------------------------
create type change_category as enum ('pricing', 'product', 'features', 'positioning', 'announcement', 'general', 'unclassified');
create type change_severity as enum ('low', 'medium', 'high');
create type change_review_status as enum ('new', 'reviewed', 'dismissed');
create type change_feedback as enum ('relevant', 'irrelevant', 'incorrect');

create table detected_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  page_id uuid not null references monitored_pages(id) on delete cascade,
  previous_snapshot_id uuid not null references snapshots(id) on delete restrict,
  new_snapshot_id uuid not null references snapshots(id) on delete restrict,
  source_url text not null,
  category change_category not null,
  severity change_severity not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  detection_method text not null,
  summary text not null,
  evidence jsonb not null,
  fingerprint text not null,
  needs_review boolean not null default false,
  review_status change_review_status not null default 'new',
  feedback change_feedback,
  feedback_by uuid references users(id) on delete set null,
  is_read boolean not null default false,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index detected_changes_snapshot_pair on detected_changes(page_id, previous_snapshot_id, new_snapshot_id);
create index detected_changes_ws_idx on detected_changes(workspace_id, detected_at desc);
create index detected_changes_competitor_idx on detected_changes(competitor_id, detected_at desc);
create index detected_changes_fp_idx on detected_changes(page_id, fingerprint, detected_at desc);

-- Fingerprints that users marked irrelevant/incorrect are suppressed from future alerts.
create table change_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  page_id uuid not null references monitored_pages(id) on delete cascade,
  pattern_hash text not null,
  sample_text text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, pattern_hash)
);

create type insight_kind as enum ('change_analysis', 'theme');
create type insight_source as enum ('ai', 'deterministic');

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  competitor_id uuid references competitors(id) on delete cascade,
  change_id uuid references detected_changes(id) on delete cascade,
  kind insight_kind not null default 'change_analysis',
  generated_by insight_source not null,
  title text not null,
  importance change_severity not null default 'medium',
  observed_facts jsonb not null default '[]'::jsonb,
  interpretation text not null default '',
  who_affected text not null default '',
  opportunities jsonb not null default '[]'::jsonb,
  threats jsonb not null default '[]'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  uncertainty text not null default '',
  source_change_ids uuid[] not null default '{}',
  provider text,
  model text,
  input_hash text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  estimated_cost_usd numeric(10,6) not null default 0,
  saved_for_report boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_insights_ws_idx on ai_insights(workspace_id, created_at desc);
create index ai_insights_change_idx on ai_insights(change_id);
create index ai_insights_cache_idx on ai_insights(input_hash);

-- ---------------------------------------------------------------------------
-- Alerts & notifications
-- ---------------------------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  change_id uuid references detected_changes(id) on delete cascade,
  title text not null,
  body text not null default '',
  severity change_severity not null default 'medium',
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, change_id)
);
create index alerts_user_idx on alerts(user_id, created_at desc);

create type alert_mode as enum ('all', 'high_priority', 'pricing_only', 'digest_only', 'none');
create type digest_frequency as enum ('none', 'daily', 'weekly');

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  mode alert_mode not null default 'all',
  email_enabled boolean not null default true,
  digest digest_frequency not null default 'weekly',
  last_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create type email_status as enum ('queued', 'sent', 'failed', 'skipped_not_configured');

create table email_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  to_email citext not null,
  template text not null,
  subject text not null,
  provider text not null,
  status email_status not null default 'queued',
  provider_message_id text,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_deliveries_org_idx on email_deliveries(organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create type report_type as enum ('weekly_brief', 'competitor_deep_dive', 'client_report');

create table report_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  type report_type not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generated reports freeze their content (including evidence excerpts) at
-- generation time, so later website updates cannot alter an issued report.
create table generated_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  definition_id uuid references report_definitions(id) on delete set null,
  type report_type not null,
  title text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'final')),
  content jsonb not null,
  content_hash text not null,
  is_demo boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index generated_reports_ws_idx on generated_reports(workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Benchmarking
-- ---------------------------------------------------------------------------
create table comparison_criteria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type comparison_source as enum ('competitor_claim', 'validated', 'user_note');

create table comparison_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  criterion_id uuid not null references comparison_criteria(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  value text not null,
  source comparison_source not null default 'competitor_claim',
  evidence_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (criterion_id, competitor_id)
);

-- ---------------------------------------------------------------------------
-- Billing & usage
-- ---------------------------------------------------------------------------
create table plans (
  id text primary key,
  name text not null,
  price_cents int not null,
  currency text not null default 'EUR',
  stripe_price_id text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create type subscription_status as enum ('trialing', 'pilot', 'active', 'past_due', 'canceled', 'expired');

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  plan_id text not null references plans(id),
  status subscription_status not null,
  -- True only when backed by a verified Stripe subscription. Pilots/trials are never "paid".
  is_paid boolean not null default false,
  trial_ends_at timestamptz,
  pilot_ends_at timestamptz,
  pilot_note text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  kind text not null,
  quantity numeric not null default 1,
  estimated_cost_usd numeric(12,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_org_kind_idx on usage_events(organization_id, kind, created_at desc);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on audit_logs(organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Infrastructure (system-only tables, never exposed to tenants)
-- ---------------------------------------------------------------------------
create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

-- Per-domain crawl politeness state and robots.txt cache.
create table domain_state (
  host text primary key,
  next_allowed_at timestamptz not null default now(),
  robots_txt text,
  robots_status int,
  robots_fetched_at timestamptz,
  crawl_delay_seconds int,
  updated_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['users','organizations','memberships','client_workspaces','competitors','monitored_pages',
    'monitoring_jobs','detected_changes','ai_insights','notification_preferences','report_definitions',
    'generated_reports','comparison_criteria','comparison_values','subscriptions']
  loop
    execute format('create trigger %I_touch before update on %I for each row execute function app_touch_updated_at()', t, t);
  end loop;
end $$;

insert into plans (id, name, price_cents, currency, is_public) values
  ('starter', 'Starter', 1900, 'EUR', true),
  ('growth', 'Growth', 4900, 'EUR', true),
  ('agency', 'Agency', 12900, 'EUR', true),
  ('demo', 'Demo', 0, 'EUR', false);
