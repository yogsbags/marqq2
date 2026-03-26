-- Library artifacts: persists agent run artifacts saved by users
-- Replaces localStorage-only storage so items survive re-login

create table if not exists library_artifacts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  company_id  text,
  agent       text,
  artifact    jsonb       not null default '{}',
  saved_at    timestamptz not null default now()
);

-- Each user's library, newest first
create index if not exists library_artifacts_user_saved
  on library_artifacts (user_id, saved_at desc);

-- RLS: users can only see and modify their own items
alter table library_artifacts enable row level security;

create policy "users manage own library"
  on library_artifacts
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
