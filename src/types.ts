import type { CSSProperties } from 'react'

export type Kind = 'lagenhet' | 'hus' | 'annat'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type PhotoKind = 'before' | 'after' | 'inspo'

export interface Project {
  id: string
  name: string
  kind: Kind
  address: string | null
  budget: number
  created_by: string
  created_at: string
}

export interface Member {
  project_id: string
  user_id: string
  email: string | null
  role: 'owner' | 'editor'
}

export interface Room {
  id: string
  project_id: string
  name: string
  icon: RoomIcon
  color: Palette
  sort: number
}

// Innehållspaletten i design.css (--c-<namn>-bg / -fg).
export type Palette = 'sand' | 'coral' | 'steel' | 'sun' | 'mint' | 'sky' | 'lilac' | 'rose'
export const PALETTE: Palette[] = ['sand', 'coral', 'steel', 'sun', 'mint', 'sky', 'lilac', 'rose']
export type RoomIcon = 'kitchen' | 'sofa' | 'bed' | 'bath' | 'door' | 'plant' | 'laptop' | 'toy' | 'home' | 'laundry' | 'stairs' | 'box'

export interface Purchase {
  id: string
  project_id: string
  room_id: string | null
  title: string
  est_price: number
  price: number | null
  bought: boolean
  store: string | null
  link: string | null
  note: string | null
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  room_id: string | null
  title: string
  phase: number
  status: TaskStatus
  cost: number
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

// Arbetsordning: det man normalt gör först står först.
export const PHASES = [
  { name: 'Rivning', hint: 'Riv ut det gamla' },
  { name: 'El', hint: 'Dra el innan väggar stängs' },
  { name: 'VVS', hint: 'Rör, avlopp, värme' },
  { name: 'Snickeri & väggar', hint: 'Regla, gipsa, dörrar' },
  { name: 'Tätskikt & kakel', hint: 'Våtrum' },
  { name: 'Spackel & målning', hint: 'Spackla, slipa, måla' },
  { name: 'Golv', hint: 'Sist av ytskikten' },
  { name: 'Montering & inredning', hint: 'Lampor, kök, möbler' },
] as const

export const KIND_LABEL: Record<Kind, string> = { lagenhet: 'Lägenhet', hus: 'Hus', annat: 'Annat' }

export const ROOM_PRESETS: { name: string; icon: RoomIcon; color: Palette }[] = [
  { name: 'Kök', icon: 'kitchen', color: 'sand' },
  { name: 'Vardagsrum', icon: 'sofa', color: 'coral' },
  { name: 'Sovrum', icon: 'bed', color: 'lilac' },
  { name: 'Badrum', icon: 'bath', color: 'sky' },
  { name: 'Hall', icon: 'door', color: 'steel' },
  { name: 'Balkong', icon: 'plant', color: 'mint' },
  { name: 'Kontor', icon: 'laptop', color: 'sun' },
  { name: 'Barnrum', icon: 'toy', color: 'rose' },
]

export const tileStyle = (c: Palette) => ({ '--tile-bg': `var(--c-${c}-bg)`, '--tile-fg': `var(--c-${c}-fg)` }) as CSSProperties
