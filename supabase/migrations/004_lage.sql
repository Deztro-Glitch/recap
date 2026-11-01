-- Recap – tillägg 4: hur mycket man ska göra i ett hem.
-- 'simple' = inköp och kvitton (mappar och jobb döljs), 'full' = renovering med allt.
-- Kör i Supabase → SQL Editor → New query → Run. Går att köra flera gånger.

alter table public.projects add column if not exists mode text not null default 'full';
