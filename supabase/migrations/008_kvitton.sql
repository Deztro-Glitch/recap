-- Recap – tillägg 8: ett kvitto kan ha flera rader. Kvittot är förälder, inköpen på det är barn.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 007). Går att köra flera gånger.

create table if not exists public.receipts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  file_path   text,                 -- bilden eller PDF:en
  store       text,
  bought_on   date,
  total       numeric,
  created_at  timestamptz not null default now()
);

alter table public.receipts enable row level security;
drop policy if exists "kvitton" on public.receipts;
create policy "kvitton" on public.receipts for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.receipts to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'receipts') then
    alter publication supabase_realtime add table public.receipts;
  end if;
end $$;

-- Varje rad på kvittot blir ett eget inköp med eget rum och läge.
alter table public.purchases add column if not exists receipt_id uuid references public.receipts on delete set null;
