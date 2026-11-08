// Recap – läser en bild med OpenAI (gpt-4o-mini): avgör om det är ett kvitto, ett foto av ett rum, en sak man vill köpa
// eller en vitvara/typskylt, och läser kvittots rader med rum, renovering/vardag, kategori, K6, om varan håller länge
// (för reklamationsrätten) och om AI:n är säker. Från en typskylt kommer vitvaran och dess vanliga underhåll.
// Nyckeln ligger som hemlighet OPENAI_API_KEY i Supabase, aldrig i appen.
// Anropas från appen med supabase.functions.invoke('parse-receipt', { body: { image, rooms, planned, hint } }),
// där image är en data-URL (jpeg), rooms är hemmets rumsnamn, planned är planerade köp
// ({ id, title, price, room }) och hint är "receipt" när man har valt Skanna kvitto. Kräver inloggad användare.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const CATEGORIES = ['housing', 'food', 'transport', 'home', 'fun', 'saving', 'other']

// Exakt det format appen förväntar sig (se readWithAi i src/lib/receiptReader.ts, med rummen som namn).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'room', 'title', 'price', 'store', 'date', 'total', 'lines', 'appliance'],
  properties: {
    kind: { type: 'string', enum: ['receipt', 'room', 'product', 'appliance', 'other'], description: 'Vad bilden är' },
    room: { type: ['string', 'null'], description: 'Foto av ett rum eller en sak: ett av rummen i listan, eller null' },
    title: { type: ['string', 'null'], description: 'Sak man vill köpa: vad det är, t.ex. "Soffa Söderhamn". Annars null' },
    price: { type: ['number', 'null'], description: 'Sak man vill köpa: priset om det syns, annars null' },
    store: { type: ['string', 'null'], description: 'Kvitto: butikens namn, t.ex. ICA Maxi' },
    date: { type: ['string', 'null'], description: 'Kvitto: köpdatum som YYYY-MM-DD' },
    total: { type: ['number', 'null'], description: 'Kvitto: totalsumman att betala i kronor' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'price', 'room', 'scope', 'category', 'match', 'k6', 'durable', 'sure'],
        properties: {
          title: { type: 'string', description: 'Varans namn, läsbart på svenska' },
          price: { type: 'number', description: 'Radens pris i kronor efter rabatt, för hela antalet' },
          room: { type: ['string', 'null'], description: 'Ett av rummen i listan, eller null' },
          scope: { type: 'string', enum: ['build', 'home'] },
          category: { type: 'string', enum: CATEGORIES },
          match: { type: ['string', 'null'], description: 'id på det planerade köp raden är, eller null' },
          k6: { type: ['string', 'null'], enum: ['basic', 'maintenance', null], description: 'Typ av K6-avdrag, eller null' },
          durable: { type: 'boolean', description: 'true för varor som håller länge: vitvaror, elektronik, möbler, verktyg, lampor' },
          sure: { type: 'boolean', description: 'true om du är säker på namn, pris, kategori, renovering/vardag, rum och K6' },
        },
      },
    },
    appliance: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'model', 'room', 'care'],
          properties: {
            name: { type: 'string', description: 'Vad det är, t.ex. Diskmaskin' },
            model: { type: ['string', 'null'], description: 'Märke och modell från typskylten, t.ex. Bosch SMS4HVI33E' },
            room: { type: ['string', 'null'], description: 'Ett av rummen i listan, eller null' },
            care: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'every_days'],
                properties: {
                  name: { type: 'string', description: 'Underhållet, t.ex. Rengöra diskmaskinens filter' },
                  every_days: { type: 'integer', description: 'Hur ofta, i dagar' },
                },
              },
            },
          },
        },
        { type: 'null' },
      ],
    },
  },
}

interface Planned { id: string; title: string; price: number; room: string | null }

const instructions = (rooms: string[], planned: Planned[], hint: string | null) => `Du hjälper en svensk app för privatekonomi och hemmet: vardagsköp, inredning och renoveringar.
Användaren fotar och vill sedan gå vidare med sin dag. Du ska sortera allt själv. Fyll i JSON enligt schemat.

1. kind: vad bilden är.
   "receipt" = ett kvitto eller en faktura. "room" = ett foto av ett rum eller en del av hemmet (före/efter, en vägg, ett golv).
   "product" = en sak man vill köpa (produktbild, skärmdump från en butik, en möbel i en butik).
   "appliance" = en vitvara eller maskin som redan finns i hemmet, eller dess typskylt (diskmaskin, tvättmaskin, kyl,
   frys, köksfläkt, ugn, torktumlare, varmvattenberedare). "other" = inget av dem.
   ${hint === 'receipt' ? 'Användaren har sagt att det är ett kvitto, så välj "receipt" om det går att läsa något alls.' : ''}
2. Foto av rum eller sak: room = det rum det troligast är bland rummen nedan, annars null. Sak: title och price om det syns.
   För kvitton och "other": room, title och price är null.
   Vitvara: appliance = vad det är, märke och modell om typskylten syns, rummet, och det vanliga underhållet för just den
   sortens maskin med rimliga intervall (t.ex. diskmaskin: rengöra filtret var 30:e dag; köksfläkt: byta eller diska filtret
   var 90:e dag; tvättmaskin: rengöra luddfilter och fack var 60:e dag; frys: frosta av var 180:e dag). Högst fyra.
   För allt annat än vitvaror är appliance null.
3. Kvitto: store, date (YYYY-MM-DD) och total. lines = varje vara, även mat, godis och dricka.
   Skriv namnet läsbart (skriv ut förkortningar, "VÄGGF ALCRO 3L" blir "Väggfärg Alcro 3 l"). Slå ihop antal och rabatt till ett pris.
   Ta inte med summor, moms, pant, kassar, påsar, avrundning, betalning eller växel. Är det inget kvitto, lämna lines tom.
   - category: food = mat och dagligvaror, godis, dricka, restaurang och kaffe; transport = bensin, laddning, biljetter,
     parkering, bil och MC; home = allt till hemmet (inredning, möbler, husgeråd, städ, textilier, belysning, växter,
     verktyg, färg och byggmaterial); fun = nöje, fritid, kläder, hobby, gym, resor; housing = boendekostnader
     (avgift, el, vatten, bredband, hemförsäkring); saving = sparande; other = allt annat (apotek, hygien, presenter …).
   - scope: "build" för renovering och bygge (färg, spackel, kakel, golv, skruv, verktyg, byggmaterial, el och VVS,
     hantverkare). "home" för allt annat, även mat och vardag.
   - room: bara för saker till hemmet (category home): det rum raden troligast hör till bland dessa:
     ${rooms.length ? rooms.join(', ') : '(inga rum)'}. Mat och förbrukning får null. Byggmaterial som inte tydligt hör till ett rum får null.
   - k6: avdrag vid försäljning av bostadsrätt (blankett K6). "basic" för grundförbättring: något nytt som inte fanns
     eller ombyggnad (ny köksinredning, nytt badrum, ny fast installation, nya innerdörrar). "maintenance" för
     förbättrande reparation och underhåll av ytskikt och fast inredning (väggfärg, tapet, golv, kakel, fogmassa).
     null för lösöre och förbrukning (möbler, textilier, husgeråd, verktyg, städ, mat, belysning som inte är fast).
   - match: om raden är samma sak som ett av de planerade köpen nedan, skriv dess id. Produktnamn räknas, t.ex. är
     "ÄPPLARYD 3-sits" en soffa och passar "Soffa". Varje planerat köp får matchas mot högst en rad. Osäker: null.
   - sure: false om du är osäker på något av ovan för raden: svårläst namn eller pris, oklart om det är Projekt eller
     Boende, oklart rum för en sak till hemmet, oklart K6 eller en möjlig men osäker koppling till ett planerat köp.
     Vanliga matvaror och tydliga saker är true. Hellre false än en gissning som kan bli fel.
   - durable: true för varor som håller länge och omfattas av reklamationsrätten på riktigt: vitvaror, elektronik,
     möbler, verktyg och maskiner, lampor. false för mat, förbrukning, färg och byggmaterial, kläder och småsaker.
Planerade köp: ${planned.length ? planned.map((p) => `${p.id}: ${p.title}${p.price ? `, ca ${p.price} kr` : ''}${p.room ? `, ${p.room}` : ''}`).join('; ') : '(inga)'}
Gissa aldrig fram varor som inte står på kvittot.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Använd POST' }, 405)

  // Bara inloggade användare, inte vem som helst med appens publika nyckel.
  const user = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  })
  if (!user.ok) return json({ error: 'Logga in först' }, 401)

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ error: 'OPENAI_API_KEY saknas i Supabase' }, 500)

  let image: string, rooms: string[], planned: Planned[], hint: string | null
  try {
    const body = await req.json()
    image = String(body.image ?? '')
    rooms = Array.isArray(body.rooms) ? body.rooms.map(String).slice(0, 50) : []
    planned = Array.isArray(body.planned)
      ? body.planned.slice(0, 100).map((p: any) => ({ id: String(p.id), title: String(p.title).slice(0, 120), price: Number(p.price) || 0, room: p.room ? String(p.room) : null }))
      : []
    hint = body.hint === 'receipt' ? 'receipt' : null
  } catch {
    return json({ error: 'Ogiltig förfrågan' }, 400)
  }
  if (!image.startsWith('data:image/')) return json({ error: 'Bilden saknas' }, 400)
  if (image.length > 8_000_000) return json({ error: 'Bilden är för stor' }, 413)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'image', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: instructions(rooms, planned, hint) },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: image, detail: 'high' } }] },
      ],
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    console.error('OpenAI svarade', res.status, detail)
    return json({ error: `OpenAI svarade ${res.status}` }, 502)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  try {
    return json(JSON.parse(content))
  } catch {
    return json({ error: 'Svaret gick inte att läsa' }, 502)
  }
})
