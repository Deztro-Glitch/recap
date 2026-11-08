import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { IconArrowUp, IconSparkles } from '@tabler/icons-react'

// AI-raden som svävar längst ner i planritningen: en stjärna med accentglöd, ett fält och en skicka-knapp.
// onAsk tar texten och svarar med en mening. Stjärnan "tänker" i en sekund och sedan medan onAsk arbetar
// (t.ex. låter en vägg blinka och försvinna). Svaret visas i en liten bubbla ovanför raden en stund.
export function Copilot({ onAsk }: { onAsk: (text: string) => Promise<string> }) {
  const still = useReducedMotion()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<{ id: number; text: string } | null>(null)
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
      // Först tänker den en sekund, sedan händer det i ritningen och svaret kommer.
      await new Promise((r) => setTimeout(r, still ? 0 : 1000))
      const reply = await onAsk(q)
      setText('')
      setAnswer({ id: Date.now(), text: reply })
      timer.current = window.setTimeout(() => setAnswer(null), 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="copilot-wrap">
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
            <span>{answer.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

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
          placeholder="Be AI redigera ritningen, t.ex. 'Riv väggen'..."
          aria-label="Be AI redigera ritningen"
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
    </div>
  )
}
