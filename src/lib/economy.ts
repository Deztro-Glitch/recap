import { CONTRACT_KIND_LABEL, HOME_CONTRACTS, type Contract, type Economy, type OtherLoan } from '../types'

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

// Bolånet räknat från dagens datum: skulden = lån − amortering × hela månader sedan start.
export function loanNumbers(l: { loan: number; amortization: number; rate: number; loanStart: string | null }) {
  const months = l.loanStart ? monthsSince(l.loanStart) : 0
  const debt = Math.max(0, l.loan - l.amortization * months)
  const interest = (debt * l.rate) / 100 / 12
  const amortization = debt > 0 ? Math.min(l.amortization, debt) : 0
  return { debt, paidOff: l.loan - debt, interest, amortization, monthly: interest + amortization, paid: l.loan > 0 ? (l.loan - debt) / l.loan : 0 }
}

// Månader tills skulden är borta med rak amortering. null om ingen amortering.
export function monthsToDebtFree(debt: number, amortization: number) {
  if (debt <= 0) return 0
  return amortization > 0 ? Math.ceil(debt / amortization) : null
}

// "2 år och 7 månader"
export function durationText(months: number | null) {
  if (months == null) return 'Ingen amortering'
  if (months === 0) return 'Skuldfri'
  const y = Math.floor(months / 12), m = months % 12
  return [y && `${y} år`, m && `${m} ${m === 1 ? 'månad' : 'månader'}`].filter(Boolean).join(' och ')
}

// Ett övrigt lån i dag. Äldre lån (ursprungslån och startdatum) räknas om på samma sätt som bolånet.
export function otherLoanNumbers(l: OtherLoan) {
  const start = l.debt != null ? l.debt : (l.loan ?? 0)
  const from = l.debt != null ? l.debtDate : l.loanStart
  const months = from ? monthsSince(from) : 0
  const debt = Math.max(0, start - l.amortization * months)
  const interest = (debt * l.rate) / 100 / 12
  const amortization = debt > 0 ? Math.min(l.amortization, debt) : 0
  const fee = debt > 0 ? l.fee ?? 0 : 0
  const original = l.loan && l.loan >= debt ? l.loan : null
  return {
    debt, interest, amortization, fee,
    monthly: interest + amortization + fee,
    original,
    paidOff: original != null ? original - debt : null,
    paid: original ? (original - debt) / original : null,
    months: monthsToDebtFree(debt, l.amortization),
  }
}

// Allt Boendeläget visar, räknat från dagens datum. Ren månadskostnad gäller bara boendet;
// kassaflödet tar också med andra lån (ränta och amortering), t.ex. MC-lånet.
export function economyNumbers(e: Economy, contracts: Contract[] = []) {
  const home = loanNumbers(e)
  const fixed = fixedCosts(contracts, e)
  const costs = home.interest + fixed
  const others = (e.loans ?? []).map((l) => ({ ...l, ...otherLoanNumbers(l) }))
  const otherMonthly = others.reduce((s, l) => s + l.monthly, 0)
  return {
    debt: home.debt,
    paidOff: home.paidOff,
    interest: home.interest,
    interestAfter: afterDeduction(home.interest),
    fixed,
    costs,
    saving: home.amortization,
    others,
    cashflow: costs + home.amortization + otherMonthly,
    share: e.loan > 0 ? home.debt / e.loan : 0,
  }
}

// Månadskostnaden uppdelad för stapeldiagrammet: räntan och varje slags boendeavtal (äldre belopp i Ekonomi
// räknas på samma sätt som i fixedCosts). Amorteringen läggs till separat, den är sparande och ingen kostnad.
export function costParts(e: Economy, contracts: Contract[] = []) {
  const parts = new Map<string, number>()
  const add = (label: string, amount: number) => amount > 0 && parts.set(label, (parts.get(label) ?? 0) + amount)
  add('Ränta', economyNumbers(e, contracts).interest)
  const home = homeContracts(contracts)
  for (const c of home) add(CONTRACT_KIND_LABEL[c.kind], Number(c.monthly) || 0)
  const has = (k: Contract['kind']) => home.some((c) => c.kind === k)
  if (!has('avgift')) add(CONTRACT_KIND_LABEL.avgift, e.fee ?? 0)
  if (!has('el')) add(CONTRACT_KIND_LABEL.el, e.electricity ?? 0)
  if (!has('forsakring')) add(CONTRACT_KIND_LABEL.forsakring, e.insurance ?? 0)
  return [...parts].map(([label, amount]) => ({ label, amount }))
}
