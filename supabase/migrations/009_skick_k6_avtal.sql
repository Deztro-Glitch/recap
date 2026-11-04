-- Recap – tillägg 9: rummens skick, typ av K6-avdrag och om ett avtal hör till boendet.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 008). Går att köra flera gånger.

-- 1 = renoveringsbehov, 2 = bruksskick, 3 = nyrenoverat. Används för det estimerade marknadsvärdet.
alter table public.rooms add column if not exists condition smallint not null default 2;
alter table public.rooms drop constraint if exists rooms_condition_check;
alter table public.rooms add constraint rooms_condition_check check (condition between 1 and 3);

-- basic = grundförbättring (alltid avdragsgill), maintenance = förbättrande reparation och underhåll (5-årsregeln).
alter table public.purchases add column if not exists k6_kind text;
alter table public.tasks     add column if not exists k6_kind text;

-- home = boendeavtal som räknas in i månadskostnaden, private = privata abonnemang. Tomt = efter avtalstypen.
alter table public.contracts add column if not exists scope text;
