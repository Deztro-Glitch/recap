// Recap – läser ett fotat kvitto med OpenAI (gpt-4o-mini) och lämnar tillbaka raderna som JSON.
// Nyckeln ligger som hemlighet OPENAI_API_KEY i Supabase, aldrig i appen.
// Anropas från appen med supabase.functions.invoke('parse-receipt', { body: { image, rooms } }),
// där image är en data-URL (jpeg) och rooms är hemmets rumsnamn. Kräver inloggad användare.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Exakt det format appen förväntar sig (ReceiptScan i src/lib/receiptReader.ts, med rummen som namn).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['store', 'date', 'total', 'lines', 'ignored'],
  properties: {
    store: { type: ['string', 'null'], description: 'Butikens namn, t.ex. Bauhaus' },
    date: { type: ['string', 'null'], description: 'Köpdatum som YYYY-MM-DD' },
    total: { type: ['number', 'null'], description: 'Totalsumman att betala i kronor' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'price', 'room', 'scope'],
        properties: {
          title: { type: 'string', description: 'Varans namn, läsbart på svenska' },
          price: { type: 'number', description: 'Radens pris i kronor efter rabatt, för hela antalet' },
          room: { type: ['string', 'null'], description: 'Ett av rummen i listan, eller null' },
          scope: { type: 'string', enum: ['build', 'home'] },
        },
      },
    },
    ignored: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'price'],
        properties: { title: { type: 'string' }, price: { type: 'number' } },
      },
    },
  },
}

const instructions = (rooms: string[]) => `Du läser kvitton åt en svensk app där man dokumenterar sitt hem: renoveringar och inredning.
Läs kvittot på bilden och fyll i JSON enligt schemat.

- store: butikens namn. date: köpdatum som YYYY-MM-DD. total: summan att betala.
- lines: varje vara som hör till hemmet. Skriv namnet läsbart (skriv ut förkortningar, t.ex. "VÄGGF ALCRO 3L" blir "Väggfärg Alcro 3 l").
  Slå ihop antal och rabatt till ett pris för raden. Ta inte med summor, moms, pant, betalning eller växel.
- scope: "build" för renovering och bygge (färg, spackel, kakel, golv, skruv, verktyg, byggmaterial, el och VVS),
  "home" för inredning och boende (möbler, textilier, köksredskap, belysning, vitvaror, förvaring, dekoration).
- room: välj det rum raden troligast hör till bland dessa: ${rooms.length ? rooms.join(', ') : '(inga rum)'}. Annars null.
  Byggmaterial som inte tydligt hör till ett rum får null.
- ignored: varor som inte hör till hemmet, t.ex. godis, snacks, dricka, mat, tidningar, kassar och påsar.
Hittar du ingenting, lämna listorna tomma. Gissa aldrig fram varor som inte står på kvittot.`

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

  let image: string, rooms: string[]
  try {
    const body = await req.json()
    image = String(body.image ?? '')
    rooms = Array.isArray(body.rooms) ? body.rooms.map(String).slice(0, 50) : []
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
      response_format: { type: 'json_schema', json_schema: { name: 'receipt', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: instructions(rooms) },
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
