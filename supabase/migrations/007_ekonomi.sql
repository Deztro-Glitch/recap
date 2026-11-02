-- Recap – tillägg 7: hemmets ekonomi (bolån och fasta utgifter) för Boendeläget.
-- Kör hela filen i Supabase → SQL Editor → New query → Run (efter 006). Går att köra flera gånger.
-- Sparas som {"loan": 3000000, "rate": 3.9, "amortization": 5000, "loanStart": "2026-09-01", "fee": 4200, "electricity": 600, "insurance": 180}.

alter table public.projects add column if not exists economy jsonb;
