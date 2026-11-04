import type { Economy } from '../types'

// Bostadens värde. Tills värderingen hämtas från Booli används egen värdering eller ett exempel.
// Byt ut fetchValuation mot ett anrop till Booli när API:et finns.
export interface Valuation {
  base: number           // marknadsvärdet utan förbättringar
  improvements: number   // K6-förbättringar som läggs ovanpå
  value: number
  change: number | null  // förändring senaste månaden, t.ex. 0.024
  source: 'booli' | 'own' | 'example'
}

export function valuation(e: Economy | null | undefined, improvements: number): Valuation {
  if (e?.value) return { base: e.value, improvements, value: e.value + improvements, change: null, source: 'own' }
  // Exemplet följer lånets storlek så att siffrorna ser rimliga ut i demot.
  const base = e?.loan ? Math.round((e.loan * 1.25) / 10_000) * 10_000 : 1_850_000
  return { base, improvements, value: base + improvements, change: 0.024, source: 'example' }
}
