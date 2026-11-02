import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { IconTrash, IconX } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { BeforeAfter } from '../../components/BeforeAfter'
import { Chips, ease } from '../../components/ui'
import type { Photo, PhotoKind } from '../../types'
import type { ProjectState } from '../ProjectView'

const KIND_LABEL: Record<PhotoKind, string> = { before: 'Före', after: 'Efter', inspo: 'Inspiration' }
const KINDS: PhotoKind[] = ['before', 'after', 'inspo']

// Bildgalleri. Trycker man på en bild visas den stor, där man kan byta typ eller ta bort den.
export function PhotoGrid({ state, photos, showRoom }: { state: ProjectState; photos: Photo[]; showRoom?: boolean }) {
  const [viewing, setViewing] = useState<Photo | null>(null)
  const roomName = (id: string | null) => state.rooms.find((r) => r.id === id)?.name

  return (
    <>
      <div className="photo-grid">
        {photos.map((p) => (
          <button key={p.id} onClick={() => setViewing(p)} aria-label={`${KIND_LABEL[p.kind]}bild`}>
            {p.url && <img src={p.url} alt="" loading="lazy" />}
            <span className="photo-kind meta">{[KIND_LABEL[p.kind], showRoom ? roomName(p.room_id) : null].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>

      {createPortal(
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
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

// Ett rums bilder: före/efter-reglaget överst och sedan alla bilder.
export function RoomPhotos({ state, roomId }: { state: ProjectState; roomId: string }) {
  const photos = state.photos.filter((p) => p.room_id === roomId).reverse()
  // Första förebilden mot senaste efterbilden.
  const before = [...photos].reverse().find((p) => p.kind === 'before' && p.url)
  const after = photos.find((p) => p.kind === 'after' && p.url)
  if (!photos.length) return null

  return (
    <div className="section">
      <div className="section-head"><h3>Foton</h3></div>
      {before && after && <div style={{ marginBottom: 'var(--s-3)' }}><BeforeAfter before={before.url!} after={after.url!} /></div>}
      <PhotoGrid state={state} photos={photos} />
    </div>
  )
}
