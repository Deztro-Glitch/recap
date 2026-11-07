// Recap – tolkar en snabb inmatning som "Vinglas 699kr" med OpenAI (gpt-4o-mini): namn, belopp,
// budgetkategori och om köpet hör till boendet eller ett renoveringsprojekt.
// Nyckeln ligger som hemlighet OPENAI_API_KEY i Supabase, aldrig i appen.
// Anropas från appen med supabase.functions.invoke('quick-entry', { body: { text } }). Kräver inloggad användare.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Samma format som QuickEntry i src/lib/budget.ts.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'amount', 'category', 'scope'],
  properties: {
    title: { type: 'string', description: 'Vad som köptes, kort och läsbart på svenska, utan beloppet' },
    amount: { type: ['number', 'null'], description: 'Beloppet i kronor, eller null om inget belopp står' },
    category: { type: 'string', enum: ['housing', 'food', 'transport', 'home', 'fun', 'saving', 'other'] },
    scope: { type: 'string', enum: ['home', 'build'] },
  },
}

const INSTRUCTIONS = `Du tolkar korta inmatningar av köp i en svensk app för privatekonomi och boende, t.ex. "Vinglas 699kr" eller "ica 1250".
Fyll i JSON enligt schemat.

- title: vad som köptes, kort med stor bokstav först (t.ex. "Vinglas", "ICA Maxi"). Ta inte med beloppet.
- amount: beloppet i kronor. "1 250,50", "1250:-" och "1,2k" är belopp. null om inget belopp står.
- category, välj den som passar bäst:
  housing = boendekostnader (hyra, avgift, el, vatten, bredband, hemförsäkring),
  food = mat och dagligvaror (ICA, Coop, Willys, Lidl), restaurang, lunch, kaffe, take away,
  transport = bensin, laddning, kollektivtrafik, taxi, parkering, bilens och MC:ns service, däck och försäkring,
  home = inredning och saker till hemmet (möbler, glas, porslin, textilier, belysning, växter, köksredskap, verktyg),
  fun = nöje och fritid (bio, konserter, streaming, spel, resor, hotell, bar, gym, hobby, kläder),
  saving = sparande (fonder, aktier, ISK, buffert),
  other = allt som inte passar ovan.
- scope: "build" om köpet är material eller tjänst för renovering och bygge (färg, spackel, kakel, golv, skruv,
  byggmaterial, hantverkare, el och VVS). Annars "home".`

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

  let text: string
  try {
    text = String((await req.json()).text ?? '').trim().slice(0, 200)
  } catch {
    return json({ error: 'Ogiltig förfrågan' }, 400)
  }
  if (!text) return json({ error: 'Texten saknas' }, 400)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'quick_entry', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: INSTRUCTIONS },
        { role: 'user', content: text },
      ],
    }),
  })

  if (!res.ok) {
    console.error('OpenAI svarade', res.status, await res.text())
    return json({ error: `OpenAI svarade ${res.status}` }, 502)
  }

  const data = await res.json()
  try {
    return json(JSON.parse(data.choices?.[0]?.message?.content))
  } catch {
    return json({ error: 'Svaret gick inte att läsa' }, 502)
  }
})
