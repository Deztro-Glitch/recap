import type { Economy } from '../types'

export const emptyEconomy: Economy = { loan: 0, rate: 0, amortization: 0, loanStart: null, fee: 0, electricity: 0, insurance: 0 }

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
export function economyNumbers(e: Economy) {
  const months = e.loanStart ? monthsSince(e.loanStart) : 0
  const debt = Math.max(0, e.loan - e.amortization * months)
  const interest = (debt * e.rate) / 100 / 12
  const saving = debt > 0 ? Math.min(e.amortization, debt) : 0
  const costs = interest + e.fee + e.electricity + e.insurance
  return {
    debt,
    paidOff: e.loan - debt,
    interest,
    interestAfter: afterDeduction(interest),
    costs,
    saving,
    cashflow: costs + saving,
    share: e.loan > 0 ? debt / e.loan : 0,
  }
}
