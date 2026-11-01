# Recap

Webbapp (PWA) för att planera renoveringar och inköp. React + Vite, data i Supabase, publiceras på GitHub Pages. All text i gränssnittet är på svenska.

## Design

Följ designsystemet i [docs/designsystem/CLAUDE.md](docs/designsystem/CLAUDE.md) och se [docs/designsystem/exempel.html](docs/designsystem/exempel.html).

- [src/design.css](src/design.css) är designsystemet och ändras inte per vy. Recap-specifika tillägg ligger i [src/app.css](src/app.css), och de använder bara tokens därifrån.
- Ikoner: `@tabler/icons-react` (outline). Rum får ikon och färg från innehållspaletten, aldrig emojis.
- En primärknapp per vy. I ett hem ligger den i processlisten längst ner.
