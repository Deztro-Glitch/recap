import { useEffect, useState } from 'react'
import type { ElZone, Economy } from '../types'

// Spotpriset per kvart (förr per timme) från elprisetjustnu.se (gratis, utan nyckel). Priserna är utan moms och avgifter.
interface Raw { SEK_per_kWh: number; time_start: string; time_end: string }
export interface Slot { start: number; end: number; price: number }   // tider i ms, pris i kr/kWh
export interface ElPrice {
  slots: Slot[]
  index: number            // perioden vi är i nu, -1 om ingen
  now: number | null
  avg: number
  min: number
  max: number
  share: number | null     // var nuvarande pris ligger mellan dagens lägsta (0) och högsta (1)
}

const pad = (n: number) => String(n).padStart(2, '0')

// Dagens priser hämtas en gång per elområde, även om både kortet och panelen frågar.
const days = new Map<string, Promise<Slot[]>>()
function loadDay(zone: ElZone, d: Date) {
  const key = `${d.getFullYear()}/${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${zone}`
  if (!days.has(key)) {
    const p = fetch(`https://www.elprisetjustnu.se/api/v1/prices/${key}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Elpriset svarade ${r.status}`))))
      .then((rows: Raw[]) => rows.map((s) => ({ start: new Date(s.time_start).getTime(), end: new Date(s.time_end).getTime(), price: s.SEK_per_kWh })))
    p.catch(() => days.delete(key))   // försök igen nästa gång
    days.set(key, p)
  }
  return days.get(key)!
}

function summarize(slots: Slot[], t: number): ElPrice {
  const prices = slots.map((s) => s.price)
  const index = slots.findIndex((s) => s.start <= t && t < s.end)
  const now = index >= 0 ? slots[index].price : null
  const min = Math.min(...prices), max = Math.max(...prices)
  return {
    slots, index, now, min, max,
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    share: now == null ? null : max > min ? (now - min) / (max - min) : 0.5,
  }
}

// Dagens spotpris. Räknar om "just nu" varje minut, så att markören följer med när en ny kvart börjar.
export function useElPrice(zone: ElZone | null | undefined) {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [t, setT] = useState(Date.now())

  useEffect(() => {
    if (!zone) return setSlots(null)
    let cancelled = false
    const load = () => loadDay(zone, new Date()).then((s) => !cancelled && setSlots(s.length ? s : null)).catch(() => !cancelled && setSlots(null))
    load()
    const timer = setInterval(() => {
      setT(Date.now())
      load()   // efter midnatt hämtas nästa dag
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [zone])

  return slots ? summarize(slots, t) : null
}

export const ore = (sek: number) => `${Math.round(sek * 100)} öre`

// Vad en kWh kostar på riktigt: spotpris + elnätsavgift + skatt + påslag, plus 25 % moms på allt.
// Avgifterna skrivs i öre/kWh (utan moms) under Elpris och sparas i economy.el.
export const VAT = 0.25
export function kwhCost(spotSek: number, fees: Economy['el']) {
  const extra = ((fees?.grid ?? 0) + (fees?.tax ?? 0) + (fees?.markup ?? 0)) / 100
  const net = spotSek + extra
  return { spot: spotSek, extra, net, vat: net * VAT, total: net * (1 + VAT) }
}
