# Recap

Planera renoveringar, inköp och budget för din lägenhet eller ditt hus. Appen är en webbapp (PWA) som du lägger på hemskärmen i iPhone.

- **Koden** ligger på GitHub och publiceras gratis via GitHub Pages
- **Data, bilder och konton** ligger i Supabase (gratis)

Utan Supabase-nycklar körs appen i **demoläge**, där allt sparas i webbläsaren.

## Köra lokalt

```bash
npm install
npm run dev
```

## Sätta upp Supabase (en gång)

1. Skapa ett projekt på [supabase.com](https://supabase.com) (region: Stockholm/EU).
2. **SQL Editor → New query**: klistra in hela [supabase/schema.sql](supabase/schema.sql) och tryck **Run**.
3. **Authentication → Sign In / Providers → Email**: stäng av **Allow new users to sign up**, så att bara du kan skapa konton.
4. **Project Settings → API**: kopiera *Project URL* och *anon public key*.
5. Lokalt: kopiera `.env.example` till `.env.local` och fyll i värdena.

### Skapa konton åt vänner

**Authentication → Users → Add user → Create new user**: fyll i deras e-post och ett lösenord och kryssa i *Auto Confirm User*. Skicka sedan länken till appen plus inloggningen.

För att dela en lägenhet: öppna hemmet → ⚙️ → *Delas med*, och skriv in personens e-post.

## Publicera på GitHub Pages

1. Skapa ett repo på GitHub och pusha koden till `main`.
2. **Settings → Secrets and variables → Actions**: lägg till `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY`.
3. **Settings → Pages → Source**: välj **GitHub Actions**.
4. Efter varje push hamnar appen på `https://<användarnamn>.github.io/<repo>/`.
5. I Supabase, **Authentication → URL Configuration**: sätt *Site URL* till den adressen.

## Lägga på hemskärmen (iPhone)

Öppna adressen i **Safari** → dela-knappen → **Lägg till på hemskärmen**.
