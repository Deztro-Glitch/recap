import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { kr, parseNum } from '../../lib/format'
import { totals } from '../../lib/useProject'
import { ICONS, iconFor } from '../../components/icons'
import { Checkbox, Chips, Field, Primary, Sheet, ease, useToast } from '../../components/ui'
import { FileThumb } from '../../components/FileField'
import { FOLDER_TEMPLATES, PALETTE, tileStyle, type Folder, type IconKey, type Palette } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { PurchaseRow } from './Purchases'
import { TaskRow } from './Tasks'

export const COLOR_LABEL: Record<Palette, string> = { sand: 'Sand', coral: 'Korall', steel: 'Stål', sun: 'Sol', mint: 'Mint', sky: 'Himmel', lilac: 'Syren', rose: 'Ros' }

export function FolderTiles({ state, onOpen }: { state: ProjectState; onOpen: (id: string) => void }) {
  return (
    <div className="tiles">
      {state.folders.map((f, i) => {
        const s = totals(state.purchases.filter((p) => p.folder_id === f.id), state.tasks.filter((t) => t.folder_id === f.id))
        const Icon = iconFor(f.icon)
        return (
          <motion.button key={f.id} className="tile" style={tileStyle(f.color)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: i * 0.03, ease }} onClick={() => onOpen(f.id)}>
            <div className="tile__name">{f.name}</div>
            <div className="tile__meta">{s.items ? `${s.done} av ${s.items} klart` : 'Tom'}</div>
            {(s.spent > 0 || f.budget) && <div className="tile__meta">{kr(s.spent)}{f.budget ? ` av ${kr(f.budget)}` : ''}</div>}
            <Icon className="tile__icon" />
          </motion.button>
        )
      })}
    </div>
  )
}

export function Folders({ state, open, folder, setFolder }: ViewProps & { folder: string | null; setFolder: (id: string | null) => void }) {
  const f = state.folders.find((x) => x.id === folder)
  if (f) return <FolderDetail f={f} state={state} open={open} onBack={() => setFolder(null)} />

  const loose = state.tasks.filter((t) => !t.folder_id)
  return (
    <div>
      <div className="section">
        <div className="section-head">
          <h1>Mappar</h1>
          <button className="btn btn--secondary" onClick={() => open({ t: 'folder' })}>Ny mapp</button>
        </div>
        {state.folders.length ? (
          <FolderTiles state={state} onOpen={setFolder} />
        ) : (
          <div className="empty" style={{ padding: 0 }}>
            <h3>Inga mappar än</h3>
          </div>
        )}
      </div>

      {loose.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Jobb utan mapp</h2></div>
          <div className="rows">
            {loose.map((t) => <TaskRow key={t.id} t={t} state={state} onEdit={() => open({ t: 'task', item: t })} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function FolderDetail({ f, state, open, onBack }: { f: Folder; state: ProjectState; open: ViewProps['open']; onBack: () => void }) {
  const purchases = state.purchases.filter((p) => p.folder_id === f.id)
  const tasks = state.tasks.filter((t) => t.folder_id === f.id)
  const ideas = state.ideas.filter((i) => i.folder_id === f.id)
  const s = totals(purchases, tasks)
  const receipts = [...purchases.filter((p) => p.receipt_path).map((p) => ({ id: p.id, path: p.receipt_path! })), ...tasks.filter((t) => t.receipt_path).map((t) => ({ id: t.id, path: t.receipt_path! }))]
  const over = f.budget && s.planned > f.budget

  return (
    <div>
      <button className="btn btn--ghost" style={{ marginLeft: -16, marginBottom: 8 }} onClick={onBack}><IconArrowLeft size={16} /> Mappar</button>
      <div className="section">
        <div className="section-head">
          <h1>{f.name}</h1>
          <button className="btn btn--secondary" onClick={() => open({ t: 'folder', item: f })}>Ändra</button>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="meta">Spenderat</div><div className="kpi__value">{kr(s.spent)}</div></div>
          <div className="kpi"><div className="meta">{f.budget ? `Planerat av ${kr(f.budget)}` : 'Planerat'}</div><div className="kpi__value">{kr(s.planned)}</div></div>
        </div>
        {over && <div className="budget-status"><span className="status status--warning">Planerat ligger {kr(s.planned - f.budget!)} över mappens budget</span></div>}
        {f.note && <p style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{f.note}</p>}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Jobb</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'task', item: { folder_id: f.id } })}>Lägg till</button>
        </div>
        {tasks.length ? (
          <div className="rows">{tasks.map((t) => <TaskRow key={t.id} t={t} state={state} onEdit={() => open({ t: 'task', item: t })} />)}</div>
        ) : (
          <p className="meta">Inga jobb</p>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Inköp</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'purchase', item: { folder_id: f.id } })}>Lägg till</button>
        </div>
        {purchases.length ? (
          <div className="rows">{purchases.map((p) => <PurchaseRow key={p.id} p={p} state={state} onEdit={() => open({ t: 'purchase', item: p })} />)}</div>
        ) : (
          <p className="meta">Inga inköp</p>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Kvitton</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'receipt', item: { folder_id: f.id } })}>Lägg till</button>
        </div>
        {receipts.length ? (
          <div className="chips">
            {receipts.map((r) => (
              <a key={r.id} href={state.urls[r.path]} target="_blank" rel="noreferrer"><FileThumb path={r.path} url={state.urls[r.path]} size={64} /></a>
            ))}
          </div>
        ) : (
          <p className="meta">Inga kvitton</p>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Idéer</h2>
          <button className="btn btn--ghost" onClick={() => open({ t: 'idea', item: { folder_id: f.id } })}>Lägg till</button>
        </div>
        {ideas.length ? (
          <div className="rows">
            {ideas.map((i) => (
              <div key={i.id} className="row" onClick={() => open({ t: 'idea', item: i })}>
                <div className="row__text"><div className="row__title">{i.title}</div>{i.note && <div className="meta">{i.note}</div>}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">Inga idéer</p>
        )}
      </div>
    </div>
  )
}

const ICON_CHOICES = Object.keys(ICONS) as IconKey[]

export function FolderSheet({ item, state, onClose, onCreated }: { item: Folder | 'new' | null; state: ProjectState; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast()
  const f = item && item !== 'new' ? item : null
  const [template, setTemplate] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const [form, setForm] = useState({ name: '', icon: 'folder' as IconKey, color: 'lilac' as Palette, budget: '', note: '' })

  useEffect(() => {
    if (!item) return
    setTemplate(0)
    setPicked([])
    setForm({ name: f?.name ?? '', icon: f?.icon ?? 'folder', color: f?.color ?? 'lilac', budget: f?.budget ? String(f.budget) : '', note: f?.note ?? '' })
  }, [item])

  const pickTemplate = (i: number) => {
    setTemplate(i)
    setPicked([])
    const t = FOLDER_TEMPLATES[i]
    setForm((c) => ({ ...c, name: i === 0 ? c.name : t.name, icon: t.icon, color: t.color }))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const row = { name: form.name.trim(), icon: form.icon, color: form.color, budget: form.budget.trim() ? parseNum(form.budget) : null, note: form.note.trim() || null }
    try {
      if (f) {
        await api.update('folders', f.id, row)
        await state.reload()
        toast('Ändringarna är sparade')
        onClose()
      } else {
        const created = await api.insert<Folder>('folders', { ...row, project_id: state.project!.id, sort: state.folders.length })
        // Bara de förslag man kryssat i läggs in.
        for (const title of FOLDER_TEMPLATES[template].tasks.filter((t) => picked.includes(t))) await api.insert('tasks', { project_id: state.project!.id, folder_id: created.id, title, status: 'todo', cost: 0, priority: 2 })
        await state.reload()
        toast(`${row.name} är skapad`)
        onCreated(created.id)
      }
    } catch (err: any) {
      toast({ title: 'Mappen kunde inte sparas', body: err.message })
    }
  }

  const del = async () => {
    if (!confirm(`Ta bort mappen ${f!.name}? Jobb och inköp i den finns kvar, utan mapp.`)) return
    await api.remove('folders', f!.id)
    await state.reload()
    toast(`${f!.name} är borttagen`)
    onClose()
  }

  return (
    <Sheet open={!!item} onClose={onClose} title={f ? f.name : 'Ny mapp'}>
      <form className="form" onSubmit={save}>
        {!f && (
          <div className="field">
            <span className="field__label">Mall</span>
            <Chips value={template} onChange={pickTemplate} options={FOLDER_TEMPLATES.map((t, i) => ({ value: i, label: t.name }))} />
          </div>
        )}
        {!f && FOLDER_TEMPLATES[template].tasks.length > 0 && (
          <div className="field">
            <span className="field__label">Förslag på jobb</span>
            <div className="rows">
              {FOLDER_TEMPLATES[template].tasks.map((t) => (
                <div key={t} className="row" style={{ justifyContent: 'flex-start' }} onClick={() => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>
                  <Checkbox checked={picked.includes(t)} onChange={(on) => setPicked((p) => (on ? [...p, t] : p.filter((x) => x !== t)))} label={t} />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Field label="Namn">
          <input className="input" placeholder="Måla sovrummet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Budget i kr">
          <input className="input" inputMode="numeric" placeholder="Ingen" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field__label">Ikon</span>
          <div className="chips">
            {ICON_CHOICES.map((k) => {
              const Icon = ICONS[k]
              return (
                <button type="button" key={k} className={`chip ${form.icon === k ? 'is-active' : ''}`} onClick={() => setForm({ ...form, icon: k })} aria-label={k}>
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
        </div>
        <div className="field">
          <span className="field__label">Färg</span>
          <Chips value={form.color} onChange={(c) => setForm({ ...form, color: c })} options={PALETTE.map((c) => ({ value: c, label: COLOR_LABEL[c] }))} />
        </div>
        <Field label="Anteckning">
          <textarea className="textarea" rows={3} placeholder="Hantverkare, offerter, vad som är bestämt" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <div className="form__actions">
          <Primary>{f ? 'Spara mapp' : 'Skapa mapp'}</Primary>
          {f && <button type="button" className="btn btn--danger" onClick={del}>Ta bort mapp</button>}
        </div>
      </form>
    </Sheet>
  )
}
