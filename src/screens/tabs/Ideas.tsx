import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { IconBulb, IconExternalLink } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { Field, Primary, Sheet, rowAnim, useToast } from '../../components/ui'
import { FileField, FileThumb } from '../../components/FileField'
import type { Idea } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'
import { SwipeRow } from '../../components/SwipeRow'
import { removeRow } from './Purchases'

const host = (link: string) => {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}

export function Ideas({ state, room, open, filter }: ViewProps & { filter: ReactNode }) {
  const list = state.ideas.filter((i) => room === null || i.room_id === room).reverse()
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name

  return (
    <div>
      <div className="section-head">
        <h1>Idéer</h1>
        {filter}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <h2>{room ? 'Inga idéer här' : 'Inga idéer än'}</h2>
          <button className="btn btn--secondary" onClick={() => open({ t: 'idea', item: { room_id: room } })}>Lägg till idé</button>
        </div>
      ) : (
        <div className="rows">
          <AnimatePresence initial={false}>
            {list.map((i) => (
              <SwipeRow key={i.id} onClick={() => open({ t: 'idea', item: i })} onDelete={() => removeRow(state, 'ideas', i.id, i.title)}>
                <div className="row__main">
                  {i.image_path ? <FileThumb path={i.image_path} url={state.urls[i.image_path]} size={48} /> : <span className="thumb" style={{ width: 48, height: 48 }}><IconBulb size={20} /></span>}
                  <div className="row__text">
                    <div className="row__title">{i.title}</div>
                    <div className="meta">{[roomName(i.room_id), i.link && host(i.link)].filter(Boolean).join(' · ') || i.note || 'Hela hemmet'}</div>
                  </div>
                </div>
                {i.link && (
                  <a href={i.link} target="_blank" rel="noreferrer" className="row__link" aria-label="Öppna länk" onClick={(e) => e.stopPropagation()}>
                    <IconExternalLink size={16} />
                  </a>
                )}
              </SwipeRow>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export type IdeaDraft = Partial<Idea>

export function IdeaSheet({ item, state, onClose, onConvert }: { item: Idea | IdeaDraft | null; state: ProjectState; onClose: () => void; onConvert: (idea: Idea) => void }) {
  const toast = useToast()
  const idea = item && item.id ? (item as Idea) : null
  const [f, setF] = useState({ title: '', room_id: '', folder_id: '', note: '', link: '', image: null as string | null })
  const [imageUrl, setImageUrl] = useState<string | undefined>()

  useEffect(() => {
    if (!item) return
    setF({ title: item.title ?? '', room_id: item.room_id ?? '', folder_id: item.folder_id ?? '', note: item.note ?? '', link: item.link ?? '', image: item.image_path ?? null })
    setImageUrl(item.image_path ? state.urls[item.image_path] : undefined)
  }, [item])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const row = { title: f.title.trim(), room_id: f.room_id || null, folder_id: f.folder_id || null, note: f.note.trim() || null, link: f.link.trim() || null, image_path: f.image }
    try {
      if (idea) {
        if (idea.image_path && idea.image_path !== f.image) await api.removeFile(idea.image_path)
        await api.update('ideas', idea.id, row)
      } else await api.insert('ideas', { ...row, project_id: state.project!.id })
      await state.reload()
      toast(idea ? 'Ändringarna är sparade' : 'Idén är sparad')
      onClose()
    } catch (err: any) {
      toast({ title: 'Idén kunde inte sparas', body: err.message })
    }
  }

  const del = async () => {
    await api.remove('ideas', idea!.id)
    await state.reload()
    toast('Idén är borttagen')
    onClose()
  }

  return (
    <Sheet open={!!item} onClose={onClose} title={idea ? idea.title : 'Ny idé'}>
      <form className="form" onSubmit={save}>
        <Field label="Idé">
          <input className="input" placeholder="Fiskbensparkett i hallen" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </Field>
        <div className="form__row">
          <Field label="Mapp">
            <select className="select" value={f.folder_id} onChange={(e) => setF({ ...f, folder_id: e.target.value })}>
              <option value="">Ingen mapp</option>
              {state.folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Rum">
            <select className="select" value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })}>
              <option value="">Hela hemmet</option>
              {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
        <FileField
          pid={state.project!.id}
          label="Bild"
          accept="image/*"
          path={f.image}
          url={imageUrl}
          onChange={(path, url) => {
            setF((c) => ({ ...c, image: path }))
            setImageUrl(url)
          }}
        />
        <Field label="Länk">
          <input className="input" type="url" inputMode="url" placeholder="https://" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
        </Field>
        <Field label="Anteckning">
          <textarea className="textarea" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <div className="form__actions">
          <Primary>{idea ? 'Spara idé' : 'Lägg till idé'}</Primary>
          {idea && <button type="button" className="btn btn--secondary" onClick={() => onConvert(idea)}>Gör till inköp</button>}
          {idea && <button type="button" className="btn btn--danger" onClick={del}>Ta bort idé</button>}
        </div>
      </form>
    </Sheet>
  )
}
