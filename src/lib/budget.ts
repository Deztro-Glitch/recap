import type { BudgetCategory, Economy, Receipt, Scope } from '../types'
import { type Item } from './items'
import type { ProjectState } from './useProject'
import { api } from './api'
import { economyNumbers } from './economy'
import { parseNum } from './format'

// Budgeten: lönen (netto) är 100 %, och varje kategori är en del av den. Bara riktiga siffror:
// boende och lån från avtalen, bolånet och övriga lån, resten från månadens köp och kvittorader.
// Man sätter en egen budget per kategori (economy.budgets) och ser vad som är kvar eller över.

export type Category = BudgetCategory
const KEYS: Category[] = ['housing', 'loans', 'food', 'transport', 'home', 'fun', 'saving', 'other']

export const CATEGORY: Record<Category, { label: string; color: string }> = {
  housing: { label: 'Boende', color: 'var(--accent)' },
  loans: { label: 'Lån', color: 'var(--c-sky-bg)' },
  food: { label: 'Mat', color: 'var(--c-sun-bg)' },
  transport: { label: 'Transport', color: 'var(--c-steel-bg)' },
  home: { label: 'Hem', color: 'var(--c-lilac-bg)' },
  fun: { label: 'Nöje', color: 'var(--c-rose-bg)' },
  saving: { label: 'Sparande', color: 'var(--c-mint-bg)' },
  other: { label: 'Övrigt', color: 'var(--c-sand-bg)' },
}


// Gissar kategori från namnet, för köp utan sparad kategori och när AI:n inte svarar.
const GUESS: [Category, RegExp][] = [
  ['home', /(glas|möbel|lampa|ikea|kudde|matta|soffa|stol|bord|hylla|gardin|tallrik|bestick|kastrull|säng|växt|kruka|rusta|jysk|clas ohlson|plantagen|ljus|handduk|påslakan)/i],
  ['food', /(ica|coop|willys|hemköp|lidl|city gross|mat|lunch|middag|frukost|kaffe|fika|pizza|sushi|burgare|restaurang|krog|livs|bageri)/i],
  ['transport', /(bensin|diesel|tank|circle k|okq8|preem|ingo|sl-|sl |buss|tåg|sj |taxi|uber|bolt|parkering|biljett|däck|service|verkstad|bilvård)/i],
  ['fun', /(bio|konsert|spotify|netflix|hbo|disney|spel|steam|bar|öl|vin|drink|resa|hotell|gym|biljetter|festival)/i],
  ['saving', /(spar|fond|aktie|isk|buffert)/i],
]
export const guessCategory = (title: string): Category => GUESS.find(([, re]) => re.test(title))?.[0] ?? 'other'
export const categoryOf = (it: Pick<Item, 'title' | 'category'>): Category => it.category ?? guessCategory(it.title)

// Ett snabbtillägg, t.ex. "Vinglas 699kr".
export interface QuickEntry { title: string; amount: number; category: Category; scope: Scope }

// Läser texten på enheten: sista talet är beloppet, resten är namnet. Reserv när AI:n inte svarar.
export function guessQuickEntry(text: string): QuickEntry | null {
  const m = text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:kr|kronor|sek|:-)?\s*$/i) ?? text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:kr|kronor|sek|:-)/i)
  if (!m) return null
  const amount = parseNum(m[1])
  if (!(amount > 0)) return null
  const rest = (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s,–-]+|[\s,–-]+$/g, '')
  const title = rest ? rest[0].toUpperCase() + rest.slice(1) : 'Köp'
  return { title, amount, category: guessCategory(title), scope: 'home' }
}

// AI:n (Edge Function quick-entry) väljer namn, belopp, kategori och om det är bygge eller boende.
// Svarar den inte (demoläget, inget nät) gissar appen själv. Beloppet måste finnas i texten.
export async function readQuickEntry(text: string): Promise<QuickEntry | null> {
  const local = guessQuickEntry(text)
  try {
    const r = await api.quickEntry(text)
    const amount = Number(r?.amount)
    if (r && amount > 0) {
      return {
        title: String(r.title || local?.title || 'Köp').slice(0, 120),
        amount,
        category: KEYS.includes(r.category) ? r.category : local?.category ?? 'other',
        scope: r.scope === 'build' ? 'build' : 'home',
      }
    }
  } catch (err) {
    console.warn('Snabb inmatning: AI:n svarade inte, gissar på enheten', err)
  }
  return local
}

// En rad i Senaste transaktioner: ett helt kvitto eller ett enskilt köp.
export interface Tx { id: string; title: string; amount: number; date: string; created_at: string }

// Klara boendeköp, nyast först. Rader från samma kvitto blir en rad: "ICA Maxi (24 varor)",
// eller med varornas namn när de är två eller färre: "Byggmax (Färg & Penslar)".
export function transactions(items: Item[], receipts: Receipt[] = [], month?: string): Tx[] {
  const byId = new Map(receipts.map((r) => [r.id, r]))
  const groups = new Map<string, Item[]>()
  const rows: Tx[] = []
  for (const it of items) {
    if (!it.done || it.scope !== 'home' || !it.date || (month && !it.date.startsWith(month))) continue
    if (it.receipt_id) groups.set(it.receipt_id, [...(groups.get(it.receipt_id) ?? []), it])
    else rows.push({ id: it.id, title: it.title, amount: it.amount, date: it.date, created_at: it.created_at })
  }
  for (const [id, lines] of groups) {
    const r = byId.get(id)
    const store = r?.store?.trim() || 'Kvitto'
    const what = lines.length <= 2 ? lines.map((l) => l.title).join(' & ') : `${lines.length} varor`
    rows.push({
      id, title: `${store} (${what})`, amount: lines.reduce((s, l) => s + l.amount, 0),
      date: r?.bought_on ?? lines[0].date!, created_at: r?.created_at ?? lines[0].created_at,
    })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
}

// Kategorierna man kan sätta en egen budget för. Boende och lån är fasta och kommer från avtal och lån.
export const VARIABLE: Category[] = ['food', 'transport', 'home', 'fun', 'saving', 'other']
export const FIXED: Category[] = ['housing', 'loans']

export interface BudgetRow { key: Category; label: string; color: string; spent: number; budget: number; fixed: boolean }

// En månads budget ("2026-11"): vad varje kategori har kostat och budgeten för den. Boende och lån är månadens
// fasta kostnader (samma varje månad); köp och kvittorader läggs i sin kategori. Kvittorader utan egen kategori
// som inte går att gissa från namnet ("KNÄCKEBRÖD") får butikens kategori (ICA = mat). Renoveringen räknas inte,
// den har sin egen budget i projektet. Alla rörliga kategorier finns med, så att man kan sätta en budget.
export function monthBudget(e: Economy, state: Pick<ProjectState, 'contracts' | 'receipts'>, items: Item[], month: string): BudgetRow[] {
  const n = economyNumbers(e, state.contracts)
  const sums: Partial<Record<Category, number>> = {}
  const add = (k: Category, v: number) => { if (v > 0) sums[k] = (sums[k] ?? 0) + v }
  add('housing', n.costs)
  add('loans', n.cashflow - n.costs)

  const stores = new Map(state.receipts.map((r) => [r.id, r.store ?? '']))
  for (const it of items) {
    if (!it.done || it.scope !== 'home' || !it.date?.startsWith(month)) continue
    let k = categoryOf(it)
    if (k === 'other' && !it.category && it.receipt_id) k = guessCategory(stores.get(it.receipt_id) ?? '')
    add(k, it.amount)
  }

  return KEYS
    .map((k) => ({ key: k, ...CATEGORY[k], spent: Math.round(sums[k] ?? 0), budget: Number(e.budgets?.[k]) || 0, fixed: FIXED.includes(k) }))
    .filter((r) => !r.fixed || r.spent > 0)
}

// Kategorier som har gått över sin budget.
export const overBudget = (rows: BudgetRow[]) => rows.filter((r) => !r.fixed && r.budget > 0 && r.spent > r.budget)

// Månaden som text ("2026-11" → "november 2026") och ett steg fram eller bak.
export const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
export const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}-01T12:00:00`)
  d.setMonth(d.getMonth() + by)
  return d.toISOString().slice(0, 7)
}
