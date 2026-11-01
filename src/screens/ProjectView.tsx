import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import {
  IconArrowLeft, IconBulb, IconCamera, IconChecklist, IconDots, IconFolder, IconFolderPlus, IconHome, IconLayoutGrid,
  IconPhoto, IconReceipt, IconSettings, IconShoppingCart,
} from '@tabler/icons-react'
import { api, type User } from '../lib/api'
import { useProject } from '../lib/useProject'
import { NavItem, Shell, type Tab } from '../components/Shell'
import { Chips, Loader, Sheet, ease } from '../components/ui'
import type { Folder, Idea, Purchase, Room, Task } from '../types'
import { AddRoomSheet, Overview, RoomSheet } from './tabs/Overview'
import { PurchaseSheet, Purchases, type PurchaseDraft } from './tabs/Purchases'
import { TaskSheet, type TaskDraft } from './tabs/Tasks'
import { FolderSheet, Folders } from './tabs/Folders'
import { IdeaSheet, Ideas, type IdeaDraft } from './tabs/Ideas'
import { Photos, UploadSheet } from './tabs/Photos'
import { Settings } from './tabs/Settings'

type ViewId = 'overview' | 'folders' | 'purchases' | 'ideas' | 'photos' | 'settings'
const VIEWS: { id: ViewId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'overview', label: 'Översikt', icon: IconLayoutGrid },
  { id: 'folders', label: 'Mappar', icon: IconFolder },
  { id: 'purchases', label: 'Inköp', icon: IconShoppingCart },
  { id: 'ideas', label: 'Idéer', icon: IconBulb },
  { id: 'photos', label: 'Foton', icon: IconPhoto },
  { id: 'settings', label: 'Inställningar', icon: IconSettings },
]

export type ProjectState = ReturnType<typeof useProject>

// Alla formulär och paneler öppnas härifrån, så att de kan nås från vilken vy som helst.
export type SheetState =
  | { t: 'purchase'; item: Purchase | PurchaseDraft; receipt?: boolean }
  | { t: 'task'; item: Task | TaskDraft }
  | { t: 'idea'; item: Idea | IdeaDraft }
  | { t: 'convert'; idea: Idea }
  | { t: 'folder'; item?: Folder }
  | { t: 'photo' }
  | { t: 'room' }
  | { t: 'roomInfo'; room: Room }
  | { t: 'add' }
  | { t: 'more' }

export interface ViewProps {
  state: ProjectState
  room: string | null
  open: (s: SheetState) => void
}

export function ProjectView({ pid, user, onBack }: { pid: string; user: User; onBack: () => void }) {
  const state = useProject(pid)
  const [view, setView] = useState<ViewId>('overview')
  const [room, setRoom] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  // Ett rum kan vara öppet under ett formulär (t.ex. ett inköp man trycker på inne i rummet).
  const [roomInfo, setRoomInfo] = useState<Room | null>(null)

  if (!state.loading && !state.project) {
    return (
      <div className="auth">
        <main className="main empty">
          <h1>Hemmet finns inte</h1>
          <button className="btn btn--secondary" onClick={onBack}>Till mina hem</button>
        </main>
      </div>
    )
  }

  const go = (to: ViewId) => {
    setView(to)
    setSheet(null)
    if (to !== 'folders') setFolder(null)
  }
  const open = (s: SheetState) => {
    if (s.t === 'roomInfo') return setRoomInfo(s.room)
    setSheet(s)
  }
  const close = () => setSheet(null)
  const openFolder = (id: string) => {
    setFolder(id)
    setView('folders')
  }

  // Nya saker hamnar i den mapp eller det rum man står i.
  const here = { folder_id: view === 'folders' ? folder : null, room_id: view === 'purchases' || view === 'ideas' || view === 'photos' ? room : null }
  const props: ViewProps = { state, room, open }
  const filter = <Chips value={room} onChange={setRoom} options={[{ value: null, label: 'Alla rum' }, ...state.rooms.map((r) => ({ value: r.id as string | null, label: r.name }))]} />

  const tabs: Tab[] = [
    { id: 'overview', label: 'Översikt', icon: IconLayoutGrid, active: view === 'overview', onClick: () => go('overview') },
    { id: 'folders', label: 'Mappar', icon: IconFolder, active: view === 'folders', onClick: () => { setFolder(null); go('folders') } },
    { id: 'purchases', label: 'Inköp', icon: IconShoppingCart, active: view === 'purchases', onClick: () => go('purchases') },
    { id: 'more', label: 'Mer', icon: IconDots, active: ['ideas', 'photos', 'settings'].includes(view), onClick: () => open({ t: 'more' }) },
  ]

  const addRows = [
    { icon: IconReceipt, title: 'Kvitto', meta: 'Fota kvittot från något du köpt', on: () => open({ t: 'purchase', item: { ...here }, receipt: true }) },
    { icon: IconShoppingCart, title: 'Inköp', meta: 'Något du ska köpa', on: () => open({ t: 'purchase', item: { ...here } }) },
    { icon: IconChecklist, title: 'Jobb', meta: 'Något som ska göras', on: () => open({ t: 'task', item: { ...here } }) },
    { icon: IconBulb, title: 'Idé', meta: 'Med bild eller länk', on: () => open({ t: 'idea', item: { ...here } }) },
    { icon: IconCamera, title: 'Foto', meta: 'Före, efter eller inspiration', on: () => open({ t: 'photo' }) },
    { icon: IconFolderPlus, title: 'Mapp', meta: 'Samla ett projekt, t.ex. Köksrenovering', on: () => open({ t: 'folder' }) },
    { icon: IconHome, title: 'Rum', meta: 'Till planritningen och filtren', on: () => open({ t: 'room' }) },
  ]

  return (
    <Shell
      user={user}
      home={state.project ? { name: state.project.name, onClick: onBack } : undefined}
      onAdd={() => open({ t: 'add' })}
      onAvatar={() => go('settings')}
      tabs={tabs}
      nav={
        <>
          <NavItem icon={IconArrowLeft} label="Mina hem" onClick={onBack} />
          {VIEWS.map((v) => (
            <NavItem key={v.id} icon={v.icon} label={v.label} active={view === v.id} onClick={() => { if (v.id === 'folders') setFolder(null); go(v.id) }} />
          ))}
        </>
      }
    >
      {state.loading ? (
        <Loader />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={view + (folder ?? '')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease }}>
            {view === 'overview' && <Overview {...props} openFolder={openFolder} />}
            {view === 'folders' && <Folders {...props} folder={folder} setFolder={setFolder} />}
            {view === 'purchases' && <Purchases {...props} filter={filter} />}
            {view === 'ideas' && <Ideas {...props} filter={filter} />}
            {view === 'photos' && <Photos {...props} filter={filter} />}
            {view === 'settings' && <Settings {...props} user={user} onDeleted={onBack} />}
          </motion.div>
        </AnimatePresence>
      )}

      {state.project && (
        <>
          <RoomSheet room={roomInfo} state={state} open={open} onClose={() => setRoomInfo(null)} />
          <PurchaseSheet item={sheet?.t === 'purchase' ? sheet.item : sheet?.t === 'convert' ? { title: sheet.idea.title, room_id: sheet.idea.room_id, folder_id: sheet.idea.folder_id, link: sheet.idea.link, note: sheet.idea.note } : null}
            receiptMode={sheet?.t === 'purchase' && sheet.receipt}
            title={sheet?.t === 'convert' ? 'Gör till inköp' : undefined}
            state={state}
            onClose={async (saved) => {
              // En idé som blivit inköp behövs inte längre bland idéerna.
              if (saved && sheet?.t === 'convert') {
                await api.remove('ideas', sheet.idea.id)
                state.reload()
              }
              close()
            }}
          />
          <TaskSheet item={sheet?.t === 'task' ? sheet.item : null} state={state} onClose={close} />
          <IdeaSheet item={sheet?.t === 'idea' ? sheet.item : null} state={state} onClose={close} onConvert={(idea) => open({ t: 'convert', idea })} />
          <FolderSheet item={sheet?.t === 'folder' ? sheet.item ?? 'new' : null} state={state} onClose={close} onCreated={(id) => { close(); openFolder(id) }} />
          <UploadSheet open={sheet?.t === 'photo'} onClose={close} state={state} room={room} />
          <AddRoomSheet open={sheet?.t === 'room'} onClose={close} state={state} />

          <Sheet open={sheet?.t === 'add'} onClose={close} title="Lägg till">
            <div className="rows">
              {addRows.map((r) => (
                <div key={r.title} className="row" onClick={r.on}>
                  <div className="row__main">
                    <span className="menu-row__icon"><r.icon size={18} /></span>
                    <div className="row__text"><div className="row__title">{r.title}</div><div className="meta">{r.meta}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </Sheet>

          <Sheet open={sheet?.t === 'more'} onClose={close} title="Mer">
            <div className="rows">
              {VIEWS.filter((v) => ['ideas', 'photos', 'settings'].includes(v.id)).map((v) => (
                <div key={v.id} className="row" onClick={() => go(v.id)}>
                  <div className="row__main"><span className="menu-row__icon"><v.icon size={18} /></span><div className="row__title">{v.label}</div></div>
                </div>
              ))}
              <div className="row" onClick={onBack}>
                <div className="row__main"><span className="menu-row__icon"><IconArrowLeft size={18} /></span><div className="row__title">Mina hem</div></div>
              </div>
            </div>
          </Sheet>
        </>
      )}
    </Shell>
  )
}
