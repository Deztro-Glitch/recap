// Recap – påminnelser i telefonen (Web Push). Körs en gång per morgon av Supabase Cron.
// För varje hem med påminnelser påslagna samlas det som är dags ihop till en notis:
//  - underhåll: 3 dagar kvar, dags i dag, och sedan en gång i veckan så länge det inte är gjort
//  - garantier: 30, 7 och 1 dag innan de går ut
//  - kvittorader att granska som har kommit in det senaste dygnet
// Hemligheter i Supabase: VAPID_PUBLIC_KEY och VAPID_PRIVATE_KEY (från .env.vapid, finns aldrig i repot).
// Bara Cron får anropa funktionen: anropet ska ha projektets service role-nyckel (Supabase Cron kan sätta den själv),
// eller rubriken x-cron-secret med hemligheten CRON_SECRET om man hellre använder en egen.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const APP_URL = 'https://deztro-glitch.github.io/recap/'
const DAY = 86_400_000

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const today = () => new Date(new Date().toISOString().slice(0, 10)).getTime()
const daysSince = (d: string) => Math.round((today() - new Date(d.slice(0, 10)).getTime()) / DAY)
const days = (n: number) => `${n} ${n === 1 ? 'dag' : 'dagar'}`

Deno.serve(async (req) => {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const cron = Deno.env.get('CRON_SECRET')
  const allowed = (service && req.headers.get('Authorization') === `Bearer ${service}`) || (cron && req.headers.get('x-cron-secret') === cron)
  if (!allowed) return json({ error: 'Bara Supabase Cron får anropa den här funktionen' }, 401)
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return json({ error: 'VAPID_PUBLIC_KEY och VAPID_PRIVATE_KEY saknas i Supabase' }, 500)
  webpush.setVapidDetails(APP_URL, pub, priv)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, service, { auth: { persistSession: false } })
  const { data: subs, error } = await db.from('push_subscriptions').select('id, project_id, endpoint, p256dh, auth')
  if (error) return json({ error: error.message }, 500)

  const projects = [...new Set((subs ?? []).map((s) => s.project_id))]
  let sent = 0
  const since = new Date(Date.now() - DAY).toISOString()

  for (const pid of projects) {
    const [{ data: home }, { data: care }, { data: warranty }, { count: review }] = await Promise.all([
      db.from('projects').select('name').eq('id', pid).single(),
      db.from('maintenance').select('name, every_days, last_done, created_at').eq('project_id', pid),
      db.from('purchases').select('title, warranty_until').eq('project_id', pid).not('warranty_until', 'is', null),
      db.from('purchases').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('needs_review', true).gte('created_at', since),
    ])

    const lines: string[] = []
    for (const m of care ?? []) {
      const left = m.every_days - daysSince(m.last_done ?? m.created_at)
      if (left === 3) lines.push(`${m.name} om 3 dagar`)
      else if (left === 0) lines.push(`${m.name} är dags i dag`)
      else if (left < 0 && -left % 7 === 0) lines.push(`${m.name} var dags för ${days(-left)} sedan`)
    }
    for (const w of warranty ?? []) {
      const left = -daysSince(w.warranty_until)
      if ([30, 7, 1].includes(left)) lines.push(`Garantin för ${w.title} går ut om ${days(left)}`)
    }
    if (review) lines.push(`${review} ${review === 1 ? 'kvittorad' : 'kvittorader'} att granska`)
    if (!lines.length) continue

    const payload = JSON.stringify({
      title: lines.length === 1 ? (home?.name ?? 'Recap') : `${home?.name ?? 'Recap'}: ${lines.length} saker`,
      body: lines.slice(0, 4).join('\n') + (lines.length > 4 ? `\noch ${lines.length - 4} till` : ''),
      url: APP_URL,
    })
    for (const s of (subs ?? []).filter((x) => x.project_id === pid)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent++
      } catch (err: any) {
        // Telefonen har slutat ta emot (avinstallerad, nekat): prenumerationen tas bort.
        if (err?.statusCode === 404 || err?.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
        else console.error('Notisen kunde inte skickas', err?.statusCode, err?.body)
      }
    }
  }
  return json({ projects: projects.length, sent })
})
