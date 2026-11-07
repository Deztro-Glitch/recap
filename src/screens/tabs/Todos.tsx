import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IconChecklist, IconPlus, IconX } from '@tabler/icons-react'
import { api } from '../../lib/api'
import { GlassCard } from '../../components/GlassCard'
import { useToast } from '../../components/ui'
import type { Todo } from '../../types'
import type { ProjectState } from '../ProjectView'

// "Att göra" i Boende: skriv och tryck Enter för att lägga till, bocka av med den runda rutan.
// Avbockade uppgifter blir gråa, stryks över och glider ner under de som är kvar.
export function TodoCard({ state }: { state: ProjectState }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const todos = [...state.todos].sort((a, b) => Number(a.done) - Number(b.done))
  const left = state.todos.filter((t) => !t.done).length

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const title = text.trim()
    if (!title) return
    setText('')
    try {
      await api.insert<Todo>('todos', { project_id: state.project!.id, title, done: false })
      await state.reload()
    } catch (err: any) {
      setText(title)
      toast({ title: 'Uppgiften kunde inte sparas', body: err.message })
    }
  }
  const toggle = (t: Todo) => state.patch('todos', t.id, { done: !t.done })
  const remove = async (t: Todo) => {
    await api.remove('todos', t.id)
    await state.reload()
  }

  return (
    <GlassCard className="kpi glass--light eco-dash__todo todo-card" lift={false}>
      <div className="kpi__head">
        <span className="kpi__icon"><IconChecklist size={16} stroke={1.8} /></span>
        <span className="kpi__label">Att göra</span>
        {state.todos.length > 0 && <span className="kpi__badge">{left === 0 ? 'Allt klart' : `${left} kvar`}</span>}
      </div>

      <form className="todo-add" onSubmit={add}>
        <input className="input" placeholder="Lägg till en uppgift" value={text} onChange={(e) => setText(e.target.value)} aria-label="Ny uppgift" />
        <button type="submit" className="todo-add__btn" aria-label="Lägg till uppgiften" disabled={!text.trim()}><IconPlus size={18} /></button>
      </form>

      {todos.length > 0 && (
        <ul className="todo-list">
          <AnimatePresence initial={false}>
            {todos.map((t) => (
              <motion.li
                key={t.id}
                layout
                className={`todo ${t.done ? 'is-done' : ''}`}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 12, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              >
                <button type="button" className="todo__check" role="checkbox" aria-checked={t.done} aria-label={t.done ? `Ångra ${t.title}` : `Bocka av ${t.title}`} onClick={() => toggle(t)}>
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M6.5 12.5 L10.5 16.5 L17.5 8.5" /></svg>
                </button>
                <span className="todo__title" title={t.title}>{t.title}</span>
                <button type="button" className="todo__remove" aria-label={`Ta bort ${t.title}`} onClick={() => remove(t)}><IconX size={14} /></button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </GlassCard>
  )
}
