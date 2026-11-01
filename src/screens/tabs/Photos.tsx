import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { BeforeAfter } from '../../components/BeforeAfter'
import { Chips, Field, Loader, Primary, Sheet, ease, useToast } from '../../components/ui'
import type { Photo, PhotoKind } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

const KIND_LABEL: Record<PhotoKind, string> = { before: 'Före', after: 'Efter', inspo: 'Inspiration' }
const KINDS: PhotoKind[] = ['before', 'after', 'inspo']

export function Photos({ state, room, open, filter }: ViewProps & { filter: ReactNode }) {
  const [kind, setKind] = useState<PhotoKind | null>(null)
  const [viewing, setViewing] = useState<Photo | null>(null)

  const inRoom = state.photos.filter((p) => room === null || p.room_id === room)
  const shown = inRoom.filter((p) => kind === null || p.kind === kind).reverse()

  // Ett före/efter-par per rum: första förebilden mot senaste efterbilden.
  const pairs = state.rooms
    .filter((r) => room === null || r.id === room)
    .map((r) => {
      const rp = state.photos.filter((p) => p.room_id === r.id)
      const before = rp.find((p) => p.kind === 'before')
      const after = [...rp].reverse().find((p) => p.kind === 'after')
      return before?.url && after?.url ? { room: r, before: before.url, after: after.url } : null
    })
    .filter((x) => x !== null)

  return (
    <div>
      <div className="section-head">
        <h1>Foton</h1>
        {filter}
      </div>

      {pairs.length > 0 && (
        <div className="section pairs">
          {pairs.map((p) => (
            <div key={p.room.id}>
              <div className="section-head"><h2>{p.room.name}</h2></div>
              <BeforeAfter before={p.before} after={p.after} />
            </div>
          ))}
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2>Alla bilder</h2>
          <Chips value={kind} onChange={setKind} options={[{ value: null, label: 'Alla' }, ...KINDS.map((k) => ({ value: k as PhotoKind | null, label: KIND_LABEL[k] }))]} />
        </div>
        {shown.length ? (
          <div className="photo-grid">
            {shown.map((p) => (
              <button key={p.id} onClick={() => setViewing(p)} aria-label={`${KIND_LABEL[p.kind]}bild`}>
                {p.url && <img src={p.url} alt="" loading="lazy" />}
                <span className="photo-kind meta">{KIND_LABEL[p.kind]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ paddingTop: 8 }}>
            <h3>Inga bilder</h3>
            <button className="btn btn--secondary" onClick={() => open({ t: 'photo' })}>Lägg till foto</button>
          </div>
        )}
      </div>


      <AnimatePresence>
        {viewing && (
          <motion.div className="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }}>
            <div className="viewer__bar">
              <Chips
                value={viewing.kind}
                onChange={(k) => {
                  setViewing({ ...viewing, kind: k })
                  state.patch('photos', viewing.id, { kind: k })
                }}
                options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
              <span style={{ marginLeft: 'auto' }} />
              <button
                className="btn btn--danger"
                aria-label="Ta bort bild"
                onClick={async () => {
                  await api.remove('photos', viewing.id)
                  setViewing(null)
                  state.reload()
                }}
              >
                <IconTrash size={18} />
              </button>
              <button className="btn btn--ghost" aria-label="Stäng" onClick={() => setViewing(null)}><IconX size={18} /></button>
            </div>
            <img src={viewing.url} alt="" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function UploadSheet({ open, onClose, state, room }: { open: boolean; onClose: () => void; state: ProjectState; room: string | null }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<PhotoKind>('before')
  const [roomId, setRoomId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setRoomId(room ?? '')
  }, [open])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) await api.uploadPhoto(state.project!.id, file, roomId || null, kind)
      await state.reload()
      toast(files.length === 1 ? 'Bilden är uppladdad' : `${files.length} bilder är uppladdade`)
      onClose()
    } catch (err: any) {
      toast({ title: 'Bilden kunde inte laddas upp', body: err.message })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Lägg till foto">
      <div className="form">
        <div className="field">
          <span className="field__label">Typ</span>
          <Chips value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </div>
        <Field label="Rum">
          <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Inget rum</option>
            {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <div className="form__actions">
          {busy ? <Loader /> : <Primary onClick={() => input.current?.click()}>Välj bilder</Primary>}
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
    </Sheet>
  )
}
