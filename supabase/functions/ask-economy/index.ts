// Recap – "Fråga din ekonomi": svarar på en fråga om ens ekonomi med OpenAI (gpt-4o-mini).
// Appen skickar frågan och en sammanfattning av ekonomin (månader per kategori, budgetar, lön, fasta kostnader,
// lån, projekt och de senaste köpen). Svaret bygger bara på den sammanfattningen.
// Nyckeln ligger som hemlighet OPENAI_API_KEY i Supabase, aldrig i appen.
// Anropas med supabase.functions.invoke('ask-economy', { body: { question, context } }). Kräver inloggad användare.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const instructions = (today: string) => `Du svarar på frågor om användarens privatekonomi och hem i en svensk app. I dag är det ${today}.
Du får en sammanfattning i JSON: månadslön (netto), fasta kostnader per månad, budget per kategori, vad varje kategori
kostade varje månad, lån, projekt (renoveringar) och de senaste köpen med datum, namn, belopp, kategori och butik.
- Svara kort och konkret på svenska, högst tre meningar. Börja med svaret, t.ex. "I oktober la du 4 230 kr på mat."
- Skriv belopp som "1 234 kr" med mellanslag som tusentalsavgränsare.
- Räkna bara med siffrorna i sammanfattningen. Hitta aldrig på siffror. Finns inte svaret där, säg det kort.
- Jämför gärna med budgeten eller förra månaden när det hjälper.
- Kategorier: Mat, Transport, Hem, Nöje, Sparande, Övrigt, Boende och Lån.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Använd POST' }, 405)

  const user = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  })
  if (!user.ok) return json({ error: 'Logga in först' }, 401)

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ error: 'OPENAI_API_KEY saknas i Supabase' }, 500)

  let question: string, context: string
  try {
    const body = await req.json()
    question = String(body.question ?? '').trim().slice(0, 500)
    context = JSON.stringify(body.context ?? {})
  } catch {
    return json({ error: 'Ogiltig förfrågan' }, 400)
  }
  if (!question) return json({ error: 'Frågan saknas' }, 400)
  if (context.length > 200_000) return json({ error: 'För mycket data' }, 413)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: 'system', content: instructions(new Date().toISOString().slice(0, 10)) },
        { role: 'user', content: `Sammanfattning:\n${context}\n\nFråga: ${question}` },
      ],
    }),
  })
  if (!res.ok) {
    console.error('OpenAI svarade', res.status, await res.text())
    return json({ error: `OpenAI svarade ${res.status}` }, 502)
  }
  const data = await res.json()
  const answer = String(data.choices?.[0]?.message?.content ?? '').trim()
  return answer ? json({ answer }) : json({ error: 'Inget svar' }, 502)
})
