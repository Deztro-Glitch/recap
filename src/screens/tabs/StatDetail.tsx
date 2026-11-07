import { useRef } from 'react'
import { IconPencil } from '@tabler/icons-react'
import { Sheet } from '../../components/ui'

type Stat = { title: string; economy?: boolean }

// Detaljvyn för ett statistikkort. Glider in från höger på dator och underifrån på mobilen.
// Än så länge bara rubriken och vägen till Ekonomi-formuläret; innehållet byggs ut kort för kort.
export function StatDetail({ stat, onClose, onEdit }: { stat: Stat | null; onClose: () => void; onEdit: () => void }) {
  // Behåll rubriken medan panelen glider ut, så att den inte blir tom på vägen.
  const last = useRef<Stat>({ title: '' })
  if (stat) last.current = stat
  const shown = last.current

  return (
    <Sheet open={!!stat} onClose={onClose} title={shown.title}>
      {shown.economy && (
        <div className="form__actions">
          <button className="btn btn--primary" onClick={onEdit}>
            <span>Redigera ekonomi</span>
            <IconPencil size={16} />
          </button>
        </div>
      )}
    </Sheet>
  )
}
