import { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { mergeGroups, sharedWalls } from '../../lib/walls'
import type { Pt, Room } from '../../types'
import { W, polyArea, type Polys } from './geometry'

// Rivna väggar sparas i webbläsaren per hem, så att man kan leka med ritningen utan att något ändras på riktigt.
const wallKey = (pid: string) => `recap-rivna-${pid}`
const loadGone = (pid: string): string[] => {
  try { return JSON.parse(localStorage.getItem(wallKey(pid)) ?? '[]') } catch { return [] }
}

// Väggarna mellan två rum och rivningen av dem. Rivna väggar slår ihop rummen till grupper: gruppens färg och
// namn kommer från det största rummet, och ytorna läggs ihop. Används av verktyget Markera vägg för rivning
// och av AI-raden. onArea visar den sammanslagna ytan; sizeText skriver en yta i kvm (eller andel av ytan).
export function usePlanWalls({ projectId, shown, polys, rooms, H, aspect, onArea, sizeText }: {
  projectId: string
  shown: [string, Pt[]][]
  polys: Polys
  rooms: Room[]
  H: number
  aspect: number
  onArea: (roomId: string | null) => void
  sizeText: (area: number) => string
}) {
  const still = useReducedMotion()
  const [gone, setGone] = useState<string[]>(() => loadGone(projectId))
  const [flash, setFlash] = useState<string | null>(null)   // väggen AI:n ska riva blinkar först
  useEffect(() => {
    try { localStorage.setItem(wallKey(projectId), JSON.stringify(gone)) } catch { /* privat läge */ }
  }, [gone])

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? ''
  const area = (id: string) => (polys[id] ? polyArea(polys[id], H) : 0)
  const shared = useMemo(() => sharedWalls(shown, W, H), [polys, rooms, aspect])
  const goneWalls = shared.filter((w) => gone.includes(w.id))
  const groups = useMemo(() => mergeGroups(shown.map(([id]) => id), shared, gone), [shared, gone])
  const groupOf = (id: string) => groups.get(id) ?? [id]
  const groupArea = (id: string) => groupOf(id).reduce((s, x) => s + area(x), 0)
  // Gruppens färg och namn kommer från det största rummet; namnen står i storleksordning.
  const bySize = (id: string) => [...groupOf(id)].sort((a, b) => area(b) - area(a))
  const lead = (id: string) => bySize(id)[0]
  const groupName = (id: string) => bySize(id).map(roomName).join(' & ')

  const demolish = (id: string) => {
    const wall = shared.find((w) => w.id === id)
    if (gone.includes(id)) setGone(gone.filter((x) => x !== id))
    else {
      setGone([...gone, id])
      if (wall) onArea(wall.rooms[0])   // visa den sammanslagna ytan direkt
    }
  }
  const undoLast = () => { setGone(gone.slice(0, -1)); onArea(null) }
  const restore = () => { setGone([]); onArea(null) }

  // AI-raden (mockad tills den kopplas till AI:n): förstår "riv väggen (mellan X och Y)" och "återställ".
  // Väggen blinkar i rött och orange, tonas sedan bort och rummen slås ihop som när man river själv.
  const ask = async (text: string): Promise<string> => {
    const t = text.toLowerCase()
    if (/återställ|bygg upp|ångra allt/.test(t)) {
      restore()
      return gone.length ? 'Klart, alla väggar är tillbaka.' : 'Det finns inga rivna väggar att återställa.'
    }
    if (!/riv|ta bort|öppna upp|slå ihop/.test(t)) return 'Jag kan riva väggar mellan rum, t.ex. ”Riv väggen mellan kök och matsal”.'
    const named = shown.map(([id]) => id).filter((id) => roomName(id) && t.includes(roomName(id).toLowerCase()))
    const standing = shared.filter((w) => !gone.includes(w.id))
    const between = (a: string, b: string) => standing.find((w) => w.rooms.includes(a) && w.rooms.includes(b))
    const byName = (a: string, b: string) => standing.find((w) => w.rooms.some((x) => roomName(x).toLowerCase().includes(a)) && w.rooms.some((x) => roomName(x).toLowerCase().includes(b)))
    const wall =
      named.length >= 2 ? between(named[0], named[1])
      : named.length === 1 ? standing.find((w) => w.rooms.includes(named[0]))
      : byName('kök', 'matsal') ?? standing[0]
    if (!wall) return named.length >= 2 ? `${roomName(named[0])} och ${roomName(named[1])} har ingen gemensam vägg som står kvar.` : 'Jag hittar ingen vägg att riva.'

    setFlash(wall.id)
    await new Promise((r) => setTimeout(r, still ? 0 : 950))
    setFlash(null)
    setGone((g) => (g.includes(wall.id) ? g : [...g, wall.id]))
    onArea(wall.rooms[0])
    const after = mergeGroups(shown.map(([id]) => id), shared, [...gone, wall.id]).get(wall.rooms[0]) ?? wall.rooms
    const size = sizeText(after.reduce((s, x) => s + area(x), 0))
    return `Rev väggen mellan ${roomName(wall.rooms[0])} och ${roomName(wall.rooms[1])}. Den nya ytan blir ${size}.`
  }
  const flashWall = flash ? shared.find((w) => w.id === flash) : null

  return { gone, shared, goneWalls, groupOf, groupArea, lead, groupName, demolish, undoLast, restore, ask, flashWall }
}
