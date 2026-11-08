-- Recap – tillägg 15: underhåll på riktigt och garantier.
-- maintenance: det som behöver skötas med jämna mellanrum (filter i köksfläkten, rengöra diskmaskinen …),
-- med intervall i dagar, senast gjort, rum och vitvaran det gäller. Ersätter exemplen i appen.
-- purchases.warranty_until: garanti eller reklamationsrätt till och med detta datum.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 014). Går att köra flera gånger.

create table if not exists public.maintenance (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  name        text not null,
  every_days  integer not null check (every_days > 0),
  last_done   date,
  room_id     uuid references public.rooms on delete set null,
  appliance   text,
  created_at  timestamptz not null default now()
);

alter table public.maintenance enable row level security;
drop policy if exists "underhall" on public.maintenance;
create policy "underhall" on public.maintenance for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.maintenance to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'maintenance') then
    alter publication supabase_realtime add table public.maintenance;
  end if;
end $$;

alter table public.purchases add column if not exists warranty_until date;
