import type { CSSProperties } from 'react'

export type Kind = 'lagenhet' | 'hus' | 'annat'
// Hur mycket man ska göra: bara inköp och kvitton, eller renovering med mappar och jobb.
export type Mode = 'simple' | 'full'
export const MODE_LABEL: Record<Mode, { name: string; meta: string }> = {
  simple: { name: 'Inköp och kvitton', meta: 'Möbler, inredning och kvitton' },
  full: { name: 'Renovering', meta: 'Även mappar för större projekt' },
}
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
  receipt_path: string | null
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
  receipt_path: string | null
  done_on: string | null
  details: Detail[] | null
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

// Mallar när man skapar en mapp. Jobben läggs in i den ordning man brukar göra dem.
export const FOLDER_TEMPLATES: { name: string; icon: IconKey; color: Palette; tasks: string[] }[] = [
  { name: 'Tom mapp', icon: 'folder', color: 'lilac', tasks: [] },
  { name: 'Köksrenovering', icon: 'kitchen', color: 'sand', tasks: ['Riva gamla köket', 'Dra om el', 'Flytta vatten och avlopp', 'Spackla och måla', 'Lägga golv', 'Montera stommar och luckor', 'Montera bänkskiva', 'Sätta kakel', 'Installera vitvaror'] },
  { name: 'Badrumsrenovering', icon: 'bath', color: 'sky', tasks: ['Riva gammalt', 'Byta golvbrunn', 'Dra el', 'Lägga tätskikt', 'Sätta kakel och klinker', 'Montera porslin och dusch'] },
  { name: 'Målning', icon: 'paint', color: 'coral', tasks: ['Spackla och slipa', 'Grundmåla', 'Måla två strykningar'] },
  { name: 'Möbler och inredning', icon: 'armchair', color: 'rose', tasks: [] },
  { name: 'Golv', icon: 'hammer', color: 'steel', tasks: ['Riva gammalt golv', 'Lägga underlag', 'Lägga golv', 'Sätta golvlister'] },
]

export const tileStyle = (c: Palette) => ({ '--tile-bg': `var(--c-${c}-bg)`, '--tile-fg': `var(--c-${c}-fg)` }) as CSSProperties
