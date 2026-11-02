import { useEffect, useState } from 'react'
import type { ElZone } from '../types'

// Spotpriset per kvart från elprisetjustnu.se (gratis, utan nyckel). Priserna är utan moms och avgifter.
interface Slot { SEK_per_kWh: number; time_start: string; time_end: string }
export interface ElPrice { now: number | null; avg: number; min: number; max: number }

const pad = (n: number) => String(n).padStart(2, '0')

export function useElPrice(zone: ElZone | null | undefined) {
  const [price, setPrice] = useState<ElPrice | null>(null)

  useEffect(() => {
    if (!zone) return setPrice(null)
    const d = new Date()
    const url = `https://www.elprisetjustnu.se/api/v1/prices/${d.getFullYear()}/${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${zone}.json`
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((slots: Slot[]) => {
        if (cancelled || !slots.length) return
        const sek = slots.map((s) => s.SEK_per_kWh)
        const t = Date.now()
        const current = slots.find((s) => new Date(s.time_start).getTime() <= t && t < new Date(s.time_end).getTime())
        setPrice({ now: current?.SEK_per_kWh ?? null, avg: sek.reduce((a, b) => a + b, 0) / sek.length, min: Math.min(...sek), max: Math.max(...sek) })
      })
      .catch(() => !cancelled && setPrice(null))
    return () => {
      cancelled = true
    }
  }, [zone])

  return price
}

export const ore = (sek: number) => `${Math.round(sek * 100)} öre`
