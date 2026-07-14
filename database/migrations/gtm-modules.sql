-- GTM Modules: per-workspace GTM wizard profiles (product / service / app / business line)
-- Used by platform/content-engine/gtm-wizard-routes.js and app GtmModuleWizard

create table if not exists public.gtm_modules (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces (id) on delete cascade,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  company_id      text,
  name            text        not null default 'Untitled module',
  module_type     text        not null default 'product'
                              check (module_type in ('product', 'service', 'app', 'business_line')),
  status          text        not null default 'draft'
                              check (status in ('draft', 'in_progress', 'ready', 'archived')),
  source_context  jsonb       not null default '{}'::jsonb,
  profile         jsonb       not null default '{}'::jsonb,
  section_state   jsonb       not null default '{}'::jsonb,
  active          boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists gtm_modules_workspace_active
  on public.gtm_modules (workspace_id, active, updated_at desc);

create index if not exists gtm_modules_user_created
  on public.gtm_modules (user_id, created_at desc);

create or replace function public.gtm_modules_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gtm_modules_updated_at on public.gtm_modules;
create trigger gtm_modules_updated_at
  before update on public.gtm_modules
  for each row
  execute function public.gtm_modules_set_updated_at();

-- Only one active module per workspace
create or replace function public.gtm_modules_enforce_single_active()
returns trigger
language plpgsql
as $$
begin
  if new.active is true then
    update public.gtm_modules
       set active = false, updated_at = now()
     where workspace_id = new.workspace_id
       and id <> new.id
       and active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_modules_single_active on public.gtm_modules;
create trigger gtm_modules_single_active
  before insert or update of active on public.gtm_modules
  for each row
  when (new.active = true)
  execute function public.gtm_modules_enforce_single_active();

alter table public.gtm_modules enable row level security;

drop policy if exists "users manage own gtm_modules" on public.gtm_modules;
create policy "users manage own gtm_modules"
  on public.gtm_modules
  for all
  using (
    auth.uid() = user_id
    or workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    or workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Link strategies to modules (nullable for legacy rows)
alter table public.gtm_strategies
  add column if not exists module_id uuid references public.gtm_modules (id) on delete set null;

create index if not exists gtm_strategies_module_id
  on public.gtm_strategies (module_id);
