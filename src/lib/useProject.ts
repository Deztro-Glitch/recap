import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Table } from './api'
import type { Contract, Photo, Project, Purchase, Room, Task } from '../types'

export interface ProjectData {
  project: Project | null
  rooms: Room[]
  purchases: Purchase[]
  tasks: Task[]
  photos: Photo[]
  contracts: Contract[]
  urls: Record<string, string>   // filsökväg → visningsbar adress (kvitton, planritning, bilder, avtal)
  loading: boolean
}

// Prio först, sedan i den ordning de lades till.
const byPriority = <T extends { priority?: number }>(a: T, b: T) => (a.priority ?? 2) - (b.priority ?? 2)

// Laddar allt för ett projekt och håller det uppdaterat (även när någon annan ändrar).
export function useProject(pid: string) {
  const [data, setData] = useState<ProjectData>({ project: null, rooms: [], purchases: [], tasks: [], photos: [], contracts: [], urls: {}, loading: true })
  const urlCache = useRef(new Map<string, string>())

  const reload = useCallback(async () => {
    const [projects, rooms, purchases, tasks, rawPhotos, contracts] = await Promise.all([
      api.listProjects(),
      api.list<Room>('rooms', pid),
      api.list<Purchase>('purchases', pid),
      api.list<Task>('tasks', pid),
      api.list<Photo>('photos', pid),
      api.list<Contract>('contracts', pid).catch(() => [] as Contract[]),
    ])
    const project = projects.find((p) => p.id === pid) ?? null

    const missingPhotos = rawPhotos.filter((p) => !urlCache.current.has(p.path))
    for (const p of await api.photoUrls(missingPhotos)) if (p.url) urlCache.current.set(p.path, p.url)

    const files = [project?.floorplan_path, ...purchases.map((p) => p.receipt_path), ...purchases.map((p) => p.image_path), ...tasks.map((t) => t.receipt_path), ...contracts.map((c) => c.file_path)]
    const missingFiles = files.filter((f): f is string => !!f && !urlCache.current.has(f))
    for (const [path, url] of Object.entries(await api.fileUrls(missingFiles))) urlCache.current.set(path, url)

    setData({
      project,
      rooms: rooms.sort((a, b) => a.sort - b.sort),
      purchases: purchases.sort(byPriority),
      tasks: tasks.sort(byPriority),
      photos: rawPhotos.map((p) => ({ ...p, url: urlCache.current.get(p.path) })),
      contracts,
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
      setData((d) => ({ ...d, [table]: ((d as any)[table] as any[] ?? []).map((r: any) => (r.id === id ? { ...r, ...change } : r)) }))
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

// Ett kvitto som fotats men inte fyllts i än.
export const needsInfo = (p: Purchase) => p.bought && p.price == null && !(Number(p.est_price) > 0)
