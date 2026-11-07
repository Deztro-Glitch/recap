import type { Economy } from '../types'
import type { Item } from '../screens/tabs/Items'
import type { ProjectState } from '../screens/ProjectView'
import { economyNumbers } from './economy'
import { parseNum } from './format'

// Kassaflödets budget: lönen (netto) är 100 %, och varje kategori är en del av den.
// Boende och lån kommer från appens riktiga siffror (avtal, bolån, övriga lån). Övriga kategorier är
// exempel tills riktiga siffror finns; köp som läggs in med snabbinmatningen läggs ovanpå.

export type Category = 'housing' | 'loans' | 'food' | 'transport' | 'home' | 'fun' | 'saving' | 'other'

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

// Exempel, som andel av lönen, tills kategorierna fylls med riktiga siffror.
const EXAMPLE: Partial<Record<Category, number>> = { housing: 0.3, food: 0.15, transport: 0.08, fun: 0.07, saving: 0.1 }

// Gissar kategori från namnet. Ersätts av AI:n, som får hela texten och svarar med kategori.
const GUESS: [Category, RegExp][] = [
  ['home', /(glas|möbel|lampa|ikea|kudde|matta|soffa|stol|bord|hylla|gardin|tallrik|bestick|kastrull|säng|växt|kruka|rusta|jysk|clas ohlson|plantagen|ljus|handduk|påslakan)/i],
  ['food', /(ica|coop|willys|hemköp|lidl|city gross|mat|lunch|middag|frukost|kaffe|fika|pizza|sushi|burgare|restaurang|krog|livs|bageri)/i],
  ['transport', /(bensin|diesel|tank|circle k|okq8|preem|ingo|sl-|sl |buss|tåg|sj |taxi|uber|bolt|parkering|biljett|däck|service|verkstad|bilvård)/i],
  ['fun', /(bio|konsert|spotify|netflix|hbo|disney|spel|steam|bar|öl|vin|drink|resa|hotell|gym|biljetter|festival)/i],
  ['saving', /(spar|fond|aktie|isk|buffert)/i],
]
export const guessCategory = (title: string): Category => GUESS.find(([, re]) => re.test(title))?.[0] ?? 'other'

// Ett snabbtillägg, t.ex. "Vinglas 699kr".
export interface QuickEntry { title: string; amount: number; category: Category }

// Läser texten på enheten: sista talet är beloppet, resten är namnet.
// Senare skickas strängen till AI:n i stället, som svarar i samma format.
export function readQuickEntry(text: string): QuickEntry | null {
  const m = text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:kr|kronor|sek|:-)?\s*$/i) ?? text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:kr|kronor|sek|:-)/i)
  if (!m) return null
  const amount = parseNum(m[1])
  if (!(amount > 0)) return null
  const rest = (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s,–-]+|[\s,–-]+$/g, '')
  const title = rest ? rest[0].toUpperCase() + rest.slice(1) : 'Köp'
  return { title, amount, category: guessCategory(title) }
}

// Klara boendeköp, nyast först. Det är dessa som visas som senaste transaktioner.
export const transactions = (items: Item[]) =>
  items
    .filter((i) => i.done && i.scope === 'home' && i.date)
    .sort((a, b) => b.date!.localeCompare(a.date!) || b.created_at.localeCompare(a.created_at))

export interface Part { key: Category; label: string; color: string; amount: number }

// Fördelningen för en månad: riktiga fasta kostnader, exempel för resten, och månadens köp ovanpå.
export function budgetParts(income: number, e: Economy, state: Pick<ProjectState, 'contracts'>, items: Item[]): Part[] {
  const n = economyNumbers(e, state.contracts)
  const sums: Partial<Record<Category, number>> = {}
  const add = (k: Category, v: number) => { if (v > 0) sums[k] = (sums[k] ?? 0) + v }

  add('housing', n.costs > 0 ? n.costs : income * (EXAMPLE.housing ?? 0))
  add('loans', n.cashflow - n.costs)
  for (const k of ['food', 'transport', 'fun', 'saving'] as const) add(k, income * (EXAMPLE[k] ?? 0))

  const month = new Date().toISOString().slice(0, 7)
  for (const t of transactions(items)) if (t.date!.startsWith(month)) add(guessCategory(t.title), t.amount)

  return (Object.keys(CATEGORY) as Category[])
    .filter((k) => (sums[k] ?? 0) > 0)
    .map((k) => ({ key: k, ...CATEGORY[k], amount: Math.round(sums[k]!) }))
}
