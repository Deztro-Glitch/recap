import { HOME_CONTRACTS, type Contract, type Economy } from '../types'

export const emptyEconomy: Economy = { loan: 0, rate: 0, amortization: 0, loanStart: null }

// Boendeavtal räknas in i månadskostnaden, privata abonnemang inte. Bolånet räknas för sig, via räntan.
export const contractScope = (c: Contract) => c.scope ?? (HOME_CONTRACTS.includes(c.kind) ? 'home' : 'private')
export const homeContracts = (contracts: Contract[]) => contracts.filter((c) => contractScope(c) === 'home' && c.kind !== 'bolan')

// Fasta kostnader per månad från Avtal. Äldre belopp i Ekonomi räknas bara tills ett avtal av samma slag finns.
export function fixedCosts(contracts: Contract[], e: Economy) {
  const home = homeContracts(contracts)
  const has = (k: Contract['kind']) => home.some((c) => c.kind === k)
  const legacy = (has('avgift') ? 0 : e.fee ?? 0) + (has('el') ? 0 : e.electricity ?? 0) + (has('forsakring') ? 0 : e.insurance ?? 0)
  return home.reduce((s, c) => s + (Number(c.monthly) || 0), 0) + legacy
}

// Hela månader sedan lånet startade.
export function monthsSince(start: string, now = new Date()) {
  const s = new Date(`${start}T00:00`)
  let m = (now.getFullYear() - s.getFullYear()) * 12 + now.getMonth() - s.getMonth()
  if (now.getDate() < s.getDate()) m--
  return Math.max(0, m)
}

// Ränteavdrag: 30 % på räntor upp till 100 000 kr om året, 21 % på resten.
export function afterDeduction(monthlyInterest: number) {
  const year = monthlyInterest * 12
  const deduction = Math.min(year, 100_000) * 0.3 + Math.max(0, year - 100_000) * 0.21
  return (year - deduction) / 12
}

// Allt Boendeläget visar, räknat från dagens datum.
export function economyNumbers(e: Economy, contracts: Contract[] = []) {
  const months = e.loanStart ? monthsSince(e.loanStart) : 0
  const debt = Math.max(0, e.loan - e.amortization * months)
  const interest = (debt * e.rate) / 100 / 12
  const saving = debt > 0 ? Math.min(e.amortization, debt) : 0
  const fixed = fixedCosts(contracts, e)
  const costs = interest + fixed
  return {
    debt,
    paidOff: e.loan - debt,
    interest,
    interestAfter: afterDeduction(interest),
    fixed,
    costs,
    saving,
    cashflow: costs + saving,
    share: e.loan > 0 ? debt / e.loan : 0,
  }
}
