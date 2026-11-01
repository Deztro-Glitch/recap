# Designsystem — läs innan du bygger något gränssnitt

Alla system i det här projektet följer ett eget designsystem. Det ska se ut som en riktig produkt byggd av ett proffs, inte som ett AI-genererat system. Om du är osäker: välj det som Spotify eller Steam hade gjort, inte det som en mall för en landningssida hade gjort.

- **`design.css`** innehåller alla färger, typsnitt och komponenter. Använd den. Hitta inte på egna värden.
- **`exempel.html`** visar allt i bruk. Titta där innan du bygger en ny vy.
- Använder projektet React, Vue eller liknande: kopiera tokens (sektion 1–2 i `design.css`) som CSS-variabler och bygg komponenterna med samma klassnamn och värden. Använd inte shadcn, Material, Bootstrap eller Tailwinds standardutseende.

---

## Grundprincipen

**Bygg själva systemet, inte en sida om systemet.** Gränssnittet ska nästan försvinna. Innehållet (kunder, kategorier, siffror, bilder) bär färgen och personligheten.

## De åtta reglerna

1. **Appskal, inte landningssida.** Varje system har sidomeny, huvudyta och (vid flöden) processlist längst ner. Innehållet går ut i kanterna. Aldrig ett kort som svävar mitt på sidan.
2. **Innehållet får färgen.** Kategorier och typer får egna färger och ikoner från innehållspaletten (`--c-*`). Gränssnittet i övrigt är lila-tonade neutraler plus en accentfärg.
3. **Förklara ingenting.** Rubriken säger vad vyn är ("Tjänster", "Kunder"). Ingen hjälpsam undertext som "Välj en tjänst nedan. Du kan ändra senare."
4. **Små rubriker.** Sidrubrik 20px, sektionsrubrik 16px, vikt 600. Inga jätterubriker.
5. **Ytor i stället för ramar.** Skilj saker åt med bakgrundsnyanser (`--shell`, `--surface`, `--hover`). Inga kantlinjer runt kort, fält eller knappar.
6. **Färgade neutraler.** Bakgrunderna har lila underton. Aldrig ren grå (#f5f5f5, #e5e7eb osv.).
7. **Täthet med tydlig hierarki.** Visa mycket information, men varje nivå har ett jobb: rubrik, huvudinnehåll, detaljer. Ögat ska ha ett eller två fästen per vy, inte allt samtidigt.
8. **Egna komponenter.** Använd systemets komponenter (rutor, processlist, rader). Hitta inte på generiska kort med ikon, rubrik och text.

## Förbjudet (det här är AI-looken)

- Gradienter, glöd, glasmorfism, oskärpa
- Emojis i gränssnittet
- Liten grå text som står ensam som etikett ("STEG 2 AV 4", "ÖVERSIKT", "NYTT")
- Monospace för etiketter, siffror eller dekoration
- Versaler med extra teckenavstånd, utom i primärknappen
- Stor centrerad rubrik med två knappar under
- Tre kort i rad med ikon, rubrik och beskrivning
- Mjuka stora skuggor och kraftigt rundade hörn (över 8px på komponenter)
- Kantlinjer runt varje kort och fält
- Typsnitten Inter, Roboto, Poppins, Montserrat eller systemets standard
- iOS-lika runda växlare
- Platshållartexter som "Lyft ditt företag", "Lorem ipsum", "John Doe"
- Hjälpsamma undertexter under rubriker
- Mer än en färgstark knapp per vy

## Typografi

| Användning | Stil |
|---|---|
| Sidrubrik | Archivo 20px / 600 |
| Sektionsrubrik | Archivo 16px / 600 |
| Brödtext, rader | Archivo 14px / 400–600 |
| Detaljer under något | Archivo 13px / `--text-2` |
| Minsta storlek | 12.5px |
| Logotyp, namn på rutor, nyckeltal, totalsummor | Archivo Black (klass `.display`) |

- **Archivo Black används sparsamt.** Bara för logotyp, rutornas namn, nyckeltal och totalsummor. Aldrig för vanliga rubriker eller brödtext.
- Siffror använder tabellsiffror (är redan påslaget i `body`). Högerjustera belopp i tabeller.
- `--text-2` (grå) får **bara** användas för detaljer som hör till något större, till exempel adressen under ett kundnamn. Aldrig för etiketter, rubriker eller instruktioner som står ensamma.

## Färger

- **`--accent`** är den enda färgen som betyder "framåt, aktivt, valt". Används på primärknapp, aktiva steg, valda rutor och fokus. Inget annat.
- **Kundfärg:** när ett system byggs åt en kund, byt bara `--accent` (och vid behov `--on-accent`) till kundens färg från deras grafiska profil. Allt annat följer automatiskt.
- **Innehållspaletten** (`--c-sand`, `--c-coral`, `--c-steel`, `--c-sun`, `--c-mint`, `--c-sky`, `--c-lilac`, `--c-rose`) används för kategorier. Använd alltid paret `-bg` och `-fg` tillsammans. Samma kategori har alltid samma färg i hela systemet.
- **Status** (`--success`, `--warning`, `--danger`) används bara för just status.
- **Ljust läge är standard.** Mörkt läge aktiveras med `data-theme="dark"` på `<html>`. Testa båda.

## Layout

```
┌──────────┬────────────────────────────────────┐
│ Sidomeny │ Huvudyta (--surface)               │
│ (--shell)│  sökfält + avatar                  │
│          │  rubrik + filterchips              │
│          │  innehåll                          │
├──────────┴────────────────────────────────────┤
│ Processlist: kontext | ‹ steg › | summa | knapp│
└───────────────────────────────────────────────┘
```

- Använd `.app`, `.sidebar`, `.main`, `.processbar` från `design.css`.
- Vyer utan flöde använder `.app--no-process` och ingen processlist.
- Avstånd: 4, 8, 12, 16, 24, 32px (`--s-1` till `--s-6`). Inga andra värden.
- Vänsterjustera allt. Centrera bara ikoner i knappar.

## Signaturen: processlisten

Varje flöde med flera steg (offert, bokning, registrering, beställning) använder processlisten längst ner. Den är systemets kännetecken.

- **Vänster:** vem eller vad flödet gäller (kundnamn + offertnummer)
- **Mitten:** bakåtpil, stegen som förloppsindikator, framåtpil. Varje steg är klickbart.
- **Höger:** det viktigaste talet (t.ex. totalsumma i Archivo Black) och primärknappen
- Den är alltid synlig under hela flödet. Steg visas aldrig som text i stil med "Steg 2 av 4".

## Komponenter

| Behov | Klass |
|---|---|
| Primär handling (en per vy) | `.btn.btn--primary` med `<span class="ripple">` |
| Övriga knappar | `.btn.btn--secondary`, `.btn.btn--ghost`, `.btn.btn--danger` |
| Välja bland kategorier | `.tiles` + `.tile` med `--tile-bg`/`--tile-fg`, ikon eller bild |
| Listor (kunder, poster) | `.rows` + `.row` |
| Tabeller | `.table` |
| Filtrera | `.chips` + `.chip` |
| Textfält, väljare | `.field` + `.input`/`.select`/`.textarea` |
| Kryssruta | `.checkbox` (fylls från båda sidor, bocken ritas) |
| Av/på | `.switch` (kantig, inte iOS) |
| Bekräftelse | `.toast` |
| Laddning | `.loader` (pulslinje) |
| Status | `.status.status--draft/sent/won/warning/lost` |
| Nyckeltal | `.kpis` + `.kpi` |
| Tom lista | `.empty` med en rubrik och en knapp |

Ikoner: Tabler Icons, outline-varianten. Ladda via `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css`.

Bilder: rutor (`.tile`) kan ha en bild med `.tile__img` i stället för ikon. Använd riktiga foton när de finns, aldrig stockbilder med folk som skakar hand.

## Rörelse

- Lugnt och mjukt. Saker glider och ritas fram, de hoppar inte.
- Använd `--ease` och `--t-fast` (300ms) eller `--t-base` (500ms).
- Animationer startar vid interaktion (hover, klick, val), aldrig hela tiden i bakgrunden. Undantag: laddningsindikatorn.
- Respektera `prefers-reduced-motion` (redan inbyggt).

## Text och ton

- Kort och sakligt. Säg vad som hänt eller vad knappen gör.
- Knappar: verb först, 1–3 ord. "Skicka offert", "Lägg till kund". Inte "OK" eller "Klicka här".
- Bekräftelser: vad som hände, utan utropstecken. "Offerten är skickad", inte "Klart! Din offert har skickats!"
- Fel: vad som hänt och vad man ska göra. "Mejladressen saknar @. Kontrollera den."
- Stor bokstav bara först i meningen och i namn.
- Använd realistiska svenska exempeldata (företagsnamn, orter, belopp i kr), aldrig engelska platshållare.

## Checklista innan en vy är klar

- [ ] Ligger vyn i appskalet, inte i ett svävande kort?
- [ ] Finns det bara en färgstark knapp?
- [ ] Har rubrikerna rätt storlek, utan undertext som förklarar?
- [ ] Finns det kantlinjer som kan ersättas av en bakgrundsnyans?
- [ ] Används grå text bara för detaljer under något annat?
- [ ] Har kategorierna egna färger från innehållspaletten?
- [ ] Fungerar vyn i både ljust och mörkt läge?
- [ ] Fungerar den på mobil?
- [ ] Finns något på förbudslistan med? Ta bort det.
