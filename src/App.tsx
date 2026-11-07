import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, type User } from './lib/api'
import { Login } from './screens/Login'
import { Projects } from './screens/Projects'
import { ProjectView } from './screens/ProjectView'

// Enkel navigering via adressen: "#/p/<id>" = ett projekt, annars listan.
const readRoute = () => location.hash.match(/^#\/p\/(.+)$/)?.[1] ?? null

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [pid, setPid] = useState(readRoute)

  useEffect(() => {
    api.getUser().then(setUser)
    const unsub = api.onAuthChange(setUser)
    const onHash = () => setPid(readRoute())
    addEventListener('hashchange', onHash)
    return () => {
      unsub()
      removeEventListener('hashchange', onHash)
    }
  }, [])

  const open = (id: string | null) => {
    location.hash = id ? `/p/${id}` : ''
  }

  if (user === undefined) return null
  if (!user) return <Login />
  // Byte mellan Mina hem och ett hem tonar in och glider upp, som flikarna inne i ett hem.
  return (
    <AnimatePresence mode="wait">
      <motion.div key={pid ?? 'homes'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}>
        {pid ? <ProjectView pid={pid} user={user} onBack={() => open(null)} /> : <Projects user={user} onOpen={open} />}
      </motion.div>
    </AnimatePresence>
  )
}
