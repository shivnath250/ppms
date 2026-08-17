import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { fmtDateTime } from '../lib/format.js'

// Immutable audit-trail viewer. Corporate sees the whole fleet; plant users
// see only entries for issues in their scope. There is deliberately no way to
// edit or delete an audit record anywhere in the app.
export default function AuditLog() {
  const { user } = useAuth()
  const [audit, setAudit] = useState(null)
  const [issueMap, setIssueMap] = useState({})
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([repo.listAllAudit(), repo.listIssuesForUser(user)]).then(([a, issues]) => {
      const map = {}
      for (const i of issues) map[i.id] = i
      setIssueMap(map)
      setAudit(a.filter((e) => map[e.entity_id]))   // scope to visible issues
    })
  }, [user])

  const rows = useMemo(() => {
    if (!audit) return []
    if (!q) return audit
    const needle = q.toLowerCase()
    return audit.filter((e) => {
      const iss = issueMap[e.entity_id]
      return `${e.entity_id} ${iss?.title || ''} ${repo.userName(e.user_id)} ${e.field} ${e.new_value} ${e.comment}`.toLowerCase().includes(needle)
    })
  }, [audit, q, issueMap])

  if (!audit) return <div className="muted">Loading…</div>

  function change(e) {
    if (e.field === 'status') return <>status {e.old_value ? <>{e.old_value} → </> : ''}<b>{e.new_value}</b></>
    if (e.field === 'progress_pct') return <>progress {e.old_value}% → <b>{e.new_value}%</b></>
    if (e.field === 'escalation_level') return <>escalated to <b>L{e.new_value}</b></>
    if (e.field === 'assignment') return <>routed to <b>{e.new_value}</b></>
    return <>{e.field}: <b>{e.new_value}</b></>
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Audit trail</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            Immutable, append-only record of every change. {rows.length} entries{user.role === 'corporate' ? ' · fleet-wide' : ' · your scope'}.
          </p>
        </div>
      </div>

      <div className="filter-row">
        <input className="filter-search" placeholder="Search issue, user, change…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Issue</th><th>Change</th><th>Note</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((e) => (
              <tr key={e.id}>
                <td className="mono faint" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.ts)}</td>
                <td>{repo.userName(e.user_id)}</td>
                <td><Link to={`/issues/${e.entity_id}`} className="mono">{e.entity_id}</Link></td>
                <td className="muted">{change(e)}</td>
                <td className="faint" style={{ fontSize: 12 }}>{e.comment}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="5" className="muted" style={{ textAlign: 'center', padding: 28 }}>No audit entries match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 300 && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Showing the 300 most recent of {rows.length} entries.</p>}
    </div>
  )
}
