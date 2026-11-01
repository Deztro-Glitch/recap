import { useRef, useState } from 'react'
import { IconFileTypePdf, IconTrash, IconUpload } from '@tabler/icons-react'
import { api } from '../lib/api'
import { Loader, useToast } from './ui'

export const isPdf = (path: string) => path.endsWith('.pdf') || path.startsWith('data:application/pdf')

// Väljer en bild eller PDF, laddar upp den direkt och lämnar tillbaka sökvägen.
export function FileField({ pid, label, path, url, accept = 'image/*,application/pdf', onChange }: {
  pid: string
  label: string
  path: string | null
  url?: string
  accept?: string
  onChange: (path: string | null, url?: string) => void
}) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | undefined>()

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const p = await api.uploadFile(pid, file)
      const local = URL.createObjectURL(file)
      setPreview(local)
      onChange(p, local)
    } catch (err: any) {
      toast({ title: 'Filen kunde inte laddas upp', body: err.message })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const shown = preview ?? url

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {busy ? (
        <Loader />
      ) : path ? (
        <div className="file">
          <a className="file__preview" href={shown} target="_blank" rel="noreferrer">
            {isPdf(path) ? <IconFileTypePdf size={28} /> : shown && <img src={shown} alt="" />}
          </a>
          <div className="file__actions">
            <button type="button" className="btn btn--secondary" onClick={() => input.current?.click()}>Byt fil</button>
            <button
              type="button"
              className="btn btn--ghost"
              aria-label="Ta bort filen"
              onClick={() => {
                setPreview(undefined)
                onChange(null)
              }}
            >
              <IconTrash size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn--secondary" onClick={() => input.current?.click()}>
            <IconUpload size={16} /> Fota eller välj fil
          </button>
        </div>
      )}
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  )
}

export function FileThumb({ path, url, size = 40 }: { path: string; url?: string; size?: number }) {
  return (
    <span className="thumb" style={{ width: size, height: size }}>
      {isPdf(path) ? <IconFileTypePdf size={size * 0.5} /> : url && <img src={url} alt="" />}
    </span>
  )
}
