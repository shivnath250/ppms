import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { fmtDateTime } from '../lib/format.js'

const KIND_ICON = { assigned: '❏', escalation: '⇧', closed: '✓', info: 'ℹ', }

// dropdown panel anchored under the topbar bell
export default function NotificationCenter({ user, onClose, onChanged }) {
  const [items, setItems] = useState(null)
  const navigate = useNavigate()

  useEffect(() => { repo.listNotifications(user.id, 'inapp').then(setItems) }, [user.id])

  async function open(n) {
    await repo.markNotificationRead(n.id)
    onChanged?.()
    onClose()
    if (n.issue_id) navigate(`/issues/${n.issue_id}`)
  }
  async function markAll() {
    await repo.markAllNotificationsRead(user.id)
    const next = await repo.listNotifications(user.id, 'inapp')
    setItems(next); onChanged?.()
  }

  return (
    <>
      <div className="notif-scrim" onClick={onClose} />
      <div className="notif-panel card">
        <div className="notif-head">
          <span>Notifications</span>
          <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={markAll}>Mark all read</button>
        </div>
        <div className="notif-body">
          {!items ? <div className="notif-empty">Loading…</div>
            : items.length === 0 ? <div className="notif-empty">No notifications.</div>
              : items.map((n) => (
                <button key={n.id} className={`notif-row${n.read ? '' : ' unread'}`} onClick={() => open(n)}>
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
        <div className="notif-foot">
          <Link to="/notifications" onClick={onClose}>Open notification center →</Link>
        </div>
      </div>
    </>
  )
}
