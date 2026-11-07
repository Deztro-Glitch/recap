# Recap

Webbapp (PWA) för att planera renoveringar, inköp och kvitton. React + Vite, data i Supabase, publiceras på GitHub Pages. All text i gränssnittet är på svenska.

## Design

Färger, typsnitt och komponenter följer designsystemet i [docs/designsystem/CLAUDE.md](docs/designsystem/CLAUDE.md) (se även [exempel.html](docs/designsystem/exempel.html)).

- [src/design.css](src/design.css) är grunden. Recap-specifika tillägg och avsteg ligger i [src/app.css](src/app.css) och använder tokens.
- Glasdesign (beslutat med användaren, november 2026): mörkt är standard (ljust bara om man väljer det, sparas som `recap-look`). Bakom allt ligger ett gradientljus (`body::before`) och huvudytan är nästan genomskinlig. Kort, rader, paneler och formulärpaneler är frostat glas via [src/components/GlassCard.tsx](src/components/GlassCard.tsx) och klassen `.glass`; färgerna ligger som tokens (`--glass-*`, `--field-glass`, `--sheet-bg`) i app.css. Klickbara kort lyfter vid hover, stora kort gör det inte. Text i glas: vit för siffror och rubriker, ljusgrå 70 % för resten.
- Läget färgar hela appen (beslutat med användaren): Projekt (bygga) har designsystemets lila färger, Boende (inreda och bo) har varma espresso/dimgröna färger. Tokens skrivs över under `:root[data-mode="home"]` i app.css och sätts av [src/lib/mode.ts](src/lib/mode.ts), med en 400 ms övergång bara när man byter.
- Undantag från designsystemets layout, beslutat med användaren: ingen processlist. På mobil används en meny längst ner med en plusknapp i mitten som öppnar appens Lägg till-meny (inte bildväljaren direkt); på dator sidomeny och "Lägg till" uppe till höger. Plusknappen/"Lägg till" är vyns enda färgstarka knapp.
- Ikoner: `@tabler/icons-react` (outline). Rum får ikon och färg från innehållspaletten, aldrig emojis.
- Gränssnittet ska förklara sig självt: inga hjälptexter, inga extra lägg till-knappar i vyerna. All inmatning går via "Lägg till"/plusknappen, utom "Lägg till" under Planerat i ett rum (önskat av användaren).

## Data

- Hem → rum, inköp, jobb, foton, avtal. Navigering: Översikt (startsida), Logg, Inköp, Avtal och dokument, Inställningar. På mobil: Översikt, Logg, +, Inköp, Mer. Plusknappen öppnar kameran och frågar sen vad bilden är.
- Läget sparas i `projects.mode`: `full` = Projekt, `simple` = Boende. Inköp och Översikt visar bara det som hör till läget: `purchases.scope` är `build` eller `home` (tomt = gissas från namnet, jobb är alltid bygge). Avtal, Bostads-CV och Ekonomi ligger under Mer.
- Ekonomin (bolån och fasta utgifter) sparas i `projects.economy` och räknas i [src/lib/economy.ts](src/lib/economy.ts): skulden i dag = lån − amortering × hela månader sedan start. Boendeläget visar den i stället för Spenderat/Planerat. Dagens spotpris för valt elområde hämtas från elprisetjustnu.se ([src/lib/elpris.ts](src/lib/elpris.ts)).
- Inköp och jobb visas som en och samma sak ("Planerat"/"Klart") via [src/screens/tabs/Items.tsx](src/screens/tabs/Items.tsx). Nya saker sparas i `purchases`; `tasks` finns kvar för gamla jobb. Märkning: `stays` (följer med lägenheten) och `k6` (värdehöjande förbättring).
- Kvitton med flera rader: `receipts` är förälder (bild, butik, datum, summa) och raderna är vanliga `purchases` med `receipt_id` (migration 008). Ett fotat kvitto granskas i [src/screens/tabs/ReceiptReview.tsx](src/screens/tabs/ReceiptReview.tsx). Läsningen sker i [src/lib/receiptReader.ts](src/lib/receiptReader.ts): `readReceipt` skickar bilden till Edge Function [supabase/functions/parse-receipt](supabase/functions/parse-receipt/index.ts) (OpenAI gpt-4o-mini) och faller tillbaka på textigenkänning på enheten om den inte svarar. Formatet är `ReceiptScan`. OpenAI-nyckeln finns bara som Supabase-hemligheten `OPENAI_API_KEY`, aldrig i appen eller i repot.
- Marknadsvärdet räknas i [src/lib/valuation.ts](src/lib/valuation.ts) från inköpspris, boarea och områdets kvm-priser i `economy`, och rummens skick (`rooms.condition` 1–3, kök och våtrum väger 30 % vardera). K6 läggs aldrig ovanpå värdet. Ingen påhittad data.
- K6 för bostadsrätt i [src/lib/k6.ts](src/lib/k6.ts): `k6_kind` är `basic` (grundförbättring, alltid) eller `maintenance` (underhåll/ytskikt, försäljningsåret och fem år före). Minst 5 000 kr per år och typ. Vinstskatt 22 %.
- Fasta kostnader i Boende kommer från avtal som räknas som boendeavtal (`contracts.scope`, tomt = efter typ), inte från Ekonomi. Bolånet räknas via räntan i Ekonomi.
- Mappar och idéer finns inte längre i gränssnittet. Idéer flyttades till planerade inköp med `image_path` (migration 005); `folders` och `folder_id` ligger kvar i databasen.
- Databasändringar läggs som nya filer i `supabase/migrations/` som användaren kör i Supabase SQL Editor. Publicera inte kod som kräver en migration förrän användaren har kört den.
- Planritningen: rumsnamn läses med textigenkänning ([src/lib/readplan.ts](src/lib/readplan.ts)), rummen fylls ut i ett rutnät och görs om till former med hörn ([src/lib/plangrid.ts](src/lib/plangrid.ts)). Sparas som `{ v: 2, rooms: { rumId: [hörn] } }` i `projects.floorplan_map`. Användaren justerar genom att dra i hörnen.
- `npm run dev:demo` kör demoläge (data i webbläsaren) även när `.env.local` pekar på Supabase.
