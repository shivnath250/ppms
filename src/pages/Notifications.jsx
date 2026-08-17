import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { fmtDateTime } from '../lib/format.js'

const KIND_ICON = { assigned: '❏', escalation: '⇧', closed: '✓', info: 'ℹ' }

export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('inapp')
  const [inapp, setInapp] = useState([])
  const [email, setEmail] = useState([])

  const load = () => {
    repo.listNotifications(user.id, 'inapp').then(setInapp)
    repo.listNotifications(user.id, 'email').then(setEmail)
  }
  useEffect(load, [user.id])

  async function openInapp(n) {
    await repo.markNotificationRead(n.id)
    if (n.issue_id) navigate(`/issues/${n.issue_id}`)
  }
  async function markAll() { await repo.markAllNotificationsRead(user.id); load() }

  const unread = inapp.filter((n) => !n.read).length

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Notification center</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>Alerts routed to you as issues move through the workflow.</p>
        </div>
        {tab === 'inapp' && unread > 0 && <button className="btn" onClick={markAll}>Mark all read</button>}
      </div>

      <div className="seg-tabs" style={{ marginBottom: 16 }}>
        <button className={`seg-tab${tab === 'inapp' ? ' on' : ''}`} onClick={() => setTab('inapp')}>In-app · {inapp.length}</button>
        <button className={`seg-tab${tab === 'email' ? ' on' : ''}`} onClick={() => setTab('email')}>Email outbox · {email.length}</button>
      </div>

      {tab === 'inapp' ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          {inapp.length === 0 ? <div className="notif-empty">No notifications.</div>
            : inapp.map((n) => (
              <button key={n.id} className={`notif-row wide${n.read ? '' : ' unread'}`} onClick={() => openInapp(n)}>
                <span className={`notif-ico k-${n.kind}`}>{KIND_ICON[n.kind] || '•'}</span>
                <div className="notif-txt">
                  <div className="notif-subject">{n.subject}</div>
                  <div className="notif-preview">{n.body}</div>
                  <div className="notif-time mono">{fmtDateTime(n.ts)}</div>
                </div>
                {!n.read && <span className="notif-dot" />}
              </button>
            ))}
        </div>
      ) : (
        <>
          <div className="masked-note" style={{ color: 'var(--muted)', borderColor: 'var(--border)', background: 'var(--panel-2)' }}>
            Simulated outbox — in this demo these emails are rendered here, not actually sent. In production a backend
            mail service would deliver them.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {email.length === 0 ? <div className="notif-empty">No emails.</div>
              : email.map((n) => (
                <div key={n.id} className="email-card card">
                  <div className="email-meta">
                    <span><b>From</b> PPMS System &lt;noreply@ppms.btp.in&gt;</span>
                    <span className="mono faint">{fmtDateTime(n.ts)}</span>
                  </div>
                  <div className="email-meta"><span><b>To</b> {user.email}</span></div>
                  <div className="email-subject">{n.subject}</div>
                  <div className="email-body">{n.body}</div>
                  {n.issue_id && <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => navigate(`/issues/${n.issue_id}`)}>Open {n.issue_id} →</button>}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
