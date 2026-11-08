import { type Item } from './items'

// K6 för bostadsrätt (Skatteverkets regler, förenklat):
// - Grundförbättring (ny- eller ombyggnad, t.ex. nytt kök där det inte fanns ett): avdragsgill oavsett när.
// - Förbättrande reparation och underhåll (ytskikt): avdragsgill om den gjorts under försäljningsåret
//   eller de fem kalenderåren före.
// - Båda räknas bara för år där utgifterna av den sorten är minst 5 000 kr.
export const K6_MIN_PER_YEAR = 5000

export const itemYear = (i: Item) => Number((i.date ?? i.created_at).slice(0, 4))
export const lastSaleYear = (i: Item) => itemYear(i) + 5

export function k6Deductions(items: Item[], saleYear = new Date().getFullYear()) {
  const done = items.filter((i) => i.done && i.k6)
  const basic = done.filter((i) => i.k6Kind !== 'maintenance')
  const maintenance = done.filter((i) => i.k6Kind === 'maintenance')

  // Summa per år, och bara år som når upp till 5 000 kr.
  const perYear = (list: Item[]) => {
    const years = new Map<number, number>()
    for (const i of list) years.set(itemYear(i), (years.get(itemYear(i)) ?? 0) + i.amount)
    return years
  }
  const counted = (years: Map<number, number>, keep: (y: number) => boolean) =>
    [...years].filter(([y, s]) => keep(y) && s >= K6_MIN_PER_YEAR).reduce((a, [, s]) => a + s, 0)

  const basicYears = perYear(basic)
  const maintenanceYears = perYear(maintenance)
  return {
    basic,
    maintenance,
    basicSum: basic.reduce((s, i) => s + i.amount, 0),
    maintenanceSum: maintenance.reduce((s, i) => s + i.amount, 0),
    // Det som får dras av om bostaden säljs i år.
    deductible: counted(basicYears, () => true) + counted(maintenanceYears, (y) => y >= saleYear - 5),
    belowLimit: [...basicYears, ...maintenanceYears].filter(([, s]) => s < K6_MIN_PER_YEAR).map(([y]) => y),
  }
}
