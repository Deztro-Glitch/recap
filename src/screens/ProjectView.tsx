import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import {
  IconArrowLeft, IconCamera, IconChecklist, IconCircleCheck, IconDots, IconFileText, IconHome, IconHomeCheck, IconLayoutGrid,
  IconList, IconPhoto, IconReceipt, IconSettings, IconShoppingCart, IconWallet,
} from '@tabler/icons-react'
import { api, type User } from '../lib/api'
import { useProject } from '../lib/useProject'
import { applyMode } from '../lib/mode'
import { Shell, type Tab } from '../components/Shell'
import { Field, Loader, Sheet, ease, useToast } from '../components/ui'
import { modeScope, type Contract, type PhotoKind, type Purchase, type Room, type Task } from '../types'
import { AddRoomSheet } from './tabs/Rooms'
import { ItemSheet, Purchases, fmtDate, today } from './tabs/Items'
import { ContractSheet, Contracts, type ContractTab } from './tabs/Contracts'
import { Overview } from './tabs/Overview'
import { EconomySheet } from './tabs/Economy'
import { StatDetail } from './tabs/StatDetail'
import { LoansSheet } from './tabs/Loans'
import { BudgetSheet } from './tabs/Budget'
import { MortgageSheet } from './tabs/Mortgage'
import { ReceiptReview } from './tabs/ReceiptReview'
import { Settings } from './tabs/Settings'
import { Log } from './tabs/Log'

type ViewId = 'overview' | 'log' | 'purchases' | 'contracts' | 'settings'
export type ProjectState = ReturnType<typeof useProject>

// Alla formulär och paneler öppnas härifrån, så att de kan nås från vilken vy som helst.
export type SheetState =
  | { t: 'purchase'; item: Partial<Purchase> }
  | { t: 'receipt'; item?: Partial<Purchase> }
  | { t: 'task'; item: Task }
  | { t: 'contract'; item: Contract | Partial<Contract> }
  | { t: 'pick'; room_id?: string | null }   // kameran, med ett rum förvalt
  | { t: 'room' }
  | { t: 'economy' }
  | { t: 'stat'; title: string; economy?: boolean }   // detaljvyn för ett statistikkort
  | { t: 'loans'; id: string | null }                 // övriga lån: redigera det valda eller lägg till (null)
  | { t: 'mortgage' }                                 // bolånet: skulden i dag, uppgifterna och räntekalkylatorn
  | { t: 'budget' }                                   // kassaflödet: lönen, fördelningen och snabbinmatning
  | { t: 'roomInfo'; room: Room }
  | { t: 'add' }
  | { t: 'picked' }
  | { t: 'more' }

export interface ViewProps {
  state: ProjectState
  open: (s: SheetState) => void
}

export function ProjectView({ pid, user, onBack }: { pid: string; user: User; onBack: () => void }) {
  const state = useProject(pid)
  const [view, setView] = useState<ViewId>('overview')
  // Rummet som är valt i översikten.
  const [place, setPlace] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [contractTab, setContractTab] = useState<ContractTab>('contracts')
  const toast = useToast()
  const receiptInput = useRef<HTMLInputElement>(null)
  const receiptDefaults = useRef<Partial<Purchase>>({})
  const [saving, setSaving] = useState(0)
  // Ett fotat kvitto granskas rad för rad innan det sparas.
  const [reviewFile, setReviewFile] = useState<File | null>(null)
  // Fota direkt med kameran, eller välj bilder från biblioteket. Vad bilden är väljer man efteråt.
  const cameraInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File[]>([])
  const [pickedRoom, setPickedRoom] = useState('')
  const pickRoom = useRef<string | null | undefined>(undefined)

  // Läget färgar hela appen så länge hemmet är öppet.
  const mode = state.project?.mode
  useEffect(() => {
    if (mode) applyMode(mode)
  }, [mode])
  useEffect(() => () => applyMode(null), [])
  const scope = modeScope(mode)

  // Kvitton: fota först, fyll i sen. Bilden sparas direkt som ett köp, och formuläret öppnas
  // för den som vill fylla i belopp och butik på en gång.
  const onReceipts = async (files: FileList | File[] | null) => {
    if (!files?.length || !state.project) return
    const list = Array.from(files)
    if (list.length === 1 && list[0].type.startsWith('image/')) {
      if (receiptInput.current) receiptInput.current.value = ''
      return setReviewFile(list[0])
    }
    setSaving(list.length)
    try {
      const created: Purchase[] = []
      for (const file of list) {
        const path = await api.uploadFile(state.project.id, file)
        created.push(
          await api.insert<Purchase>('purchases', {
            project_id: state.project.id, room_id: null, ...receiptDefaults.current,
            title: `Kvitto ${fmtDate(today())}`, est_price: 0, price: null, bought: true, bought_on: today(),
            receipt_path: path, priority: 2, stays: false, k6: false, scope, store: null, link: null, note: null, details: null,
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
    setPickedRoom((pickRoom.current !== undefined ? pickRoom.current : here.room_id) ?? '')
    pickRoom.current = undefined
    setSheet({ t: 'picked' })
    for (const el of [cameraInput.current, photoInput.current]) if (el) el.value = ''
  }

  // Vad bilderna var: kvitton blir köp, före/efter hamnar på rummet, något man vill ha blir planerat.
  const savePicked = async (as: 'receipt' | PhotoKind | 'planned') => {
    const files = picked
    const room_id = pickedRoom || null
    setSheet(null)
    setPicked([])
    if (as === 'receipt') {
      receiptDefaults.current = { room_id }
      return onReceipts(files)
    }
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
      go('overview')
      return setPlace(s.room.id)
    }
    if (s.t === 'pick') {
      pickRoom.current = s.room_id
      setSheet(null)
      return cameraInput.current?.click()
    }
    if (s.t === 'receipt') {
      // Kameran/bildväljaren måste öppnas direkt i trycket.
      receiptDefaults.current = s.item ?? {}
      setSheet(null)
      return receiptInput.current?.click()
    }
    setSheet(s)
  }
  const close = () => setSheet(null)

  // Nya saker hamnar i rummet som är valt i översikten.
  const here = { room_id: view === 'overview' ? place : null }
  const props: ViewProps = { state, open }
  const moreViews: ViewId[] = ['contracts', 'settings']
  const showContracts = (tab: ContractTab) => {
    setContractTab(tab)
    go('contracts')
  }
  const moreRows = [
    { id: 'contracts', icon: IconFileText, label: 'Avtal', on: () => showContracts('contracts') },
    { id: 'cv', icon: IconHomeCheck, label: 'Bostads-CV', on: () => showContracts('cv') },
    { id: 'economy', icon: IconWallet, label: 'Ekonomi', on: () => open({ t: 'economy' }) },
    { id: 'settings', icon: IconSettings, label: 'Inställningar', on: () => go('settings') },
  ]

  const tabs: Tab[] = [
    { id: 'overview', label: 'Översikt', icon: IconLayoutGrid, active: view === 'overview', onClick: () => go('overview') },
    { id: 'log', label: 'Logg', icon: IconList, active: view === 'log', onClick: () => go('log') },
    { id: 'purchases', label: 'Inköp', icon: IconShoppingCart, active: view === 'purchases', onClick: () => go('purchases') },
    { id: 'more', label: 'Mer', icon: IconDots, active: moreViews.includes(view), onClick: () => open({ t: 'more' }) },
  ]

  // Menypillret på dator: huvudvyerna, Avtal och Bostads-CV. Ekonomi och Inställningar ligger under Mer.
  const nav: Tab[] = [
    tabs[0], tabs[1], tabs[2],
    { id: 'contracts', label: 'Avtal', icon: IconFileText, active: view === 'contracts' && contractTab === 'contracts', onClick: () => showContracts('contracts') },
    { id: 'cv', label: 'Bostads-CV', icon: IconHomeCheck, active: view === 'contracts' && contractTab === 'cv', onClick: () => showContracts('cv') },
    { ...tabs[3], active: view === 'settings' },
  ]

  const addRows = [
    { icon: IconCamera, title: 'Fota kvitto eller bild', on: () => cameraInput.current?.click() },
    { icon: IconPhoto, title: 'Välj från bilder eller filer', on: () => photoInput.current?.click() },
    { icon: IconChecklist, title: 'Planerat köp eller jobb', on: () => open({ t: 'purchase', item: { ...here, scope } }) },
    { icon: IconCircleCheck, title: 'Klart köp eller jobb', on: () => open({ t: 'purchase', item: { ...here, scope, bought: true } }) },
    { icon: IconFileText, title: 'Avtal', on: () => open({ t: 'contract', item: {} }) },
    { icon: IconHome, title: 'Rum', on: () => open({ t: 'room' }) },
  ]

  return (
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
          <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease }}>
            {view === 'overview' && <Overview {...props} place={place} setPlace={setPlace} />}
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
          <EconomySheet open={sheet?.t === 'economy'} onClose={close} state={state} />
          <StatDetail stat={sheet?.t === 'stat' ? sheet : null} onClose={close} onEdit={() => open({ t: 'economy' })} />
          <LoansSheet open={sheet?.t === 'loans'} id={sheet?.t === 'loans' ? sheet.id : null} state={state} onClose={close} />
          <BudgetSheet open={sheet?.t === 'budget'} state={state} onClose={close} />
          <MortgageSheet open={sheet?.t === 'mortgage'} state={state} onClose={close} />
          <ReceiptReview file={reviewFile} defaultRoom={receiptDefaults.current.room_id ?? null} state={state} onClose={() => setReviewFile(null)} />

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
  )
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
