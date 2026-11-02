# Recap

Webbapp (PWA) för att planera renoveringar, inköp och kvitton. React + Vite, data i Supabase, publiceras på GitHub Pages. All text i gränssnittet är på svenska.

## Design

Färger, typsnitt och komponenter följer designsystemet i [docs/designsystem/CLAUDE.md](docs/designsystem/CLAUDE.md) (se även [exempel.html](docs/designsystem/exempel.html)).

- [src/design.css](src/design.css) är designsystemet och ändras inte per vy. Recap-specifika tillägg ligger i [src/app.css](src/app.css), och de använder bara tokens därifrån.
- Undantag från designsystemets layout, beslutat med användaren: ingen processlist. På mobil används en meny längst ner med en plusknapp i mitten; på dator sidomeny och "Lägg till" uppe till höger. Plusknappen/"Lägg till" är vyns enda färgstarka knapp.
- Ikoner: `@tabler/icons-react` (outline). Rum får ikon och färg från innehållspaletten, aldrig emojis.
- Gränssnittet ska förklara sig självt: inga hjälptexter, inga extra lägg till-knappar i vyerna. All inmatning går via "Lägg till"/plusknappen.

## Data

- Hem → rum, inköp, jobb, foton, avtal. Navigering: Översikt (startsida), Logg, Inköp, Avtal och dokument, Inställningar. På mobil: Översikt, Logg, +, Inköp, Mer. Plusknappen öppnar kameran och frågar sen vad bilden är.
- Översikten har två lägen i `projects.mode`: `full` = Projektläge (Spenderat/Planerat), `simple` = Boendeläge (fast månadskostnad/investerat).
- Inköp och jobb visas som en och samma sak ("Planerat"/"Klart") via [src/screens/tabs/Items.tsx](src/screens/tabs/Items.tsx). Nya saker sparas i `purchases`; `tasks` finns kvar för gamla jobb. Märkning: `stays` (följer med lägenheten) och `k6` (värdehöjande förbättring).
- Mappar och idéer finns inte längre i gränssnittet. Idéer flyttades till planerade inköp med `image_path` (migration 005); `folders` och `folder_id` ligger kvar i databasen.
- Databasändringar läggs som nya filer i `supabase/migrations/` som användaren kör i Supabase SQL Editor. Publicera inte kod som kräver en migration förrän användaren har kört den.
- Planritningen: rumsnamn läses med textigenkänning ([src/lib/readplan.ts](src/lib/readplan.ts)), rummen fylls ut i ett rutnät och görs om till former med hörn ([src/lib/plangrid.ts](src/lib/plangrid.ts)). Sparas som `{ v: 2, rooms: { rumId: [hörn] } }` i `projects.floorplan_map`. Användaren justerar genom att dra i hörnen.
- `npm run dev:demo` kör demoläge (data i webbläsaren) även när `.env.local` pekar på Supabase.
