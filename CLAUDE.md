# Recap

Webbapp (PWA) för att planera renoveringar, inköp och kvitton. React + Vite, data i Supabase, publiceras på GitHub Pages. All text i gränssnittet är på svenska.

## Design

Färger, typsnitt och komponenter följer designsystemet i [docs/designsystem/CLAUDE.md](docs/designsystem/CLAUDE.md) (se även [exempel.html](docs/designsystem/exempel.html)).

- CSS i tre lager, inga egna färgvärden utanför det första:
  - [src/theme.css](src/theme.css): alla variabler (färger, glas, accent per läge, typsnitt, storlekar, radier, avstånd, rörelse). Appens känsla ändras här.
  - [src/design.css](src/design.css): grundkomponenterna (glas, knappar, chips, rader, fält, kort).
  - [src/app.css](src/app.css): Recaps egna vyer (skal, paneler, planritning, ekonomi, kvitton).
- Premium glasdesign (beslutat med användaren, november 2026) går före designsystemets färger och typsnitt. Appen är alltid mörk, det finns inget ljust läge. Grunden är #0A0A0C med stora suddiga ljusfläckar (`.mesh` i index.html) bakom allt. Kort, rader och paneler är nästan genomskinligt frostat glas via [src/components/GlassCard.tsx](src/components/GlassCard.tsx) och klassen `.glass`, med kantljus (ljust uppe till vänster, svagt nere till höger). Alla glastokens ligger i theme.css. Typsnitt: Plus Jakarta Sans; stora summor i 800 med vit gradient. Klickbara kort lyfter vid hover, stora kort gör det inte. Text i glas: vit för siffror och rubriker, ljusgrå 70 % för resten.
- Läget (Projekt eller Boende) syns bara i accentfärgen och ljusfläckarnas färg, aldrig i ytorna: Projekt lila/elektrisk blå, Boende smaragdgrön/bärnsten. Accenten lyser bara på Lägg till, aktiva menyval och staplar. Sätts av [src/lib/mode.ts](src/lib/mode.ts) (`data-mode`), med en mjuk övergång när man byter. Sidomenyn ligger direkt på ljuset utan egen ruta; rumsrutorna är glas med rummets färg i ikonen.
- Planritningen görs genomskinlig med SVG-filtret `#plan-ink` i index.html.
- Undantag från designsystemets layout, beslutat med användaren: ingen processlist. På mobil används en meny längst ner med en plusknapp i mitten som öppnar appens Lägg till-meny (inte bildväljaren direkt); på dator ingen sidomeny utan en svävande toppram: hemmet till vänster, ett menypiller i mitten (Översikt, Logg, Inköp, Avtal, Bostads-CV, Mer; markeringen glider med framer-motion `layoutId`) och "Lägg till" till höger. Plusknappen/"Lägg till" är vyns enda färgstarka knapp.
- Rörelse: stora belopp rullar upp med [src/components/Counter.tsx](src/components/Counter.tsx), staplar glider ut från noll, flikar och skärmar tonar in och glider upp 10 px på 0,3 s. Allt respekterar minskad rörelse.
- Ikoner: `@tabler/icons-react` (outline). Rum får ikon och färg från innehållspaletten, aldrig emojis.
- Gränssnittet ska förklara sig självt: inga hjälptexter, inga extra lägg till-knappar i vyerna. All inmatning går via "Lägg till"/plusknappen, utom "Lägg till" under Planerat i ett rum (önskat av användaren).

## Data

- Hem → rum, inköp, jobb, foton, avtal. Navigering: Översikt (startsida), Logg, Inköp, Avtal, Bostads-CV, Mer (Ekonomi, Inställningar, Mina hem). På mobil: Översikt, Logg, +, Inköp, Mer. Plusknappen öppnar kameran och frågar sen vad bilden är.
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
