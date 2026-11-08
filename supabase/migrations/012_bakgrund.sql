-- Egen bakgrundsbild för hemmet (Inställningar). Visas bakom glaset i Boende.
-- Bilden ligger i lagringen "photos" som andra filer; här sparas bara sökvägen.
alter table public.projects add column if not exists background_path text;
