import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Member, Photo, PhotoKind, Project } from '../types'

// Appen pratar med Supabase om nycklar finns, annars körs ett demoläge
// där allt sparas i webbläsaren (bra för att testa utan konto).

export type Table = 'rooms' | 'purchases' | 'tasks' | 'photos' | 'ideas' | 'folders' | 'contracts' | 'receipts' | 'todos'
export const TABLES: Table[] = ['rooms', 'purchases', 'tasks', 'photos', 'ideas', 'folders', 'contracts', 'receipts', 'todos']

// Kolumner som pekar på en fil i lagringen och ska tas bort tillsammans med raden.
const FILE_COL: Partial<Record<Table, string[]>> = { photos: ['path'], purchases: ['receipt_path', 'image_path'], tasks: ['receipt_path'], ideas: ['image_path'], contracts: ['file_path'], receipts: ['file_path'] }
export interface User { id: string; email: string }
type Row = Record<string, any>

export interface Api {
  demo: boolean
  getUser(): Promise<User | null>
  onAuthChange(cb: (u: User | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>

  listProjects(): Promise<Project[]>
  createProject(p: Pick<Project, 'name' | 'kind' | 'address' | 'budget' | 'mode'>): Promise<Project>
  updateProject(id: string, patch: Partial<Project>): Promise<void>
  deleteProject(id: string): Promise<void>

  listMembers(pid: string): Promise<Member[]>
  invite(pid: string, email: string): Promise<'ok' | 'not_found'>
  removeMember(pid: string, uid: string): Promise<void>

  list<T>(table: Table, pid: string): Promise<T[]>
  insert<T>(table: Table, row: Row): Promise<T>
  update(table: Table, id: string, patch: Row): Promise<void>
  remove(table: Table, id: string): Promise<void>

  uploadPhoto(pid: string, file: File, roomId: string | null, kind: PhotoKind): Promise<Photo>
  photoUrls(photos: Photo[]): Promise<Photo[]>

  // Kvitton, planritningar och idébilder. Bilder komprimeras, PDF:er sparas som de är.
  uploadFile(pid: string, file: File): Promise<string>
  fileUrls(paths: string[]): Promise<Record<string, string>>
  removeFile(path: string): Promise<void>

  subscribe(pid: string, onChange: () => void): () => void

  // Läser ett kvittofoto med AI (Edge Function parse-receipt). null när det inte går, t.ex. i demoläget.
  parseReceipt(image: string, rooms: string[], planned: { id: string; title: string; price: number; room: string | null }[]): Promise<Record<string, any> | null>
  // Tolkar en snabb inmatning ("Vinglas 699kr") med AI (Edge Function quick-entry). null i demoläget.
  quickEntry(text: string): Promise<Record<string, any> | null>
}

// ---------- Bildkomprimering (mindre filer = snabbare app) ----------

export async function compressImage(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.82))
}

// ---------- Supabase ----------

function supabaseApi(sb: SupabaseClient): Api {
  const toUser = (u: any): User | null => (u ? { id: u.id, email: u.email ?? '' } : null)
  const check = ({ data, error }: { data: any; error: any }): any => {
    if (error) throw new Error(error.message)
    return data
  }

  return {
    demo: false,
    async getUser() {
      const { data } = await sb.auth.getSession()
      return toUser(data.session?.user)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toUser(s?.user)))
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Fel e-post eller lösenord' : error.message)
    },
    async signOut() {
      await sb.auth.signOut()
    },

    async listProjects() {
      return check(await sb.from('projects').select('*').order('created_at'))
    },
    async createProject(p) {
      return check(await sb.from('projects').insert(p).select().single())
    },
    async updateProject(id, patch) {
      check(await sb.from('projects').update(patch).eq('id', id))
    },
    async deleteProject(id) {
      check(await sb.from('projects').delete().eq('id', id))
    },

    async listMembers(pid) {
      return check(await sb.from('project_members').select('*').eq('project_id', pid).order('created_at'))
    },
    async invite(pid, email) {
      return check(await sb.rpc('invite_member', { pid, member_email: email })) as 'ok' | 'not_found'
    },
    async removeMember(pid, uid) {
      check(await sb.from('project_members').delete().eq('project_id', pid).eq('user_id', uid))
    },

    async list(table, pid) {
      return check(await sb.from(table).select('*').eq('project_id', pid).order('created_at'))
    },
    async insert(table, row) {
      return check(await sb.from(table).insert(row).select().single())
    },
    async update(table, id, patch) {
      check(await sb.from(table).update(patch).eq('id', id))
    },
    async remove(table, id) {
      const cols = FILE_COL[table]
      if (cols) {
        const { data } = await sb.from(table).select('*').eq('id', id).single()
        const paths = cols.map((c) => (data as Row | null)?.[c]).filter(Boolean)
        if (paths.length) await sb.storage.from('photos').remove(paths)
      }
      check(await sb.from(table).delete().eq('id', id))
    },

    async uploadPhoto(pid, file, roomId, kind) {
      const blob = await compressImage(file)
      const path = `${pid}/${crypto.randomUUID()}.jpg`
      check(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }))
      const photo = await this.insert<Photo>('photos', { project_id: pid, room_id: roomId, kind, path })
      return (await this.photoUrls([photo]))[0]
    },
    async photoUrls(photos) {
      if (!photos.length) return photos
      const { data } = await sb.storage.from('photos').createSignedUrls(photos.map((p) => p.path), 60 * 60)
      return photos.map((p, i) => ({ ...p, url: data?.[i]?.signedUrl ?? undefined }))
    },

    async uploadFile(pid, file) {
      const isImage = file.type.startsWith('image/')
      const blob = isImage ? await compressImage(file, 2400) : file
      const ext = isImage ? 'jpg' : (file.name.split('.').pop() ?? 'pdf').toLowerCase()
      const path = `${pid}/files/${crypto.randomUUID()}.${ext}`
      check(await sb.storage.from('photos').upload(path, blob, { contentType: isImage ? 'image/jpeg' : file.type }))
      return path
    },
    async fileUrls(paths) {
      if (!paths.length) return {}
      const { data } = await sb.storage.from('photos').createSignedUrls(paths, 60 * 60)
      return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl!]))
    },
    async removeFile(path) {
      await sb.storage.from('photos').remove([path])
    },

    async parseReceipt(image, rooms, planned) {
      const { data, error } = await sb.functions.invoke('parse-receipt', { body: { image, rooms, planned } })
      if (error) throw new Error(error.message)
      return data
    },
    async quickEntry(text) {
      const { data, error } = await sb.functions.invoke('quick-entry', { body: { text } })
      if (error) throw new Error(error.message)
      return data
    },

    subscribe(pid, onChange) {
      const ch = sb.channel(`project-${pid}`)
      for (const table of TABLES) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `project_id=eq.${pid}` }, onChange)
      }
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${pid}` }, onChange)
      ch.subscribe()
      return () => void sb.removeChannel(ch)
    },
  }
}

// ---------- Demoläge (localStorage) ----------

function demoApi(): Api {
  const KEY = 'recap-demo'
  const me: User = { id: 'demo-user', email: 'demo@recap.se' }
  type Store = { signedIn: boolean; projects: Project[]; members: Member[] } & Record<Table, Row[]>
  const empty: Store = { signedIn: false, projects: [], members: [], rooms: [], purchases: [], tasks: [], photos: [], ideas: [], folders: [], contracts: [], receipts: [], todos: [] }

  const load = (): Store => {
    try {
      return { ...empty, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    } catch {
      return { ...empty }
    }
  }
  const save = (s: Store) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      alert('Demoläget har fullt minne – ta bort några bilder.')
    }
    listeners.forEach((l) => l())
  }
  const listeners = new Set<() => void>()
  const authListeners = new Set<(u: User | null) => void>()
  const now = () => new Date().toISOString()

  return {
    demo: true,
    async getUser() {
      return load().signedIn ? me : null
    },
    onAuthChange(cb) {
      authListeners.add(cb)
      return () => authListeners.delete(cb)
    },
    async signIn() {
      const s = load()
      s.signedIn = true
      save(s)
      authListeners.forEach((l) => l(me))
    },
    async signOut() {
      const s = load()
      s.signedIn = false
      save(s)
      authListeners.forEach((l) => l(null))
    },

    async listProjects() {
      return load().projects
    },
    async createProject(p) {
      const s = load()
      const project: Project = { ...p, floorplan_path: null, floorplan_map: null, economy: null, id: crypto.randomUUID(), created_by: me.id, created_at: now() }
      s.projects.push(project)
      s.members.push({ project_id: project.id, user_id: me.id, email: me.email, role: 'owner' })
      save(s)
      return project
    },
    async updateProject(id, patch) {
      const s = load()
      s.projects = s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p))
      save(s)
    },
    async deleteProject(id) {
      const s = load()
      s.projects = s.projects.filter((p) => p.id !== id)
      for (const t of TABLES) s[t] = s[t].filter((r) => r.project_id !== id)
      save(s)
    },

    async listMembers(pid) {
      return load().members.filter((m) => m.project_id === pid)
    },
    async invite() {
      return 'not_found'
    },
    async removeMember(pid, uid) {
      const s = load()
      s.members = s.members.filter((m) => !(m.project_id === pid && m.user_id === uid))
      save(s)
    },

    async list(table, pid) {
      return load()[table].filter((r) => r.project_id === pid) as any
    },
    async insert(table, row) {
      const s = load()
      const r = { id: crypto.randomUUID(), created_at: now(), ...row }
      s[table].push(r)
      save(s)
      return r as any
    },
    async update(table, id, patch) {
      const s = load()
      s[table] = s[table].map((r) => (r.id === id ? { ...r, ...patch } : r))
      save(s)
    },
    async remove(table, id) {
      const s = load()
      s[table] = s[table].filter((r) => r.id !== id)
      save(s)
    },

    async uploadPhoto(pid, file, roomId, kind) {
      const blob = await compressImage(file, 1000)
      const path = await new Promise<string>((res) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result as string)
        fr.readAsDataURL(blob)
      })
      const photo = await this.insert<Photo>('photos', { project_id: pid, room_id: roomId, kind, path })
      return { ...photo, url: path }
    },
    async photoUrls(photos) {
      return photos.map((p) => ({ ...p, url: p.path }))
    },

    // I demoläget är "sökvägen" själva filen som data-URL.
    async uploadFile(_pid, file) {
      const blob = file.type.startsWith('image/') ? await compressImage(file, 1400) : file
      return new Promise<string>((res) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result as string)
        fr.readAsDataURL(blob)
      })
    },
    async fileUrls(paths) {
      return Object.fromEntries(paths.map((p) => [p, p]))
    },
    async removeFile() {},

    subscribe(_pid, onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    async parseReceipt() {
      return null
    },
    async quickEntry() {
      return null
    },
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const api: Api = url && key ? supabaseApi(createClient(url, key)) : demoApi()
