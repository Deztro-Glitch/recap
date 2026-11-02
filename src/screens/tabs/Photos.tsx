import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { BeforeAfter } from '../../components/BeforeAfter'
import { Chips, ease } from '../../components/ui'
import type { Photo, PhotoKind } from '../../types'
import type { ProjectState } from '../ProjectView'

const KIND_LABEL: Record<PhotoKind, string> = { before: 'Före', after: 'Efter', inspo: 'Inspiration' }
const KINDS: PhotoKind[] = ['before', 'after', 'inspo']

// Bilderna i ett rum: före/efter-reglaget överst och sedan alla bilder.
export function RoomPhotos({ state, roomId, onAdd }: { state: ProjectState; roomId: string | null; onAdd: () => void }) {
  const [viewing, setViewing] = useState<Photo | null>(null)
  const photos = state.photos.filter((p) => p.room_id === roomId).reverse()
  // Första förebilden mot senaste efterbilden.
  const before = [...photos].reverse().find((p) => p.kind === 'before' && p.url)
  const after = photos.find((p) => p.kind === 'after' && p.url)

  return (
    <div className="section">
      <div className="section-head">
        <h2>Foton</h2>
        <button className="btn btn--ghost" onClick={onAdd}>Lägg till</button>
      </div>
      {before && after && <div style={{ marginBottom: 'var(--s-3)' }}><BeforeAfter before={before.url!} after={after.url!} /></div>}
      {photos.length ? (
        <div className="photo-grid">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setViewing(p)} aria-label={`${KIND_LABEL[p.kind]}bild`}>
              {p.url && <img src={p.url} alt="" loading="lazy" />}
              <span className="photo-kind meta">{KIND_LABEL[p.kind]}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="meta">Inga foton än. Ta en förebild innan du börjar, så kan du jämföra sen.</p>
      )}

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
