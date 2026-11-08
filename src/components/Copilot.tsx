import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { IconArrowUp, IconSparkles, IconX } from '@tabler/icons-react'

// AI-raden: en stjärna med accentglöd, ett fält och en skicka-knapp. onAsk tar texten och svarar med en mening.
// Stjärnan "tänker" i en sekund och sedan medan onAsk arbetar. Svaret visas i en bubbla ovanför raden.
// I planritningen svävar raden längst ner i kortet och svaret försvinner efter en stund (Riv väggen …).
// inline: en vanlig rad i sidan (Fråga din ekonomi), där svaret ligger kvar tills man stänger det.
export function Copilot({ onAsk, placeholder = "Be AI redigera ritningen, t.ex. 'Riv väggen'...", label = 'Be AI redigera ritningen', inline = false }: {
  onAsk: (text: string) => Promise<string>
  placeholder?: string
  label?: string
  inline?: boolean
}) {
  const still = useReducedMotion()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<{ id: number; q: string; text: string } | null>(null)
  const timer = useRef<number>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q || busy) return
    setBusy(true)
    setAnswer(null)
    clearTimeout(timer.current)
    try {
      // Först tänker den en sekund, sedan händer det och svaret kommer.
      await new Promise((r) => setTimeout(r, still || inline ? 0 : 1000))
      const reply = await onAsk(q)
      setText('')
      setAnswer({ id: Date.now(), q, text: reply })
      if (!inline) timer.current = window.setTimeout(() => setAnswer(null), 6000)
    } finally {
      setBusy(false)
    }
  }

  const bubble = (
    <AnimatePresence>
      {answer && (
        <motion.div
          key={answer.id}
          className="copilot__answer"
          role="status"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <IconSparkles size={14} stroke={2} />
          <span>
            {inline && <span className="copilot__q">{answer.q}</span>}
            {answer.text}
          </span>
          {inline && <button type="button" className="copilot__close" aria-label="Stäng svaret" onClick={() => setAnswer(null)}><IconX size={14} /></button>}
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className={inline ? 'copilot-wrap copilot-wrap--inline' : 'copilot-wrap'}>
      {!inline && bubble}
      <form className={`copilot ${busy ? 'is-busy' : ''}`} onSubmit={send}>
        <span className="copilot__spark" aria-hidden>
          <motion.span
            className="copilot__spark-icon"
            animate={busy && !still ? { rotate: 360, scale: [1, 1.18, 1] } : { rotate: 0, scale: 1 }}
            transition={busy ? { rotate: { duration: 1.1, repeat: Infinity, ease: 'linear' }, scale: { duration: 0.8, repeat: Infinity } } : { duration: 0.3 }}
          >
            <IconSparkles size={18} stroke={1.9} />
          </motion.span>
        </span>
        <input
          className="copilot__input"
          placeholder={placeholder}
          aria-label={label}
          enterKeyHint="send"
          autoComplete="off"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="copilot__send" type="submit" aria-label="Skicka" disabled={!text.trim() || busy}>
          <IconArrowUp size={17} stroke={2.4} />
        </button>
      </form>
      {inline && bubble}
    </div>
  )
}
