import type { CSSProperties } from 'react'

export type Kind = 'lagenhet' | 'hus' | 'annat'
// Översiktens läge: renovering (Projekt) eller vanligt boende (Boende). Sparas i projects.mode.
export type Mode = 'simple' | 'full'
export const MODE_LABEL: Record<Mode, string> = { full: 'Projekt', simple: 'Boende' }
// Vad ett inköp hör till: bygget (syns i Projekt) eller inredningen (syns i Boende).
export type Scope = 'build' | 'home'
export const SCOPE_LABEL: Record<Scope, string> = { build: 'Bygg', home: 'Inredning' }
export const modeScope = (m: Mode | undefined): Scope => (m === 'simple' ? 'home' : 'build')
export type TaskStatus = 'todo' | 'doing' | 'done'
export type PhotoKind = 'before' | 'after' | 'inspo'

export interface Project {
  id: string
  name: string
  kind: Kind
  address: string | null
  budget: number
  floorplan_path: string | null
  floorplan_map: PlanMap | null
  economy: Economy | null
  mode: Mode
  created_by: string
  created_at: string
}

// Hemmets ekonomi för Boendeläget. Belopp i kronor, räntan i procent.
export interface Economy {
  loan: number            // ursprungligt lån
  rate: number            // aktuell ränta, t.ex. 3.9
  amortization: number    // per månad
  loanStart: string | null
  // Äldre fält från innan de fasta kostnaderna hämtades från Avtal. Räknas bara tills ett avtal av samma slag finns.
  fee?: number
  electricity?: number
  insurance?: number
  zone?: ElZone | null    // elområde för dagens spotpris
  // Bostaden, för det estimerade marknadsvärdet
  purchasePrice?: number  // vad man betalade
  area?: number           // boarea i kvm
  sqmAverage?: number     // snittpris i området för normalt skick, kr/kvm
  sqmTop?: number         // toppris i området för nyrenoverat, kr/kvm
  loans?: OtherLoan[]     // övriga lån än bolånet, t.ex. MC-lån och billån. Räknas in i kassaflödet.
  income?: number         // månadslön efter skatt; 100 % i kassaflödets budget
}

// Ett övrigt lån (bil, MC, studielån). Man fyller i skulden som den är i dag; den minskar sedan med
// amorteringen varje hel månad efter debtDate.
export interface OtherLoan {
  id: string
  name: string            // t.ex. "MC-lån, KTM 990 Duke"
  debt?: number           // kvarvarande skuld när den fylldes i
  debtDate?: string       // när skulden fylldes i (YYYY-MM-DD)
  amortization: number    // per månad
  rate: number            // ränta i procent
  fee?: number            // fakturaavgift per månad
  loan?: number           // ursprungligt lån, för hur stor del som är betald (valfritt)
  loanStart?: string | null  // äldre lån: start, när skulden räknades från ursprungslånet
}

export type ElZone = 'SE1' | 'SE2' | 'SE3' | 'SE4'
export const EL_ZONE_LABEL: Record<ElZone, string> = { SE1: 'SE1 Luleå', SE2: 'SE2 Sundsvall', SE3: 'SE3 Stockholm', SE4: 'SE4 Malmö' }

// Rummen på planritningen som former: hörn som andelar (0–1) av bildens bredd och höjd.
export interface Pt { x: number; y: number }
export interface PlanMapV2 { v: 2; rooms: Record<string, Pt[]> }
// Äldre format: ett körlängdskodat rutnät där varje ruta hör till ett rum (index i ids + 1).
export interface PlanMapV1 { cols: number; rows: number; ids: string[]; data: number[] }
export type PlanMap = PlanMapV1 | PlanMapV2

export interface Member {
  project_id: string
  user_id: string
  email: string | null
  role: 'owner' | 'editor'
}

// Innehållspaletten i design.css (--c-<namn>-bg / -fg).
export type Palette = 'sand' | 'coral' | 'steel' | 'sun' | 'mint' | 'sky' | 'lilac' | 'rose'
export const PALETTE: Palette[] = ['sand', 'coral', 'steel', 'sun', 'mint', 'sky', 'lilac', 'rose']
export const COLOR_LABEL: Record<Palette, string> = { sand: 'Sand', coral: 'Korall', steel: 'Stål', sun: 'Sol', mint: 'Mint', sky: 'Himmel', lilac: 'Syren', rose: 'Ros' }
export type IconKey =
  | 'kitchen' | 'sofa' | 'bed' | 'bath' | 'door' | 'plant' | 'laptop' | 'toy' | 'home' | 'laundry' | 'stairs' | 'box'
  | 'folder' | 'paint' | 'hammer' | 'bolt' | 'droplet' | 'armchair' | 'lamp' | 'tool'

export interface Room {
  id: string
  project_id: string
  name: string
  icon: IconKey
  color: Palette
  sort: number
  condition?: Condition   // skick, för det estimerade marknadsvärdet
}

export type Condition = 1 | 2 | 3
export const CONDITION_LABEL: Record<Condition, string> = { 1: 'Renoveringsbehov', 2: 'Bruksskick', 3: 'Nyrenoverat' }

// Typ av K6-avdrag för bostadsrätt: grundförbättring gäller alltid, förbättrande reparation och
// underhåll bara om det gjorts under försäljningsåret eller de fem åren före.
export type K6Kind = 'basic' | 'maintenance'
export const K6_LABEL: Record<K6Kind, string> = { basic: 'Grundförbättring', maintenance: 'Underhåll/ytskikt (5-årsregel)' }

export interface Folder {
  id: string
  project_id: string
  name: string
  icon: IconKey
  color: Palette
  budget: number | null
  note: string | null
  sort: number
  created_at: string
}

export type Priority = 1 | 2 | 3
export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'Hög', 2: 'Normal', 3: 'Låg' }

// Fria fält på inköp och jobb, t.ex. färgkod eller garanti.
export interface Detail { label: string; value: string }
export const DETAIL_SUGGESTIONS = ['Färgkod', 'Kulör', 'Artikelnummer', 'Garanti till', 'Hantverkare', 'Mått']

export interface Purchase {
  id: string
  project_id: string
  room_id: string | null
  folder_id: string | null
  title: string
  est_price: number
  price: number | null
  bought: boolean
  store: string | null
  link: string | null
  note: string | null
  priority: Priority
  stays: boolean          // följer med lägenheten (kök, golv) i stället för att vara mitt (möbler)
  k6: boolean             // värdehöjande förbättring, dras av vid försäljning
  k6_kind?: K6Kind | null
  scope: Scope | null     // tomt = gissas utifrån namnet
  receipt_path: string | null
  receipt_id?: string | null   // raden hör till ett kvitto med flera rader
  image_path: string | null
  bought_on: string | null
  details: Detail[] | null
  created_at: string
}

export interface Idea {
  id: string
  project_id: string
  room_id: string | null
  folder_id: string | null
  title: string
  note: string | null
  link: string | null
  image_path: string | null
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  room_id: string | null
  folder_id: string | null
  title: string
  status: TaskStatus
  cost: number
  note: string | null
  priority: Priority
  k6: boolean
  k6_kind?: K6Kind | null
  receipt_path: string | null
  done_on: string | null
  details: Detail[] | null
  created_at: string
}

export type ContractKind = 'el' | 'elnat' | 'forsakring' | 'bredband' | 'mobil' | 'streaming' | 'larm' | 'bolan' | 'avgift' | 'annat'
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  el: 'Elavtal', elnat: 'Elnät', forsakring: 'Hemförsäkring', bredband: 'Bredband', mobil: 'Mobil', streaming: 'Streaming',
  larm: 'Larm', bolan: 'Bolån', avgift: 'Avgift', annat: 'Annat',
}
// Avtal som hör till bostaden, och abonnemang som man har oavsett var man bor.
export const HOME_CONTRACTS: ContractKind[] = ['el', 'elnat', 'forsakring', 'bredband', 'larm', 'bolan', 'avgift']
// Det de flesta har. Saknas något av dem föreslås det på avtalssidan.
export const COMMON_CONTRACTS: ContractKind[] = ['el', 'elnat', 'forsakring', 'bredband', 'mobil', 'streaming']
// Vanliga leverantörer att välja bland. Man kan alltid skriva en egen.
export const PROVIDERS: Partial<Record<ContractKind, string[]>> = {
  el: ['Tibber', 'Vattenfall', 'Fortum', 'E.ON', 'Göteborg Energi', 'Skellefteå Kraft', 'Greenely'],
  elnat: ['Ellevio', 'Vattenfall Eldistribution', 'E.ON Energidistribution', 'Göteborg Energi Nät'],
  forsakring: ['Folksam', 'If', 'Länsförsäkringar', 'Trygg-Hansa', 'Hedvig', 'Moderna'],
  bredband: ['Telia', 'Bahnhof', 'Telenor', 'Tele2', 'Bredband2', 'Ownit'],
  mobil: ['Telia', 'Tele2', 'Telenor', 'Tre', 'Hallon', 'Comviq', 'Vimla'],
  streaming: ['Netflix', 'Spotify', 'Max', 'Disney+', 'Viaplay', 'Apple TV+', 'YouTube Premium', 'Prime Video'],
  larm: ['Verisure', 'Sector Alarm'],
  bolan: ['SBAB', 'Swedbank', 'Handelsbanken', 'SEB', 'Nordea', 'Länsförsäkringar', 'Danske Bank'],
}

export interface Contract {
  id: string
  project_id: string
  kind: ContractKind
  provider: string
  monthly: number
  ends_on: string | null   // bindningstid eller rabatt slutar
  scope?: 'home' | 'private' | null   // tomt = efter avtalstypen
  file_path: string | null
  note: string | null
  created_at: string
}

// Ett kvitto med flera rader. Raderna är vanliga inköp med receipt_id.
// En sak att göra i hemmet (kortet "Att göra" i Boende). Migration 010.
export interface Todo {
  id: string
  project_id: string
  title: string
  done: boolean
  created_at: string
}

export interface Receipt {
  id: string
  project_id: string
  file_path: string | null
  store: string | null
  bought_on: string | null
  total: number | null
  created_at: string
}

export interface Photo {
  id: string
  project_id: string
  room_id: string | null
  kind: PhotoKind
  path: string
  url?: string
  created_at: string
}

export const KIND_LABEL: Record<Kind, string> = { lagenhet: 'Lägenhet', hus: 'Hus', annat: 'Annat' }

export const ROOM_PRESETS: { name: string; icon: IconKey; color: Palette }[] = [
  { name: 'Kök', icon: 'kitchen', color: 'sand' },
  { name: 'Vardagsrum', icon: 'sofa', color: 'coral' },
  { name: 'Sovrum', icon: 'bed', color: 'lilac' },
  { name: 'Badrum', icon: 'bath', color: 'sky' },
  { name: 'Hall', icon: 'door', color: 'steel' },
  { name: 'Matsal', icon: 'lamp', color: 'sun' },
  { name: 'WC', icon: 'droplet', color: 'sky' },
  { name: 'Balkong', icon: 'plant', color: 'mint' },
  { name: 'Kontor', icon: 'laptop', color: 'sun' },
  { name: 'Barnrum', icon: 'toy', color: 'rose' },
  { name: 'Tvättstuga', icon: 'laundry', color: 'steel' },
  { name: 'Förråd', icon: 'box', color: 'sand' },
]

export const tileStyle = (c: Palette) => ({ '--tile': `var(--c-${c}-bg)` }) as CSSProperties
