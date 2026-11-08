-- Kvitton sparas direkt av AI:n. Rader den är osäker på märks för granskning
-- och visas i "Att granska" på Översikt tills man har tittat på dem.
alter table purchases add column if not exists needs_review boolean not null default false;
