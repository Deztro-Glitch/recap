-- Recap – tillägg 2: planritning, kvitton, prio, "följer med lägenheten" och idéer.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (en gång, efter schema.sql).

-- Planritning: bilden per hem, och var varje rum ligger på den (andelar 0–1 av bilden).
alter table public.projects add column if not exists floorplan_path text;
alter table public.rooms    add column if not exists plan jsonb;   -- { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.25 }

-- Inköp: prio (1 hög, 2 normal, 3 låg), om saken stannar i lägenheten, kvitto och köpdatum.
alter table public.purchases add column if not exists priority smallint not null default 2;
alter table public.purchases add column if not exists stays boolean not null default false;
alter table public.purchases add column if not exists receipt_path text;
alter table public.purchases add column if not exists bought_on date;

-- Jobb: prio och kvitto (t.ex. faktura från hantverkare).
alter table public.tasks add column if not exists priority smallint not null default 2;
alter table public.tasks add column if not exists receipt_path text;

-- Idéer
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
create policy "idéer" on public.ideas for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.ideas to authenticated;

-- Filer (kvitton, planritningar) läggs i samma privata bucket som fotona, under "<projekt-id>/files/".
-- Befintliga storage-policyer täcker dem redan.

alter publication supabase_realtime add table public.ideas;
