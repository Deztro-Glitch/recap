import { useState } from 'react'
import { api } from '../lib/api'
import { Field, Primary } from '../components/ui'
import { Wordmark } from '../components/Shell'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.signIn(email, password)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <main className="main">
        <Wordmark />
        <form className="form auth__form" onSubmit={submit}>
          <h1>Logga in</h1>
          <Field label="Mejl">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required={!api.demo} />
          </Field>
          <Field label="Lösenord" error={error || undefined}>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required={!api.demo} />
          </Field>
          <div className="form__actions">
            <Primary disabled={busy}>{busy ? 'Loggar in' : 'Logga in'}</Primary>
          </div>
          {api.demo && <span className="status status--warning">Demoläge, data sparas bara i den här webbläsaren</span>}
        </form>
      </main>
    </div>
  )
}
