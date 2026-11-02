-- Recap – tillägg 6: om ett inköp hör till bygget (Projekt) eller till inredningen (Boende).
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 005). Går att köra flera gånger.
-- Tomt betyder att appen gissar utifrån namnet; jobb räknas alltid som bygge.

alter table public.purchases add column if not exists scope text check (scope in ('build', 'home'));
