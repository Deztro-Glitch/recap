-- Recap – tillägg 16: påminnelser i telefonen (Web Push).
-- En rad per telefon eller dator som har slagit på påminnelser för ett hem. Funktionen send-reminders
-- läser raderna varje morgon och skickar det som är dags (underhåll, garantier, kvitton att granska).
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 015). Går att köra flera gånger.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  project_id  uuid not null references public.projects on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "egna paminnelser" on public.push_subscriptions;
create policy "egna paminnelser" on public.push_subscriptions for all
  using (user_id = auth.uid() and is_member(project_id))
  with check (user_id = auth.uid() and is_member(project_id));
grant select, insert, update, delete on public.push_subscriptions to authenticated;
