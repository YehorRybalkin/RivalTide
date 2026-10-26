-- Row-level security.
--
-- Request-scoped database work runs inside a transaction that executes
--   SET LOCAL ROLE rivaltide_app;
--   SELECT set_config('app.user_id', '<uuid>', true);
-- rivaltide_app is a NOLOGIN role without BYPASSRLS, so every policy below is
-- enforced even if application code forgets a WHERE clause. System contexts
-- (worker, auth bootstrap, Stripe webhooks) run as the owner role.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rivaltide_app') then
    create role rivaltide_app nologin;
  end if;
end $$;

-- Allow the connecting (owner) role to switch into rivaltide_app.
do $$
begin
  execute format('grant rivaltide_app to %I', current_user);
end $$;

-- Supabase exposes the public schema through PostgREST to anon/authenticated.
-- RivalTide never uses that API; make sure those roles cannot read anything.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
    end if;
  end loop;
end $$;

create or replace function app_current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- SECURITY DEFINER so it can read memberships without recursive policy evaluation.
create or replace function app_user_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select organization_id from memberships where user_id = app_current_user_id()
$$;

create or replace function app_is_org_owner(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where organization_id = org and user_id = app_current_user_id() and role = 'owner'
  )
$$;

create or replace function app_shares_org_with(other_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = other_user and m.organization_id in (select app_user_org_ids())
  )
$$;

revoke all on function app_user_org_ids() from public;
revoke all on function app_is_org_owner(uuid) from public;
revoke all on function app_shares_org_with(uuid) from public;
grant execute on function app_current_user_id(), app_user_org_ids(), app_is_org_owner(uuid), app_shares_org_with(uuid) to rivaltide_app;

grant usage on schema public to rivaltide_app;

-- Enable RLS everywhere (including system-only tables, which get no policies).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Users: see yourself and people who share an organization; update only yourself.
-- Column-level grant: password_hash is never readable by the application role.
grant select (id, email, name, email_verified_at, is_operator, is_demo, preferences, created_at, updated_at) on users to rivaltide_app;
grant update (name, preferences) on users to rivaltide_app;
create policy users_select on users for select to rivaltide_app
  using (id = app_current_user_id() or app_shares_org_with(id));
create policy users_update on users for update to rivaltide_app
  using (id = app_current_user_id()) with check (id = app_current_user_id());

-- Organizations
grant select, update (name) on organizations to rivaltide_app;
create policy organizations_select on organizations for select to rivaltide_app
  using (id in (select app_user_org_ids()));
create policy organizations_update on organizations for update to rivaltide_app
  using (app_is_org_owner(id)) with check (app_is_org_owner(id));

-- Memberships: members can see their org's members; only owners manage them.
grant select, insert, update, delete on memberships to rivaltide_app;
create policy memberships_select on memberships for select to rivaltide_app
  using (organization_id in (select app_user_org_ids()));
create policy memberships_write on memberships for insert to rivaltide_app
  with check (app_is_org_owner(organization_id));
create policy memberships_update on memberships for update to rivaltide_app
  using (app_is_org_owner(organization_id)) with check (app_is_org_owner(organization_id));
create policy memberships_delete on memberships for delete to rivaltide_app
  using (app_is_org_owner(organization_id) or user_id = app_current_user_id());

grant select, insert, update, delete on invitations to rivaltide_app;
create policy invitations_owner on invitations for all to rivaltide_app
  using (app_is_org_owner(organization_id)) with check (app_is_org_owner(organization_id));

-- Generic organization-scoped tables: any member may read/write.
do $$
declare t text;
begin
  foreach t in array array['client_workspaces', 'competitors', 'monitored_pages', 'monitoring_jobs',
    'monitoring_attempts', 'snapshots', 'detected_changes', 'change_suppressions', 'ai_insights',
    'report_definitions', 'generated_reports', 'comparison_criteria', 'comparison_values']
  loop
    execute format('grant select, insert, update, delete on %I to rivaltide_app', t);
    execute format(
      'create policy %I on %I for all to rivaltide_app using (organization_id in (select app_user_org_ids())) with check (organization_id in (select app_user_org_ids()))',
      t || '_org_member', t);
  end loop;
end $$;

-- Read-only for members; written by system contexts.
grant select on subscriptions to rivaltide_app;
create policy subscriptions_select on subscriptions for select to rivaltide_app
  using (organization_id in (select app_user_org_ids()));

grant select on plans to rivaltide_app;
create policy plans_select on plans for select to rivaltide_app using (true);

grant select, insert on usage_events to rivaltide_app;
create policy usage_events_select on usage_events for select to rivaltide_app
  using (organization_id in (select app_user_org_ids()));
create policy usage_events_insert on usage_events for insert to rivaltide_app
  with check (organization_id in (select app_user_org_ids()));

grant select, insert on audit_logs to rivaltide_app;
create policy audit_logs_select on audit_logs for select to rivaltide_app
  using (organization_id in (select app_user_org_ids()));
create policy audit_logs_insert on audit_logs for insert to rivaltide_app
  with check (organization_id in (select app_user_org_ids()) and actor_user_id = app_current_user_id());

-- Personal tables: only the owning user.
grant select, update on alerts to rivaltide_app;
create policy alerts_own on alerts for all to rivaltide_app
  using (user_id = app_current_user_id() and organization_id in (select app_user_org_ids()))
  with check (user_id = app_current_user_id());

grant select, insert, update, delete on notification_preferences to rivaltide_app;
create policy notification_preferences_own on notification_preferences for all to rivaltide_app
  using (user_id = app_current_user_id() and organization_id in (select app_user_org_ids()))
  with check (user_id = app_current_user_id() and organization_id in (select app_user_org_ids()));

grant select on email_deliveries to rivaltide_app;
create policy email_deliveries_own on email_deliveries for select to rivaltide_app
  using (user_id = app_current_user_id());

-- sessions, password_reset_tokens, stripe_events, rate_limits, domain_state:
-- RLS enabled with no policies and no grants => inaccessible to rivaltide_app.
