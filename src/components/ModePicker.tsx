import { IconHammer, IconReceipt } from '@tabler/icons-react'
import { MODE_LABEL, tileStyle, type Mode } from '../types'

const MODES: { mode: Mode; icon: typeof IconHammer; color: 'sand' | 'coral' }[] = [
  { mode: 'simple', icon: IconReceipt, color: 'sand' },
  { mode: 'full', icon: IconHammer, color: 'coral' },
]

// Två rutor att välja mellan: bara inköp och kvitton, eller renovering med allt.
export function ModePicker({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="tiles mode-picker">
      {MODES.map(({ mode, icon: Icon, color }) => (
        <button type="button" key={mode} className={`tile ${value === mode ? 'is-selected' : ''}`} style={tileStyle(color)} onClick={() => onChange(mode)} aria-pressed={value === mode}>
          <div className="tile__name">{MODE_LABEL[mode].name}</div>
          <div className="tile__meta">{MODE_LABEL[mode].meta}</div>
          <Icon className="tile__icon" />
          <span className="tile__check"><svg viewBox="0 0 14 14"><path d="M3 7.5 L6 10.5 L11.5 4" /></svg></span>
        </button>
      ))}
    </div>
  )
}
