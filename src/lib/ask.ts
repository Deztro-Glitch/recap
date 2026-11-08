import { api } from './api'
import { CATEGORY, VARIABLE, FIXED, monthBudget, monthLabel, shiftMonth, type Category } from './budget'
import { economyNumbers, emptyEconomy } from './economy'
import { kr } from './format'
import { allItems, renovationNumbers } from './items'
import type { ProjectState } from './useProject'

// "Fråga din ekonomi" (steg 5): en sammanfattning av ekonomin skickas med frågan till Edge Function ask-economy.
// Bara det appen redan vet: månader per kategori, budgetar, lön, fasta kostnader, lån, projekt och de senaste köpen.

const thisMonth = () => new Date().toISOString().slice(0, 7)
const months = (n: number) => Array.from({ length: n }, (_, i) => shiftMonth(thisMonth(), -i))

export function economyContext(state: ProjectState) {
  const e = state.project?.economy ?? emptyEconomy
  const n = economyNumbers(e, state.contracts)
  const items = allItems(state)
  const perMonth = Object.fromEntries(months(6).map((m) => [
    monthLabel(m),
    Object.fromEntries(monthBudget(e, state, items, m).filter((r) => r.spent > 0).map((r) => [r.label, r.spent])),
  ]))
  const since = shiftMonth(thisMonth(), -5)
  const stores = new Map(state.receipts.map((r) => [r.id, r.store]))
  const purchases = items
    .filter((i) => i.done && i.date && i.date.slice(0, 7) >= since)
    .sort((a, b) => b.date!.localeCompare(a.date!))
    .slice(0, 300)
    .map((i) => ({
      datum: i.date, vad: i.title, belopp: Math.round(i.amount),
      kategori: i.scope === 'build' ? 'Renovering' : CATEGORY[(i.category ?? 'other') as Category]?.label ?? 'Övrigt',
      butik: i.store ?? (i.receipt_id ? stores.get(i.receipt_id) : null) ?? undefined,
    }))
  return {
    manadslon_netto: e.income ?? null,
    fasta_kostnader_per_manad: Math.round(n.cashflow),
    boende_per_manad: Math.round(n.costs),
    ren_manadskostnad: Math.round(n.net),
    bolan: e.loan ? { skuld: Math.round(n.debt), ranta_procent: e.rate, ranta_per_manad: Math.round(n.interest), amortering: e.amortization } : null,
    ovriga_lan: n.others.map((l) => ({ namn: l.name, skuld: Math.round(l.debt), per_manad: Math.round(l.monthly) })),
    budget_per_kategori: Object.fromEntries([...VARIABLE, ...FIXED].filter((k) => e.budgets?.[k]).map((k) => [CATEGORY[k].label, e.budgets![k]])),
    per_manad_och_kategori: perMonth,
    projekt: state.renovations.map((r) => {
      const x = renovationNumbers(state, r)
      return { namn: r.name, status: r.status, budget: x.budget || null, klart: Math.round(x.spent), planerat_kvar: Math.round(x.plannedSum) }
    }),
    kop: purchases,
  }
}

// Svar på enheten när AI:n inte svarar (demoläget, inget nät): bara frågor om en kategori en viss månad.
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
export function localAnswer(question: string, state: ProjectState): string {
  const q = question.toLowerCase()
  const e = state.project?.economy ?? emptyEconomy
  const cat = (Object.keys(CATEGORY) as Category[]).find((k) => q.includes(CATEGORY[k].label.toLowerCase()))
  const mi = MONTHS.findIndex((m) => q.includes(m))
  const month = mi >= 0 ? months(12).find((m) => Number(m.slice(5)) === mi + 1) ?? thisMonth() : /förra månaden/.test(q) ? shiftMonth(thisMonth(), -1) : thisMonth()
  const rows = monthBudget(e, state, allItems(state), month)
  const name = monthLabel(month).split(' ')[0]
  if (cat) {
    const r = rows.find((x) => x.key === cat)
    const spent = r?.spent ?? 0
    const vs = r && r.budget > 0 ? ` Budgeten är ${kr(r.budget)}, så du ligger ${spent > r.budget ? `${kr(spent - r.budget)} över` : `${kr(r.budget - spent)} under`}.` : ''
    return `I ${name} la du ${kr(spent)} på ${CATEGORY[cat].label.toLowerCase()}.${vs}`
  }
  const total = rows.reduce((s, r) => s + r.spent, 0)
  if (/totalt|allt|sammanlagt|hur mycket/.test(q)) return `I ${name} har det kostat ${kr(total)} totalt, fasta kostnader inräknade.`
  return 'AI:n svarar inte just nu. Fråga till exempel "Hur mycket la jag på mat i oktober?"'
}

// AI först; svarar den inte räknar appen själv på det den kan.
export async function askEconomy(question: string, state: ProjectState): Promise<string> {
  try {
    const answer = await api.askEconomy(question, economyContext(state))
    if (answer) return answer
  } catch (err) {
    console.warn('Fråga din ekonomi: AI:n svarade inte', err)
  }
  return localAnswer(question, state)
}
