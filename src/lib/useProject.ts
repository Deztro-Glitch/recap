import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Table } from './api'
import type { Photo, Project, Purchase, Room, Task } from '../types'

export interface ProjectData {
  project: Project | null
  rooms: Room[]
  purchases: Purchase[]
  tasks: Task[]
  photos: Photo[]
  loading: boolean
}

// Laddar allt för ett projekt och håller det uppdaterat (även när någon annan ändrar).
export function useProject(pid: string) {
  const [data, setData] = useState<ProjectData>({ project: null, rooms: [], purchases: [], tasks: [], photos: [], loading: true })
  const urlCache = useRef(new Map<string, string>())

  const reload = useCallback(async () => {
    const [projects, rooms, purchases, tasks, rawPhotos] = await Promise.all([
      api.listProjects(),
      api.list<Room>('rooms', pid),
      api.list<Purchase>('purchases', pid),
      api.list<Task>('tasks', pid),
      api.list<Photo>('photos', pid),
    ])
    const missing = rawPhotos.filter((p) => !urlCache.current.has(p.id))
    for (const p of await api.photoUrls(missing)) if (p.url) urlCache.current.set(p.id, p.url)
    const photos = rawPhotos.map((p) => ({ ...p, url: urlCache.current.get(p.id) }))
    setData({
      project: projects.find((p) => p.id === pid) ?? null,
      rooms: rooms.sort((a, b) => a.sort - b.sort),
      purchases,
      tasks,
      photos,
      loading: false,
    })
  }, [pid])

  useEffect(() => {
    reload()
    let t: number | undefined
    // Samla ihop många ändringar i följd till en omladdning.
    const unsub = api.subscribe(pid, () => {
      clearTimeout(t)
      t = window.setTimeout(reload, 150)
    })
    return () => {
      clearTimeout(t)
      unsub()
    }
  }, [pid, reload])

  // Uppdaterar skärmen direkt och sparar sedan i bakgrunden.
  const patch = useCallback(
    async (table: Table, id: string, change: Record<string, any>) => {
      setData((d) => ({ ...d, [table]: (d[table] as any[]).map((r) => (r.id === id ? { ...r, ...change } : r)) }))
      try {
        await api.update(table, id, change)
      } finally {
        reload()
      }
    },
    [reload],
  )

  return { ...data, reload, patch }
}

export function useBudget(project: Project | null, purchases: Purchase[], tasks: Task[]) {
  return useMemo(() => {
    const budget = project?.budget ?? 0
    const spent =
      purchases.filter((p) => p.bought).reduce((s, p) => s + (p.price ?? p.est_price), 0) +
      tasks.filter((t) => t.status === 'done').reduce((s, t) => s + t.cost, 0)
    const planned =
      purchases.reduce((s, p) => s + (p.bought ? p.price ?? p.est_price : p.est_price), 0) +
      tasks.reduce((s, t) => s + t.cost, 0)
    return { budget, spent, planned, left: budget - spent, overSpent: budget > 0 && spent > budget, overPlanned: budget > 0 && planned > budget }
  }, [project, purchases, tasks])
}

// En uppgift "hoppar före" om en tidigare fas i samma rum inte är klar.
export function blockers(task: Task, tasks: Task[]) {
  return tasks.filter((t) => t.room_id === task.room_id && t.phase < task.phase && t.status !== 'done')
}
