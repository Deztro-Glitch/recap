import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IconBuilding, IconChevronRight, IconHome, IconHomeEco, IconLogout } from '@tabler/icons-react'
import { api, type User } from '../lib/api'
import { kr, parseNum } from '../lib/format'
import { Chips, Field, Loader, More, Primary, Sheet, rowAnim, useToast } from '../components/ui'
import { NavItem, Shell } from '../components/Shell'
import { KIND_LABEL, ROOM_PRESETS, type Kind, type Project } from '../types'

const KIND_ICON = { lagenhet: IconBuilding, hus: IconHome, annat: IconHomeEco }

export function Projects({ user, onOpen }: { user: User; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.listProjects().then(setProjects)
  }, [])

  const shown = projects

  return (
    <Shell
      user={user}
      nav={<NavItem icon={IconHome} label="Mina hem" active onClick={() => {}} />}
      navFoot={<NavItem icon={IconLogout} label="Logga ut" onClick={() => api.signOut()} />}
    >
      <div className="section-head">
        <h1>Mina hem</h1>
        {!!projects?.length && <Primary onClick={() => setCreating(true)}>Lägg till hem</Primary>}
      </div>

      {!projects ? (
        <Loader />
      ) : projects.length === 0 ? (
        <div className="empty">
          <h2>Inga hem än</h2>
          <Primary onClick={() => setCreating(true)}>Lägg till hem</Primary>
        </div>
      ) : (
        <div className="rows">
          <AnimatePresence initial={false}>
            {shown!.map((p) => {
              const Icon = KIND_ICON[p.kind]
              return (
                <motion.div key={p.id} {...rowAnim} className="row" onClick={() => onOpen(p.id)}>
                  <div className="row__main">
                    <Icon size={20} />
                    <div className="row__text">
                      <div className="row__title">{p.name}</div>
                      <div className="meta">{[KIND_LABEL[p.kind], p.address].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  {p.budget > 0 && <span className="row__amount">{kr(p.budget)}</span>}
                  <IconChevronRight size={18} />
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <NewProjectSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          setCreating(false)
          onOpen(p.id)
        }}
      />
    </Shell>
  )
}

function NewProjectSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Project) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>('lagenhet')
  const [address, setAddress] = useState('')
  const [budget, setBudget] = useState('')
  const [rooms, setRooms] = useState<string[]>(['Kök', 'Vardagsrum', 'Sovrum', 'Badrum', 'Hall'])
  const [busy, setBusy] = useState(false)

  const toggle = (r: string) => setRooms((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const p = await api.createProject({ name: name.trim(), kind, address: address.trim() || null, budget: parseNum(budget), mode: 'full' })
      await Promise.all(
        ROOM_PRESETS.filter((r) => rooms.includes(r.name)).map((r, i) =>
          api.insert('rooms', { project_id: p.id, name: r.name, icon: r.icon, color: r.color, sort: i }),
        ),
      )
      onCreated(p)
    } catch (err: any) {
      toast({ title: 'Hemmet kunde inte skapas', body: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nytt hem">
      <form className="form" onSubmit={submit}>
        <Field label="Namn">
          <input className="input" placeholder="Tvåan på Södermannagatan" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="field">
          <span className="field__label">Typ</span>
          <Chips value={kind} onChange={setKind} options={(['lagenhet', 'hus', 'annat'] as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </div>
        <More>
          <Field label="Adress">
            <input className="input" placeholder="Södermannagatan 12, Stockholm" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Budget i kr">
            <input className="input" inputMode="numeric" placeholder="150 000" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <div className="field">
            <span className="field__label">Rum</span>
            <div className="chips">
              {ROOM_PRESETS.map((r) => (
                <button type="button" key={r.name} className={`chip ${rooms.includes(r.name) ? 'is-active' : ''}`} onClick={() => toggle(r.name)}>
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        </More>
        <div className="form__actions">
          <Primary disabled={busy || !name.trim()}>Skapa hem</Primary>
        </div>
      </form>
    </Sheet>
  )
}
