-- Recap – tillägg 2: planritning, kvitton, prio, "följer med lägenheten" och idéer.
-- Kör hela filen i Supabase → SQL Editor → New query → Run. Går att köra flera gånger.

alter table public.projects  add column if not exists floorplan_path text;
alter table public.rooms     add column if not exists plan jsonb;

alter table public.purchases add column if not exists priority smallint not null default 2;
alter table public.purchases add column if not exists stays boolean not null default false;
alter table public.purchases add column if not exists receipt_path text;
alter table public.purchases add column if not exists bought_on date;

alter table public.tasks add column if not exists priority smallint not null default 2;
alter table public.tasks add column if not exists receipt_path text;

create table if not exists public.ideas (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  room_id     uuid references public.rooms on delete set null,
  title       text not null,
  note        text,
  link        text,
  image_path  text,
  created_at  timestamptz not null default now()
);

alter table public.ideas enable row level security;
drop policy if exists "idéer" on public.ideas;
create policy "idéer" on public.ideas for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.ideas to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ideas') then
    alter publication supabase_realtime add table public.ideas;
  end if;
end $$;
