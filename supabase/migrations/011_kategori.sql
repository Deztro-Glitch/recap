-- Budgetkategori för köp, som AI:n väljer vid snabb inmatning (t.ex. "Vinglas 699kr" blir home).
-- Tomt = gissas från namnet i appen.
alter table public.purchases add column if not exists category text
  check (category in ('housing', 'loans', 'food', 'transport', 'home', 'fun', 'saving', 'other'));
