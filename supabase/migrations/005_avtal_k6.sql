-- Recap – tillägg 5: avtal, värdehöjande förbättringar (K6) och idéer som planerade inköp.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 004). Går att köra flera gånger.

-- Fasta avtal: el, bredband, försäkring, bolån, avgift och annat.
create table if not exists public.contracts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  kind        text not null default 'annat',
  provider    text not null,
  monthly     numeric not null default 0,   -- kronor per månad
  ends_on     date,                         -- när bindningstiden eller rabatten slutar
  file_path   text,                         -- avtalet som PDF eller bild
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.contracts enable row level security;
drop policy if exists "avtal" on public.contracts;
create policy "avtal" on public.contracts for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.contracts to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contracts') then
    alter publication supabase_realtime add table public.contracts;
  end if;
end $$;

-- Värdehöjande förbättring som kan dras av vid försäljning (blankett K6).
alter table public.purchases add column if not exists k6 boolean not null default false;
alter table public.tasks     add column if not exists k6 boolean not null default false;

-- Idéer blir planerade inköp med bild.
alter table public.purchases add column if not exists image_path text;

insert into public.purchases (project_id, room_id, folder_id, title, note, link, image_path, bought, est_price, created_at)
select project_id, room_id, folder_id, title, note, link, image_path, false, 0, created_at from public.ideas;
delete from public.ideas;
