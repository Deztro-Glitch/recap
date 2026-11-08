import type { ProjectState } from '../lib/useProject'
import type { Contract, Maintenance, Purchase, Renovation, Room, Task } from '../types'

// Typerna som skärmarna delar: vilket formulär eller vilken panel som är öppen (SheetState) och vad varje vy får (ViewProps).
// De ligger här i stället för i ProjectView.tsx, så att flikarna inte behöver importera skärmen som visar dem.
export type { ProjectState }
// Alla formulär och paneler öppnas av ProjectView, så att de kan nås från vilken vy som helst.
export type SheetState =
  | { t: 'purchase'; item: Partial<Purchase> }
  | { t: 'task'; item: Task }
  | { t: 'contract'; item: Contract | Partial<Contract> }
  | { t: 'pick'; room_id?: string | null }   // kameran, med ett rum förvalt
  | { t: 'room' }
  | { t: 'renovation'; item: Renovation | Partial<Renovation> }   // ett projekt (renovering): visa, ändra eller lägg till
  | { t: 'maintenance'; item: Maintenance | Partial<Maintenance> }   // underhåll: ändra eller lägg till
  | { t: 'review' }                                   // Att granska: kvittorader AI:n var osäker på
  | { t: 'stat'; title: string }   // detaljvyn för ett statistikkort
  | { t: 'loans'; id: string | null }                 // övriga lån: redigera det valda eller lägg till (null)
  | { t: 'mortgage' }                                 // bolånet: skulden i dag, uppgifterna och räntekalkylatorn
  | { t: 'el' }                                       // elpriset: dagens kurva, kostnad att köra maskiner och egna avgifter
  | { t: 'cost' }                                     // Ren månadskostnad: ränta efter avdrag, avgift och drift
  | { t: 'budget' }                                   // kassaflödet: lönen, fördelningen och snabbinmatning
  | { t: 'roomInfo'; room: Room }
  | { t: 'add' }
  | { t: 'picked' }
  | { t: 'more' }

export interface ViewProps {
  state: ProjectState
  open: (s: SheetState) => void
}
