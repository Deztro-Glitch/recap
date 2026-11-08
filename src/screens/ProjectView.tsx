import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import {
  IconArrowLeft, IconCamera, IconChecklist, IconCircleCheck, IconDots, IconFileText, IconHome, IconHomeCheck, IconLayoutGrid,
  IconHammer, IconList, IconPhoto, IconReceipt, IconScan, IconSettings, IconShoppingCart, IconTool, IconWallet,
} from '@tabler/icons-react'
import { api, type User } from '../lib/api'
import { useProject } from '../lib/useProject'
import { Shell, type Tab } from '../components/Shell'
import { PhotoBackdrop } from '../components/PhotoBackdrop'
import { Field, Loader, Sheet, ease, isMobile, useToast } from '../components/ui'
import type { PhotoKind, Purchase, Scope } from '../types'
import { AddRoomSheet } from './tabs/Rooms'
import { ItemSheet, Purchases } from './tabs/Items'
import { ContractSheet, Contracts, type ContractTab } from './tabs/Contracts'
import { Overview } from './tabs/Overview'
import { Today } from './tabs/Today'
import { EconomyView } from './tabs/Economy'
import { RenovationSheet } from './tabs/Renovations'
import { MaintenanceSheet } from './tabs/Maintenance'
import { activeRenovation } from '../lib/items'
import { StatDetail } from './tabs/StatDetail'
import { LoansSheet } from './tabs/Loans'
import { BudgetSheet } from './tabs/Budget'
import { MortgageSheet } from './tabs/Mortgage'
import { MonthlyCostSheet } from './tabs/MonthlyCost'
import { ElectricitySheet } from './tabs/Electricity'
import { ReviewSheet } from './tabs/Review'
import { fileImage, type FileResult } from '../lib/fileImage'
import { Settings } from './tabs/Settings'
import { Log } from './tabs/Log'

// Idag (startsidan), Ekonomi och Hemmet är huvuddelarna; Inköp, Logg, Avtal, Bostads-CV och Inställningar finns också.
type ViewId = 'today' | 'economy' | 'home' | 'log' | 'purchases' | 'contracts' | 'settings'
import type { ProjectState, SheetState, ViewProps } from './view'
export type { ProjectState, SheetState, ViewProps }

export function ProjectView({ pid, user, onBack }: { pid: string; user: User; onBack: () => void }) {
  const state = useProject(pid)
  const [view, setView] = useState<ViewId>('today')
  // Rummet som är valt i översikten.
  const [place, setPlace] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [contractTab, setContractTab] = useState<ContractTab>('contracts')
  const toast = useToast()
  const [saving, setSaving] = useState(0)
  // Bilder som AI:n läser och sorterar just nu.
  const [reading, setReading] = useState(0)
  // "receipt" när man valde Skanna kvitto, så att AI:n vet att det är ett kvitto.
  const hint = useRef<'receipt' | null>(null)
  // Fota direkt med kameran, eller välj bilder från biblioteket. Vad bilden är väljer man efteråt.
  const cameraInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File[]>([])
  const [pickedRoom, setPickedRoom] = useState('')
  const pickRoom = useRef<string | null | undefined>(undefined)

  // Läget färgar hela appen så länge hemmet är öppet.

  // Bilder sorteras av AI:n i bakgrunden, så att man kan gå vidare direkt. Kvitton sparas som köp (osäkra rader
  // hamnar i Att granska), foton på rum hamnar på rummet och saker man vill köpa blir planerade. Kan AI:n inte
  // avgöra vad bilden är frågar appen ("Vad är bilden?").
  const sortFiles = async (files: File[], hint: 'receipt' | null) => {
    if (!files.length || !state.project) return
    setReading((n) => n + files.length)
    const results: FileResult[] = []
    const unknown: File[] = []
    for (const file of files) {
      try {
        const r = await fileImage(state, file, hint)
        if (r.kind === 'unknown') unknown.push(file)
        else results.push(r)
      } catch (err: any) {
        toast({ title: 'Bilden kunde inte sparas', body: err.message })
      } finally {
        setReading((n) => n - 1)
      }
    }
    await state.reload()
    if (results.length) toast(summary(results))
    if (unknown.length) {
      setPicked(unknown)
      setPickedRoom(here.room_id ?? '')
      setSheet({ t: 'picked' })
    }
  }

  const onPicked = (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    const h = hint.current
    hint.current = null
    for (const el of [cameraInput.current, photoInput.current]) if (el) el.value = ''
    // Fotar man från ett rum (t.ex. Före/Efter i rummet) vet man redan vad det är.
    if (pickRoom.current !== undefined) {
      setPicked(list)
      setPickedRoom(pickRoom.current ?? '')
      pickRoom.current = undefined
      return setSheet({ t: 'picked' })
    }
    setSheet(null)
    sortFiles(list, h)
  }

  // Vad bilderna var: kvitton blir köp, före/efter hamnar på rummet, något man vill ha blir planerat.
  const savePicked = async (as: 'receipt' | PhotoKind | 'planned') => {
    const files = picked
    const room_id = pickedRoom || null
    setSheet(null)
    setPicked([])
    if (as === 'receipt') return sortFiles(files, 'receipt')
    setSaving(files.length)
    try {
      if (as === 'planned') {
        let last: Purchase | null = null
        for (const file of files) {
          const image_path = await api.uploadFile(state.project!.id, file)
          last = await api.insert<Purchase>('purchases', {
            project_id: state.project!.id, room_id, title: 'Nytt köp', image_path, est_price: 0, price: null, bought: false,
            bought_on: null, receipt_path: null, priority: 2, stays: false, k6: false, scope, store: null, link: null, note: null, details: null,
          })
          setSaving((n) => n - 1)
        }
        await state.reload()
        if (files.length === 1 && last) setSheet({ t: 'purchase', item: last })
        else toast(`${files.length} köp är planerade`)
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
  }
  const open = (s: SheetState) => {
    if (s.t === 'roomInfo') {
      go('home')
      return setPlace(s.room.id)
    }
    if (s.t === 'pick') {
      pickRoom.current = s.room_id
      setSheet(null)
      return cameraInput.current?.click()
    }
    setSheet(s)
  }
  const close = () => setSheet(null)

  // Nya saker hamnar i rummet som är valt i Hemmet. Från Hemmet blir nya köp renovering, annars boende.
  const here = { room_id: view === 'home' ? place : null }
  const scope: Scope = view === 'home' ? 'build' : 'home'
  // Renovering hamnar i projektet som pågår.
  const active = activeRenovation(state.renovations)
  const newItem = { ...here, scope, ...(scope === 'build' && active ? { renovation_id: active.id } : {}) }
  const props: ViewProps = { state, open }
  const showContracts = (tab: ContractTab) => {
    setContractTab(tab)
    go('contracts')
  }
  // Mer: på mobilen ligger Inköp och Logg här, på dator står de i menypillret.
  const mobile = isMobile()
  const moreViews: ViewId[] = mobile ? ['purchases', 'log', 'contracts', 'settings'] : ['contracts', 'settings']
  const moreRows = [
    ...(mobile ? [
      { id: 'purchases', icon: IconShoppingCart, label: 'Inköp', on: () => go('purchases') },
      { id: 'log', icon: IconList, label: 'Logg', on: () => go('log') },
    ] : []),
    { id: 'contracts', icon: IconFileText, label: 'Avtal', on: () => showContracts('contracts') },
    { id: 'cv', icon: IconHomeCheck, label: 'Bostads-CV', on: () => showContracts('cv') },
    { id: 'settings', icon: IconSettings, label: 'Inställningar', on: () => go('settings') },
  ]

  const tab = (id: ViewId, label: string, icon: Tab['icon']): Tab => ({ id, label, icon, active: view === id, onClick: () => go(id) })
  const more: Tab = { id: 'more', label: 'Mer', icon: IconDots, active: moreViews.includes(view), onClick: () => open({ t: 'more' }) }
  // Bottenmenyn på mobil: Idag, Ekonomi, plusknappen, Hemmet och Mer.
  const tabs: Tab[] = [tab('today', 'Idag', IconLayoutGrid), tab('economy', 'Ekonomi', IconWallet), tab('home', 'Hemmet', IconHome), more]
  // Menypillret på dator: huvuddelarna, Inköp och Logg. Avtal, Bostads-CV och Inställningar ligger under Mer.
  const nav: Tab[] = [tabs[0], tabs[1], tabs[2], tab('purchases', 'Inköp', IconShoppingCart), tab('log', 'Logg', IconList), more]

  const addRows = [
    { icon: IconScan, title: 'Skanna kvitto', on: () => { hint.current = 'receipt'; cameraInput.current?.click() } },
    { icon: IconCamera, title: 'Fota', on: () => { hint.current = null; cameraInput.current?.click() } },
    { icon: IconPhoto, title: 'Välj från bilder eller filer', on: () => { hint.current = null; photoInput.current?.click() } },
    { icon: IconChecklist, title: 'Planerat köp eller jobb', on: () => open({ t: 'purchase', item: newItem }) },
    { icon: IconCircleCheck, title: 'Klart köp eller jobb', on: () => open({ t: 'purchase', item: { ...newItem, bought: true } }) },
    { icon: IconFileText, title: 'Avtal', on: () => open({ t: 'contract', item: {} }) },
    { icon: IconHammer, title: 'Projekt', on: () => open({ t: 'renovation', item: {} }) },
    { icon: IconTool, title: 'Underhåll', on: () => open({ t: 'maintenance', item: {} }) },
    { icon: IconHome, title: 'Rum', on: () => open({ t: 'room' }) },
  ]

  return (
    <>
    <PhotoBackdrop path={state.project?.background_path ?? null} />
    <Shell
      user={user}
      home={state.project ? { name: state.project.name, onClick: onBack } : undefined}
      onAdd={() => open({ t: 'add' })}
      onAvatar={() => go('settings')}
      tabs={tabs}
      nav={nav}
    >
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPicked(e.target.files)} />
      <input ref={photoInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onPicked(e.target.files)} />
      {reading > 0 && (
        <div className="saving">
          <Loader />
          <span className="status status--sent">{reading === 1 ? 'AI:n läser bilden' : `AI:n läser ${reading} bilder`}</span>
        </div>
      )}
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
          <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease }}>
            {view === 'today' && <Today {...props} onCare={() => { setPlace(null); go('home') }} />}
            {view === 'economy' && <EconomyView {...props} />}
            {view === 'home' && <Overview {...props} place={place} setPlace={setPlace} />}
            {view === 'log' && <Log {...props} />}
            {view === 'purchases' && <Purchases {...props} />}
            {view === 'contracts' && <Contracts {...props} tab={contractTab} />}
            {view === 'settings' && <Settings {...props} user={user} onDeleted={onBack} />}
          </motion.div>
        </AnimatePresence>
      )}

      {state.project && (
        <>
          <ItemSheet
            table={sheet?.t === 'task' ? 'tasks' : 'purchases'}
            item={sheet?.t === 'purchase' || sheet?.t === 'task' ? sheet.item : null}
            state={state}
            onClose={close}
          />
          <ContractSheet item={sheet?.t === 'contract' ? sheet.item : null} state={state} onClose={close} />
          <AddRoomSheet open={sheet?.t === 'room'} onClose={close} state={state} />
          <StatDetail stat={sheet?.t === 'stat' ? sheet : null} onClose={close} />
          <LoansSheet open={sheet?.t === 'loans'} id={sheet?.t === 'loans' ? sheet.id : null} state={state} onClose={close} />
          <BudgetSheet open={sheet?.t === 'budget'} state={state} onClose={close} />
          <MortgageSheet open={sheet?.t === 'mortgage'} state={state} onClose={close} />
          <MonthlyCostSheet open={sheet?.t === 'cost'} state={state} onClose={close} />
          <ElectricitySheet open={sheet?.t === 'el'} state={state} onClose={close} />
          <ReviewSheet open={sheet?.t === 'review'} state={state} onClose={close} />
          <RenovationSheet item={sheet?.t === 'renovation' ? sheet.item : null} state={state} open={open} onClose={close} />
          <MaintenanceSheet item={sheet?.t === 'maintenance' ? sheet.item : null} state={state} onClose={close} />

          <Sheet open={sheet?.t === 'add'} onClose={close} title="Lägg till">
            <div className="rows">
              {addRows.map((r) => (
                <div key={r.title} className="row" onClick={r.on}>
                  <div className="row__main">
                    <span className="menu-row__icon"><r.icon size={18} /></span>
                    <div className="row__title">{r.title}</div>
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
                      <div className="row__title">{r.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Sheet>

          <Sheet open={sheet?.t === 'more'} onClose={close} title="Mer">
            <div className="rows">
              {moreRows.map((r) => (
                <div key={r.id} className="row" onClick={r.on}>
                  <div className="row__main"><span className="menu-row__icon"><r.icon size={18} /></span><div className="row__title">{r.label}</div></div>
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
    </>
  )
}

// Vad som blev av bilderna, i ett meddelande. Kvitton säger hur många rader som sparades och hur många att granska.
function summary(results: FileResult[]): { title: string; body?: string } {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  if (results.length === 1) {
    const r = results[0]
    if (r.kind === 'receipt') {
      return {
        title: `${r.store ?? 'Kvittot'}: ${n(r.saved, 'sak sparad', 'saker sparade')}`,
        body: [r.closed.length && `Stängde ${r.closed.join(', ')}.`, r.review && `${n(r.review, 'rad', 'rader')} att granska på Idag.`].filter(Boolean).join(' ') || undefined,
      }
    }
    if (r.kind === 'photo') return { title: r.room ? `Bilden är sparad i ${r.room}` : 'Bilden är sparad' }
    if (r.kind === 'planned') return { title: `${r.item.title} är planerat`, body: 'Under Inköp.' }
    if (r.kind === 'appliance') return { title: r.name, body: r.added.length ? `Underhåll: ${r.added.join(', ')}.` : 'Underhållet fanns redan.' }
  }
  const review = results.reduce((s, r) => s + (r.kind === 'receipt' ? r.review : 0), 0)
  return { title: `${n(results.length, 'bild', 'bilder')} sorterade`, body: review ? `${n(review, 'rad', 'rader')} att granska på Idag.` : undefined }
}

const pickedRows: { as: 'receipt' | PhotoKind | 'planned'; icon: React.ComponentType<{ size?: number }>; title: string }[] = [
  { as: 'receipt', icon: IconReceipt, title: 'Kvitto' },
  { as: 'before', icon: IconPhoto, title: 'Förebild' },
  { as: 'after', icon: IconPhoto, title: 'Efterbild' },
  { as: 'planned', icon: IconChecklist, title: 'Planerat köp' },
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
