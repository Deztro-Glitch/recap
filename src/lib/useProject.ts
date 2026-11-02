import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Table } from './api'
import type { Folder, Idea, Photo, Project, Purchase, Room, Task } from '../types'

export interface ProjectData {
  project: Project | null
  rooms: Room[]
  purchases: Purchase[]
  tasks: Task[]
  photos: Photo[]
  ideas: Idea[]
  folders: Folder[]
  urls: Record<string, string>   // filsökväg → visningsbar adress (kvitton, planritning, idébilder)
  loading: boolean
}

// Prio först, sedan i den ordning de lades till.
const byPriority = <T extends { priority?: number }>(a: T, b: T) => (a.priority ?? 2) - (b.priority ?? 2)

// Laddar allt för ett projekt och håller det uppdaterat (även när någon annan ändrar).
export function useProject(pid: string) {
  const [data, setData] = useState<ProjectData>({ project: null, rooms: [], purchases: [], tasks: [], photos: [], ideas: [], folders: [], urls: {}, loading: true })
  const urlCache = useRef(new Map<string, string>())

  const reload = useCallback(async () => {
    const [projects, rooms, purchases, tasks, rawPhotos, ideas, folders] = await Promise.all([
      api.listProjects(),
      api.list<Room>('rooms', pid),
      api.list<Purchase>('purchases', pid),
      api.list<Task>('tasks', pid),
      api.list<Photo>('photos', pid),
      api.list<Idea>('ideas', pid).catch(() => [] as Idea[]),
      api.list<Folder>('folders', pid).catch(() => [] as Folder[]),
    ])
    const project = projects.find((p) => p.id === pid) ?? null

    const missingPhotos = rawPhotos.filter((p) => !urlCache.current.has(p.path))
    for (const p of await api.photoUrls(missingPhotos)) if (p.url) urlCache.current.set(p.path, p.url)

    const files = [project?.floorplan_path, ...purchases.map((p) => p.receipt_path), ...tasks.map((t) => t.receipt_path), ...ideas.map((i) => i.image_path)]
    const missingFiles = files.filter((f): f is string => !!f && !urlCache.current.has(f))
    for (const [path, url] of Object.entries(await api.fileUrls(missingFiles))) urlCache.current.set(path, url)

    setData({
      project,
      rooms: rooms.sort((a, b) => a.sort - b.sort),
      purchases: purchases.sort(byPriority),
      tasks: tasks.sort(byPriority),
      photos: rawPhotos.map((p) => ({ ...p, url: urlCache.current.get(p.path) })),
      ideas,
      folders: folders.sort((a, b) => a.sort - b.sort),
      urls: Object.fromEntries(urlCache.current),
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

export const paid = (p: Purchase) => Number(p.price ?? p.est_price) || 0
const cost = (t: Task) => Number(t.cost) || 0
const est = (p: Purchase) => Number(p.est_price) || 0

// Summor för en delmängd (ett rum eller en mapp).
export function totals(purchases: Purchase[], tasks: Task[]) {
  const spent = purchases.filter((p) => p.bought).reduce((s, p) => s + paid(p), 0) + tasks.filter((t) => t.status === 'done').reduce((s, t) => s + cost(t), 0)
  const planned = purchases.reduce((s, p) => s + (p.bought ? paid(p) : est(p)), 0) + tasks.reduce((s, t) => s + cost(t), 0)
  const items = purchases.length + tasks.length
  const done = purchases.filter((p) => p.bought).length + tasks.filter((t) => t.status === 'done').length
  return { spent, planned, items, done }
}

// Ett kvitto som fotats men inte fyllts i än.
export const needsInfo = (p: Purchase) => p.bought && p.price == null && !(Number(p.est_price) > 0)
