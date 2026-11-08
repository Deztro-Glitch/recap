-- Recap – tillägg 14: riktiga projekt (renoveringar), t.ex. "Köksrenovering" med budget, start, slut och rum.
-- Köp och jobb kopplas till ett projekt med renovation_id. Tabellen heter renovations eftersom projects är hemmet.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 013). Går att köra flera gånger.

create table if not exists public.renovations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  name        text not null,
  status      text not null default 'active' check (status in ('planned', 'active', 'done')),
  budget      numeric,
  starts_on   date,
  ends_on     date,
  room_ids    uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);

alter table public.renovations enable row level security;
drop policy if exists "projekt" on public.renovations;
create policy "projekt" on public.renovations for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.renovations to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'renovations') then
    alter publication supabase_realtime add table public.renovations;
  end if;
end $$;

alter table public.purchases add column if not exists renovation_id uuid references public.renovations on delete set null;
alter table public.tasks add column if not exists renovation_id uuid references public.renovations on delete set null;

-- Det som redan fanns blir ett första projekt, "Renovering", i varje hem som har renoveringsköp, jobb eller en budget.
-- Budgeten från Inställningar flyttar dit, och alla köp märkta som renovering och alla jobb kopplas till det.
insert into public.renovations (project_id, name, status, budget)
select p.id, 'Renovering', 'active', nullif(p.budget, 0)
from public.projects p
where not exists (select 1 from public.renovations r where r.project_id = p.id)
  and (coalesce(p.budget, 0) > 0
    or exists (select 1 from public.purchases x where x.project_id = p.id and x.scope = 'build')
    or exists (select 1 from public.tasks t where t.project_id = p.id));

update public.purchases x set renovation_id = r.id
from public.renovations r
where r.project_id = x.project_id and r.name = 'Renovering' and x.scope = 'build' and x.renovation_id is null;

update public.tasks t set renovation_id = r.id
from public.renovations r
where r.project_id = t.project_id and r.name = 'Renovering' and t.renovation_id is null;
