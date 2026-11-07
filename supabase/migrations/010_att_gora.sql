-- Recap – tillägg 10: en enkel att göra-lista per hem (kortet "Att göra" i Boende).
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 009). Går att köra flera gånger.

create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  title       text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.todos enable row level security;
drop policy if exists "att gora" on public.todos;
create policy "att gora" on public.todos for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.todos to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'todos') then
    alter publication supabase_realtime add table public.todos;
  end if;
end $$;
