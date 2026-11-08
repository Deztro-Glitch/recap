import { api } from './api'

// Påminnelser i telefonen (steg 5): Web Push. Den publika nyckeln får finnas i appen; den hemliga finns bara
// som Supabase-hemligheten VAPID_PRIVATE_KEY. Funktionen send-reminders skickar varje morgon det som är dags.
export const VAPID_PUBLIC_KEY = 'BJsEtznec4jz-mN-lCV0EAQMhiITBC_-KmsV789QkF2070iM773qq8s_4za008NrM3L8w47zZmPRKBxJegrhVDQ'

interface PushRow { id: string; endpoint: string }

// Varför påminnelser inte går: demoläget, webbläsaren saknar stöd, eller iPhone där appen inte ligger på hemskärmen.
export function pushBlocker(): string | null {
  if (api.demo) return 'Påminnelser fungerar när appen är kopplad till Supabase.'
  const ios = /iphone|ipad/i.test(navigator.userAgent)
  const installed = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone
  if (ios && !installed) return 'På iPhone fungerar påminnelser när appen ligger på hemskärmen (Dela → Lägg till på hemskärmen).'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Den här webbläsaren kan inte ta emot påminnelser.'
  if (Notification.permission === 'denied') return 'Notiser är blockerade för appen. Tillåt dem i telefonens inställningar.'
  return null
}

const keyBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

// Är påminnelser påslagna på den här enheten?
export async function pushEnabled(): Promise<boolean> {
  if (pushBlocker()) return false
  const reg = await navigator.serviceWorker.ready
  return !!(await reg.pushManager.getSubscription())
}

// Slår på: frågar om lov, prenumererar och sparar prenumerationen på hemmet.
export async function enablePush(pid: string) {
  const blocker = pushBlocker()
  if (blocker) throw new Error(blocker)
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notiser tilläts inte.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const rows = await api.list<PushRow>('push_subscriptions', pid)
  if (!rows.some((r) => r.endpoint === sub.endpoint)) {
    await api.insert('push_subscriptions', { project_id: pid, endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth })
  }
}

// Stänger av på den här enheten.
export async function disablePush(pid: string) {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const rows = await api.list<PushRow>('push_subscriptions', pid)
  for (const r of rows.filter((x) => x.endpoint === sub.endpoint)) await api.remove('push_subscriptions', r.id)
  await sub.unsubscribe()
}
