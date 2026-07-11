import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'

// Curated demo accounts surfaced as one-click logins so an interviewer can
// jump between roles instantly. All demo passwords are the same string.
const DEMO = [
  { email: 'ananya.rao@corp.btp.in', label: 'Corporate · Performance Analytics Engineer', tag: 'corporate' },
  { email: 'trb.vnd@btp.in',        label: 'Vindhya · Turbine Engineer',                  tag: 'plant' },
  { email: 'blr.krb@btp.in',        label: 'Korba · Boiler Engineer',                     tag: 'plant' },
  { email: 'planthead.tlc@btp.in',  label: 'Talcher · Plant Head (site-wide)',            tag: 'plant' },
]
const DEMO_PASSWORD = 'demo1234'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (user) navigate('/', { replace: true }) }, [user, navigate])

  async function submit(e, presetEmail) {
    e?.preventDefault()
    setBusy(true); setError('')
    const em = presetEmail || email
    const pw = presetEmail ? DEMO_PASSWORD : password
    const res = await login(em, pw)
    setBusy(false)
    if (res.ok) navigate('/', { replace: true })
    else setError(res.error)
  }

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="login-brand">
          <span className="login-mark">PPMS</span>
          <div>
            <div className="login-title">Performance Monitoring &amp; Issue Management</div>
            <div className="muted" style={{ fontSize: 12 }}>{repo.getMeta ? 'Bharat Thermal Power' : ''}</div>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@corp.btp.in" autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="demo1234" autoComplete="current-password" />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-divider"><span>or pick a demo role</span></div>
        <div className="demo-grid">
          {DEMO.map((d) => (
            <button key={d.email} className="demo-pick" onClick={(e) => submit(e, d.email)} disabled={busy}>
              <span className={`badge ${d.tag === 'corporate' ? 'low' : 'neutral'}`}>{d.tag}</span>
              <span className="demo-pick-label">{d.label}</span>
            </button>
          ))}
        </div>

        <div className="login-note">
          Simulated authentication for demonstration — every account uses the password
          <code style={{ margin: '0 4px' }}>demo1234</code>. Not a secure login system.
        </div>
      </div>
    </div>
  )
}
