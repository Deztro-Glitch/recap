-- Recap – databasschema för Supabase.
-- Kör hela filen i Supabase → SQL Editor → New query → Run.

-- ---------- Tabeller ----------

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'lagenhet' check (kind in ('lagenhet', 'hus', 'annat')),
  address     text,
  budget      numeric not null default 0,
  created_by  uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.project_members (
  project_id  uuid not null references public.projects on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  email       text,
  role        text not null default 'editor' check (role in ('owner', 'editor')),
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  name        text not null,
  icon        text not null default 'home',     -- se ROOM_ICONS i src/components/icons.tsx
  color       text not null default 'lilac',    -- innehållspaletten i src/design.css
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.purchases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  room_id     uuid references public.rooms on delete set null,
  title       text not null,
  est_price   numeric not null default 0,   -- uppskattat pris
  price       numeric,                      -- faktiskt pris när köpt
  bought      boolean not null default false,
  store       text,
  link        text,
  note        text,
  created_at  timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  room_id     uuid references public.rooms on delete set null,
  title       text not null,
  phase       int not null default 0,       -- se PHASES i src/types.ts
  status      text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  cost        numeric not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);

create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  room_id     uuid references public.rooms on delete set null,
  kind        text not null default 'before' check (kind in ('before', 'after', 'inspo')),
  path        text not null,                -- sökväg i storage-bucketen "photos"
  created_at  timestamptz not null default now()
);

-- ---------- Hjälpfunktioner ----------

create or replace function public.is_member(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid());
$$;

create or replace function public.is_owner(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid() and role = 'owner');
$$;

-- Den som skapar ett projekt blir automatiskt ägare.
create or replace function public.add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, user_id, email, role)
  values (new.id, new.created_by, (select email from auth.users where id = new.created_by), 'owner');
  return new;
end $$;

create trigger projects_add_owner after insert on public.projects
for each row execute function public.add_owner();

-- Bjud in en befintlig användare (som du skapat i Supabase) till ett projekt via e-post.
create or replace function public.invite_member(pid uuid, member_email text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_member(pid) then raise exception 'Du är inte med i det här projektet'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(member_email));
  if uid is null then return 'not_found'; end if;
  insert into project_members (project_id, user_id, email, role)
  values (pid, uid, lower(trim(member_email)), 'editor')
  on conflict do nothing;
  return 'ok';
end $$;

-- ---------- Rättigheter (Row Level Security) ----------

alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.rooms           enable row level security;
alter table public.purchases       enable row level security;
alter table public.tasks           enable row level security;
alter table public.photos          enable row level security;

create policy "läs egna projekt"   on public.projects for select using (is_member(id) or created_by = auth.uid());
create policy "skapa projekt"      on public.projects for insert with check (created_by = auth.uid());
create policy "ändra projekt"      on public.projects for update using (is_member(id));
create policy "ta bort projekt"    on public.projects for delete using (is_owner(id));

create policy "se medlemmar"       on public.project_members for select using (is_member(project_id));
create policy "ta bort medlem"     on public.project_members for delete
  using (is_owner(project_id) or user_id = auth.uid());

create policy "rum"      on public.rooms     for all using (is_member(project_id)) with check (is_member(project_id));
create policy "inköp"    on public.purchases for all using (is_member(project_id)) with check (is_member(project_id));
create policy "uppgifter" on public.tasks    for all using (is_member(project_id)) with check (is_member(project_id));
create policy "foton"    on public.photos    for all using (is_member(project_id)) with check (is_member(project_id));

-- ---------- Åtkomst för inloggade ----------
-- Bara inloggade användare når tabellerna (raderna begränsas av policyerna ovan).
-- Utloggade (anon) får ingenting.

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.projects, public.project_members, public.rooms, public.purchases, public.tasks, public.photos
  to authenticated;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.invite_member(uuid, text) to authenticated;
revoke execute on function public.invite_member(uuid, text) from anon, public;

-- ---------- Bildlagring ----------
-- Filer sparas som "<projekt-id>/<filnamn>" i en privat bucket.

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "foton läs"    on storage.objects for select
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "foton ladda upp" on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "foton ta bort" on storage.objects for delete
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ---------- Realtid ----------
-- Så att ändringar syns direkt hos alla som delar ett projekt.

alter publication supabase_realtime add table public.rooms, public.purchases, public.tasks, public.photos, public.projects;
