# Recap

Webbapp (PWA) för att planera renoveringar, inköp och kvitton. React + Vite, data i Supabase, publiceras på GitHub Pages. All text i gränssnittet är på svenska.

## Design

Färger, typsnitt och komponenter följer designsystemet i [docs/designsystem/CLAUDE.md](docs/designsystem/CLAUDE.md) (se även [exempel.html](docs/designsystem/exempel.html)).

- [src/design.css](src/design.css) är designsystemet och ändras inte per vy. Recap-specifika tillägg ligger i [src/app.css](src/app.css), och de använder bara tokens därifrån.
- Undantag från designsystemets layout, beslutat med användaren: ingen processlist. På mobil används en meny längst ner med en plusknapp i mitten; på dator sidomeny och "Lägg till" uppe till höger. Plusknappen/"Lägg till" är vyns enda färgstarka knapp.
- Ikoner: `@tabler/icons-react` (outline). Rum och mappar får ikon och färg från innehållspaletten, aldrig emojis.

## Data

- Hem → rum, mappar, inköp, jobb, idéer, foton. Inköp och jobb kan ligga i en mapp och/eller ett rum.
- Appen är till för att dokumentera hemmet. Navigering: Logg (startsida), Rum, +, Att göra, Mer. Plusknappen öppnar kameran och frågar sen vad bilden är.
- Inköp och jobb visas som en och samma sak ("Att göra"/"Gjort") via [src/screens/tabs/Items.tsx](src/screens/tabs/Items.tsx). Nya saker sparas i `purchases`; `tasks` finns kvar för gamla jobb.
- Databasändringar läggs som nya filer i `supabase/migrations/` som användaren kör i Supabase SQL Editor. Publicera inte kod som kräver en migration förrän användaren har kört den.
- Planritningen: rumsnamn läses med textigenkänning ([src/lib/readplan.ts](src/lib/readplan.ts)), rummen fylls ut i ett rutnät och görs om till former med hörn ([src/lib/plangrid.ts](src/lib/plangrid.ts)). Sparas som `{ v: 2, rooms: { rumId: [hörn] } }` i `projects.floorplan_map`. Användaren justerar genom att dra i hörnen.
- `npm run dev:demo` kör demoläge (data i webbläsaren) även när `.env.local` pekar på Supabase.
