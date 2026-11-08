import { useEffect, useState } from 'react'
import { IconPhoto, IconTrash, IconUserPlus, IconX } from '@tabler/icons-react'
import { api, type User } from '../../lib/api'
import { parseNum } from '../../lib/format'
import { emptyEconomy } from '../../lib/economy'
import { Chips, Field, useToast } from '../../components/ui'
import { initials } from '../../components/Shell'
import { KIND_LABEL, type Kind, type Member } from '../../types'
import type { ProjectState, ViewProps } from '../ProjectView'

export function Settings({ state, user, onDeleted }: ViewProps & { user: User; onDeleted: () => void }) {
  const toast = useToast()
  const p = state.project!
  const [f, setF] = useState({ name: p.name, kind: p.kind, address: p.address ?? '', budget: p.budget ? String(p.budget) : '', area: p.economy?.area ? String(p.economy.area).replace('.', ',') : '' })
  const [members, setMembers] = useState<Member[]>([])
  const [invite, setInvite] = useState('')
  const [inviteError, setInviteError] = useState('')

  const loadMembers = () => api.listMembers(p.id).then(setMembers)
  useEffect(() => {
    loadMembers()
  }, [])

  const isOwner = members.some((m) => m.user_id === user.id && m.role === 'owner')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    // Boarean ligger i economy och används för att räkna mått och ytor på planritningen.
    const economy = { ...(p.economy ?? emptyEconomy), area: parseNum(f.area) || undefined }
    await api.updateProject(p.id, { name: f.name.trim(), kind: f.kind, address: f.address.trim() || null, budget: parseNum(f.budget), economy })
    await state.reload()
    toast('Ändringarna är sparade')
  }

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError('')
    if (api.demo) return setInviteError('Delning fungerar när appen är kopplad till Supabase.')
    const email = invite.trim()
    const res = await api.invite(p.id, email)
    if (res === 'not_found') return setInviteError('Det finns inget konto med den mejladressen. Skapa kontot i Supabase först.')
    toast({ title: `${email} har lagts till`, body: `Personen kan nu redigera ${p.name}.` })
    setInvite('')
    loadMembers()
  }

  const del = async () => {
    if (!confirm(`Ta bort ${p.name} med alla inköp, jobb och bilder? Det går inte att ångra.`)) return
    await api.deleteProject(p.id)
    onDeleted()
  }

  return (
    <div>
      <div className="section-head"><h1>Inställningar</h1></div>

      <form className="section form" style={{ maxWidth: 460 }} onSubmit={save}>
        <Field label="Namn">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <div className="field">
          <span className="field__label">Typ</span>
          <Chips value={f.kind} onChange={(k) => setF({ ...f, kind: k })} options={(['lagenhet', 'hus', 'annat'] as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </div>
        <Field label="Adress">
          <input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label="Boarea (kvm)">
          <input className="input" inputMode="decimal" placeholder="58" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
        </Field>
        <Field label="Budget i kr">
          <input className="input" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        </Field>
        <div><button className="btn btn--secondary">Spara ändringar</button></div>
      </form>

      <BackgroundSetting state={state} />

      <div className="section" style={{ maxWidth: 460 }}>
        <div className="section-head"><h2>Delas med</h2></div>
        <div className="rows">
          {members.map((m) => (
            <div key={m.user_id} className="row" style={{ cursor: 'default' }}>
              <div className="row__main">
                <span className="avatar">{initials(m.email ?? '?')}</span>
                <div className="row__text">
                  <div className="row__title">{m.email ?? 'Okänd'}</div>
                  <div className="meta">{m.role === 'owner' ? 'Ägare' : 'Kan redigera'}{m.user_id === user.id ? ' · du' : ''}</div>
                </div>
              </div>
              {isOwner && m.user_id !== user.id && (
                <button className="btn btn--ghost" aria-label={`Ta bort ${m.email}`} onClick={() => api.removeMember(p.id, m.user_id).then(loadMembers)}>
                  <IconX size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <form className="form" style={{ marginTop: 12 }} onSubmit={sendInvite}>
          <Field label="Bjud in med mejl" error={inviteError || undefined}>
            <input className="input" type="email" placeholder="sara.lindqvist@gmail.com" value={invite} onChange={(e) => setInvite(e.target.value)} required />
          </Field>
          <div><button className="btn btn--secondary"><IconUserPlus size={16} /> Bjud in</button></div>
        </form>
      </div>

      <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--secondary" onClick={() => api.signOut()}>Logga ut</button>
        {isOwner && <button className="btn btn--danger" onClick={del}>Ta bort hemmet</button>}
      </div>
    </div>
  )
}

// Egen bakgrundsbild bakom glaset i Boende. Laddas upp som andra bilder; sökvägen sparas på hemmet.
function BackgroundSetting({ state }: { state: ProjectState }) {
  const toast = useToast()
  const p = state.project!
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!p.background_path) return setPreview(null)
    api.fileUrls([p.background_path]).then((u) => setPreview(u[p.background_path!] ?? null))
  }, [p.background_path])

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const old = p.background_path
      const path = await api.uploadFile(p.id, file)
      await api.updateProject(p.id, { background_path: path })
      if (old && !api.demo) await api.removeFile(old)
      await state.reload()
      toast('Bakgrunden är bytt')
    } catch (err: any) {
      toast({ title: 'Bakgrunden kunde inte sparas', body: err.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const old = p.background_path
    await api.updateProject(p.id, { background_path: null })
    if (old && !api.demo) await api.removeFile(old)
    await state.reload()
  }

  return (
    <div className="section" style={{ maxWidth: 460 }}>
      <div className="section-head"><h2>Bakgrund</h2></div>
      <div className="bg-pick">
        <div className="bg-pick__preview" style={preview ? { backgroundImage: `url("${preview}")` } : undefined}>
          {!preview && <IconPhoto size={22} stroke={1.6} />}
        </div>
        <div className="bg-pick__actions">
          <label className={`btn btn--secondary ${busy ? 'is-busy' : ''}`}>
            <IconPhoto size={16} /> {busy ? 'Laddar upp …' : preview ? 'Byt bild' : 'Välj bild'}
            <input type="file" accept="image/*" hidden onChange={pick} disabled={busy} />
          </label>
          {preview && <button type="button" className="btn btn--danger" onClick={remove}><IconTrash size={16} /> Ta bort</button>}
        </div>
      </div>
    </div>
  )
}
