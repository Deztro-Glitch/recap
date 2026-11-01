import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { WALL, labelPoints, roomAt, type Barriers } from '../lib/plangrid'
import type { Room } from '../types'

const WALL_HEIGHT = 14 // i rutor; låga väggar så att man ser ner i rummen, som ett dockskåp

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888'

// Planritningen som 3D-modell: väggarna ur bilden reses upp och golven får rummens färger.
// Dra för att vrida, nyp för att zooma, tryck på ett golv för att öppna rummet.
export default function Plan3D({ url, barriers, grid, version, rooms, ids, onRoom }: {
  url: string
  barriers: Barriers
  grid: Uint8Array
  version: number
  rooms: Room[]
  ids: string[]
  onRoom: (room: Room) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const labelsBox = useRef<HTMLDivElement>(null)
  const onRoomRef = useRef(onRoom)
  onRoomRef.current = onRoom

  useEffect(() => {
    const el = box.current!
    const { cols, rows, wall } = barriers
    const roomOf = (v: number) => (v && v !== WALL ? rooms.find((r) => r.id === ids[v - 1]) : undefined)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 1, 4000)
    const span = Math.max(cols, rows)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd3cfe0, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(-span * 0.4, span, span * 0.6)
    scene.add(sun)

    // Golvet: ritningen med rummens färger ovanpå.
    const tex = document.createElement('canvas')
    const S = 6
    tex.width = cols * S
    tex.height = rows * S
    const g = tex.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, tex.width, tex.height)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    const texture = new THREE.CanvasTexture(tex)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const paintFloor = () => {
      g.globalAlpha = 0.35
      if (img.complete) g.drawImage(img, 0, 0, tex.width, tex.height)
      g.globalAlpha = 1
      const colors = new Map<number, string>()
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i]
        const r = roomOf(v)
        if (!r) continue
        let c = colors.get(v)
        if (!c) colors.set(v, (c = css(`--c-${r.color}-bg`)))
        g.fillStyle = c
        g.fillRect((i % cols) * S, Math.floor(i / cols) * S, S, S)
      }
      texture.needsUpdate = true
      render()
    }
    img.onload = () => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, tex.width, tex.height)
      paintFloor()
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), new THREE.MeshLambertMaterial({ map: texture }))
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    // Väggarna: varje linjeruta i ritningen som inte tillhör ett rum blir en låg pelare.
    const cells: number[] = []
    for (let i = 0; i < wall.length; i++) if (wall[i] && grid[i] === 0) cells.push(i)
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_HEIGHT, 1), new THREE.MeshLambertMaterial({ color: css('--surface') }), cells.length)
    const m = new THREE.Matrix4()
    cells.forEach((i, k) => {
      m.makeTranslation((i % cols) - cols / 2 + 0.5, WALL_HEIGHT / 2, Math.floor(i / cols) - rows / 2 + 0.5)
      walls.setMatrixAt(k, m)
    })
    scene.add(walls)

    // Rumsnamnen svävar över golvet.
    const points = [...labelPoints(grid, cols)].map(([v, p]) => ({ room: roomOf(v), pos: new THREE.Vector3(p.x - cols / 2, 1, p.y - rows / 2) })).filter((p) => p.room)
    const spans = points.map((p) => {
      const s = document.createElement('span')
      s.className = 'plan__label'
      s.textContent = p.room!.name
      s.style.color = `var(--c-${p.room!.color}-fg)`
      labelsBox.current!.appendChild(s)
      return s
    })

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.maxPolarAngle = Math.PI * 0.42
    controls.minDistance = span * 0.4
    controls.maxDistance = span * 2.2
    controls.target.set(0, 0, 0)

    let w = 1
    let h = 1
    const v = new THREE.Vector3()
    function render() {
      renderer.render(scene, camera)
      points.forEach((p, k) => {
        v.copy(p.pos).project(camera)
        const s = spans[k]
        s.style.left = `${((v.x + 1) / 2) * w}px`
        s.style.top = `${((1 - v.y) / 2) * h}px`
        s.style.display = v.z > 1 ? 'none' : ''
      })
    }
    controls.addEventListener('change', render)

    const resize = () => {
      w = el.clientWidth
      h = Math.round(Math.min(w * 0.85, 560))
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    // Kameran glider från rakt ovanifrån ner till snett ovanifrån när vyn öppnas.
    const from = new THREE.Vector3(0, span * 1.5, 0.01)
    const to = new THREE.Vector3(0, span * 0.85, span * 0.75)
    camera.position.copy(from)
    camera.lookAt(0, 0, 0)
    const t0 = performance.now()
    let raf = 0
    const intro = (t: number) => {
      const k = Math.min(1, (t - t0) / 900)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      camera.position.lerpVectors(from, to, e)
      camera.lookAt(0, 0, 0)
      render()
      if (k < 1) raf = requestAnimationFrame(intro)
      else controls.update()
    }
    raf = requestAnimationFrame(intro)
    paintFloor()

    // Tryck (inte dra) på ett golv öppnar rummet.
    const ray = new THREE.Raycaster()
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY })
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObject(floor)[0]
      if (!hit?.uv) return
      const x = Math.min(cols - 1, Math.floor(hit.uv.x * cols))
      const y = Math.min(rows - 1, Math.floor((1 - hit.uv.y) * rows))
      const room = roomOf(roomAt(grid, cols, rows, y * cols + x))
      if (room) onRoomRef.current(room)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      spans.forEach((s) => s.remove())
      walls.geometry.dispose()
      ;(walls.material as THREE.Material).dispose()
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
      texture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [url, barriers, version, rooms, ids])

  return (
    <div ref={box} className="plan3d">
      <div ref={labelsBox} className="plan3d__labels" />
    </div>
  )
}
