-- Recap – tillägg 3: egna mappar, detaljer (t.ex. färgkod) och klickbar planritning.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 002). Går att köra flera gånger.

create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  name        text not null,
  icon        text not null default 'folder',
  color       text not null default 'lilac',
  budget      numeric,
  note        text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.folders enable row level security;
drop policy if exists "mappar" on public.folders;
create policy "mappar" on public.folders for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.folders to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'folders') then
    alter publication supabase_realtime add table public.folders;
  end if;
end $$;

-- Allt kan ligga i en mapp.
alter table public.purchases add column if not exists folder_id uuid references public.folders on delete set null;
alter table public.tasks     add column if not exists folder_id uuid references public.folders on delete set null;
alter table public.ideas     add column if not exists folder_id uuid references public.folders on delete set null;

-- Detaljer som fria fält, t.ex. [{"label": "Färgkod", "value": "NCS S 0502-Y"}].
alter table public.purchases add column if not exists details jsonb;
alter table public.tasks     add column if not exists details jsonb;

-- När ett jobb utfördes.
alter table public.tasks add column if not exists done_on date;

-- Planritningen som rutnät där varje ruta hör till ett rum (se src/lib/plangrid.ts).
alter table public.projects add column if not exists floorplan_map jsonb;
