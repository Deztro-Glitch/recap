const nf = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 })

export const kr = (n: number) => `${nf.format(Math.round(n || 0))} kr`

// Kort form för små ytor: "142 tkr".
export const krShort = (n: number) => (Math.abs(n) >= 10000 ? `${nf.format(Math.round(n / 1000))} tkr` : kr(n))

// Tål "1 200", "1200,50" och tomt fält.
export const parseNum = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
