import type { CSSProperties } from 'react'

export type Kind = 'lagenhet' | 'hus' | 'annat'
// Översiktens läge: renovering (Projekt) eller vanligt boende (Boende). Sparas i projects.mode.
export type Mode = 'simple' | 'full'
export const MODE_LABEL: Record<Mode, string> = { full: 'Projekt', simple: 'Boende' }
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
  mode: Mode
  created_by: string
  created_at: string
}

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
}

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
  receipt_path: string | null
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
  receipt_path: string | null
  done_on: string | null
  details: Detail[] | null
  created_at: string
}

export type ContractKind = 'el' | 'bredband' | 'forsakring' | 'bolan' | 'avgift' | 'annat'
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = { el: 'El', bredband: 'Bredband', forsakring: 'Försäkring', bolan: 'Bolån', avgift: 'Avgift', annat: 'Annat' }

export interface Contract {
  id: string
  project_id: string
  kind: ContractKind
  provider: string
  monthly: number
  ends_on: string | null   // bindningstid eller rabatt slutar
  file_path: string | null
  note: string | null
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

export const tileStyle = (c: Palette) => ({ '--tile-bg': `var(--c-${c}-bg)`, '--tile-fg': `var(--c-${c}-fg)` }) as CSSProperties
