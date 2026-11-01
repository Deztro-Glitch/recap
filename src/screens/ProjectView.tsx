import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import {
  IconArrowLeft, IconBulb, IconCamera, IconChecklist, IconDots, IconFolder, IconFolderPlus, IconHome, IconLayoutGrid,
  IconList, IconPhoto, IconReceipt, IconSettings, IconShoppingCart,
} from '@tabler/icons-react'
import { api, type User } from '../lib/api'
import { useProject } from '../lib/useProject'
import { NavItem, Shell, type Tab } from '../components/Shell'
import { Chips, Field, Loader, Sheet, ease, useToast } from '../components/ui'
import type { Folder, Idea, PhotoKind, Purchase, Room, Task } from '../types'
import { AddRoomSheet, Overview, RoomSheet } from './tabs/Overview'
import { PurchaseSheet, Purchases, fmtDate, today, type PurchaseDraft } from './tabs/Purchases'
import { TaskSheet, type TaskDraft } from './tabs/Tasks'
import { FolderSheet, Folders } from './tabs/Folders'
import { IdeaSheet, Ideas, type IdeaDraft } from './tabs/Ideas'
import { Photos, UploadSheet } from './tabs/Photos'
import { Settings } from './tabs/Settings'
import { Log } from './tabs/Log'

type ViewId = 'log' | 'overview' | 'folders' | 'purchases' | 'ideas' | 'photos' | 'settings'
const VIEWS: { id: ViewId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'log', label: 'Logg', icon: IconList },
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
  | { t: 'receipt'; item?: PurchaseDraft }
  | { t: 'task'; item: Task | TaskDraft }
  | { t: 'idea'; item: Idea | IdeaDraft }
  | { t: 'convert'; idea: Idea }
  | { t: 'folder'; item?: Folder }
  | { t: 'photo' }
  | { t: 'room' }
  | { t: 'roomInfo'; room: Room }
  | { t: 'add' }
  | { t: 'picked' }
  | { t: 'more' }

export interface ViewProps {
  state: ProjectState
  room: string | null
  open: (s: SheetState) => void
}

export function ProjectView({ pid, user, onBack }: { pid: string; user: User; onBack: () => void }) {
  const state = useProject(pid)
  const [view, setView] = useState<ViewId>('log')
  const [room, setRoom] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  // Ett rum kan vara öppet under ett formulär (t.ex. ett inköp man trycker på inne i rummet).
  const [roomInfo, setRoomInfo] = useState<Room | null>(null)
  const toast = useToast()
  const receiptInput = useRef<HTMLInputElement>(null)
  const receiptDefaults = useRef<PurchaseDraft>({})
  const [saving, setSaving] = useState(0)
  // Plusknappen öppnar kameran direkt. Vad bilden är väljer man efteråt.
  const photoInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File[]>([])
  const [pickedRoom, setPickedRoom] = useState('')

  // Stänger man kameran utan bild vill man troligen skriva in något i stället.
  useEffect(() => {
    const el = photoInput.current
    const onCancel = () => setSheet({ t: 'add' })
    el?.addEventListener('cancel', onCancel)
    return () => el?.removeEventListener('cancel', onCancel)
  }, [state.loading])

  // Kvitton: fota först, fyll i sen. Bilden sparas direkt som ett köp, och formuläret öppnas
  // för den som vill fylla i belopp och butik på en gång.
  const onReceipts = async (files: FileList | File[] | null) => {
    if (!files?.length || !state.project) return
    const list = Array.from(files)
    setSaving(list.length)
    try {
      const created: Purchase[] = []
      for (const file of list) {
        const path = await api.uploadFile(state.project.id, file)
        created.push(
          await api.insert<Purchase>('purchases', {
            project_id: state.project.id, room_id: null, folder_id: null, ...receiptDefaults.current,
            title: `Kvitto ${fmtDate(today())}`, est_price: 0, price: null, bought: true, bought_on: today(),
            receipt_path: path, priority: 2, stays: false, store: null, link: null, note: null, details: null,
          }),
        )
        setSaving((n) => n - 1)
      }
      await state.reload()
      if (created.length === 1) setSheet({ t: 'purchase', item: { ...created[0] } })
      else toast({ title: `${created.length} kvitton är sparade`, body: 'Fyll i beloppen när du hinner.' })
    } catch (err: any) {
      toast({ title: 'Kvittot kunde inte sparas', body: err.message })
    } finally {
      setSaving(0)
      if (receiptInput.current) receiptInput.current.value = ''
    }
  }

  const onPicked = (files: FileList | null) => {
    if (!files?.length) return
    setPicked(Array.from(files))
    setPickedRoom(here.room_id ?? '')
    setSheet({ t: 'picked' })
    if (photoInput.current) photoInput.current.value = ''
  }

  // Vad bilderna var: kvitton blir köp i loggen, före/efter hamnar på rummet, idéer bland idéerna.
  const savePicked = async (as: 'receipt' | PhotoKind | 'idea') => {
    const files = picked
    const room_id = pickedRoom || null
    setSheet(null)
    setPicked([])
    if (as === 'receipt') {
      receiptDefaults.current = { ...here, room_id }
      return onReceipts(files)
    }
    setSaving(files.length)
    try {
      if (as === 'idea') {
        let last: Idea | null = null
        for (const file of files) {
          const image_path = await api.uploadFile(state.project!.id, file)
          last = await api.insert<Idea>('ideas', { project_id: state.project!.id, room_id, folder_id: here.folder_id, title: 'Ny idé', note: null, link: null, image_path })
          setSaving((n) => n - 1)
        }
        await state.reload()
        if (files.length === 1 && last) setSheet({ t: 'idea', item: last })
        else toast(`${files.length} idéer är sparade`)
      } else {
        for (const file of files) {
          await api.uploadPhoto(state.project!.id, file, room_id, as)
          setSaving((n) => n - 1)
        }
        await state.reload()
        toast(files.length === 1 ? 'Bilden är sparad' : `${files.length} bilder är sparade`)
      }
    } catch (err: any) {
      toast({ title: 'Bilden kunde inte sparas', body: err.message })
    } finally {
      setSaving(0)
    }
  }

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
    if (s.t === 'receipt') {
      // Kameran/bildväljaren måste öppnas direkt i trycket.
      receiptDefaults.current = s.item ?? {}
      setSheet(null)
      return receiptInput.current?.click()
    }
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

  // I läget "Inköp och kvitton" döljs mappar och jobb helt.
  const simple = state.project?.mode === 'simple'
  const views = VIEWS.filter((v) => !(simple && v.id === 'folders'))
  const moreViews: ViewId[] = simple ? ['ideas', 'photos', 'settings'] : ['folders', 'ideas', 'photos', 'settings']

  const tabs: Tab[] = [
    { id: 'log', label: 'Logg', icon: IconList, active: view === 'log', onClick: () => go('log') },
    { id: 'overview', label: 'Översikt', icon: IconLayoutGrid, active: view === 'overview', onClick: () => go('overview') },
    { id: 'purchases', label: 'Inköp', icon: IconShoppingCart, active: view === 'purchases', onClick: () => go('purchases') },
    { id: 'more', label: 'Mer', icon: IconDots, active: moreViews.includes(view), onClick: () => open({ t: 'more' }) },
  ]

  const addRows = [
    { icon: IconCamera, title: 'Bild eller kvitto', meta: 'Fota, välj sen vad det är', on: () => photoInput.current?.click() },
    { icon: IconShoppingCart, title: 'Inköp', meta: 'Något du ska köpa', on: () => open({ t: 'purchase', item: { ...here } }) },
    ...(simple ? [] : [{ icon: IconChecklist, title: 'Jobb', meta: 'Något som ska göras', on: () => open({ t: 'task', item: { ...here } }) }]),
    { icon: IconBulb, title: 'Idé', meta: 'Med bild eller länk', on: () => open({ t: 'idea', item: { ...here } }) },
    ...(simple ? [] : [{ icon: IconFolderPlus, title: 'Mapp', meta: 'Samla ett projekt, t.ex. Köksrenovering', on: () => open({ t: 'folder' }) }]),
    { icon: IconHome, title: 'Rum', meta: 'Till planritningen och filtren', on: () => open({ t: 'room' }) },
  ]

  return (
    <Shell
      user={user}
      home={state.project ? { name: state.project.name, onClick: onBack } : undefined}
      onAdd={() => open({ t: 'add' })}
      onTabAdd={() => photoInput.current?.click()}
      onAvatar={() => go('settings')}
      tabs={tabs}
      nav={
        <>
          <NavItem icon={IconArrowLeft} label="Mina hem" onClick={onBack} />
          {views.map((v) => (
            <NavItem key={v.id} icon={v.icon} label={v.label} active={view === v.id} onClick={() => { if (v.id === 'folders') setFolder(null); go(v.id) }} />
          ))}
        </>
      }
    >
      <input ref={photoInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onPicked(e.target.files)} />
      <input ref={receiptInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onReceipts(e.target.files)} />
      {saving > 0 && (
        <div className="saving">
          <Loader />
          <span className="status status--sent">Sparar {saving === 1 ? 'en fil' : `${saving} filer`}</span>
        </div>
      )}
      {state.loading ? (
        <Loader />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={view + (folder ?? '')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease }}>
            {view === 'log' && <Log {...props} onAdd={() => open({ t: 'add' })} onPhotos={(r) => { setRoom(r); go('photos') }} />}
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

          <Sheet open={sheet?.t === 'picked'} onClose={() => { close(); setPicked([]) }} title={picked.length > 1 ? `Vad är de ${picked.length} bilderna?` : 'Vad är bilden?'}>
            <div className="form">
              {picked.length === 1 && picked[0].type.startsWith('image/') && <PickedPreview file={picked[0]} />}
              {state.rooms.length > 0 && (
                <Field label="Rum">
                  <select className="select" value={pickedRoom} onChange={(e) => setPickedRoom(e.target.value)}>
                    <option value="">Inget rum</option>
                    {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
              )}
              <div className="rows">
                {pickedRows.filter((r) => r.as === 'receipt' || picked.every((f) => f.type.startsWith('image/'))).map((r) => (
                  <div key={r.as} className="row" onClick={() => savePicked(r.as)}>
                    <div className="row__main">
                      <span className="menu-row__icon"><r.icon size={18} /></span>
                      <div className="row__text"><div className="row__title">{r.title}</div><div className="meta">{r.meta}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Sheet>

          <Sheet open={sheet?.t === 'more'} onClose={close} title="Mer">
            <div className="rows">
              {VIEWS.filter((v) => moreViews.includes(v.id)).map((v) => (
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

const pickedRows: { as: 'receipt' | PhotoKind | 'idea'; icon: React.ComponentType<{ size?: number }>; title: string; meta: string }[] = [
  { as: 'receipt', icon: IconReceipt, title: 'Kvitto', meta: 'Hamnar i loggen, fyll i belopp och butik' },
  { as: 'before', icon: IconPhoto, title: 'Före', meta: 'Hur rummet såg ut innan' },
  { as: 'after', icon: IconPhoto, title: 'Efter', meta: 'Hur det blev' },
  { as: 'idea', icon: IconBulb, title: 'Idé', meta: 'Inspiration till senare' },
]

function PickedPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url ? <img className="picked" src={url} alt="" /> : null
}
