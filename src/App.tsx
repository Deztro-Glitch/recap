import { useEffect, useState } from 'react'
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
  if (pid) return <ProjectView key={pid} pid={pid} user={user} onBack={() => open(null)} />
  return <Projects user={user} onOpen={open} />
}
