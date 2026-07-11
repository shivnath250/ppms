import { useEffect, useMemo, useState } from 'react'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'

const SEV = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' }
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

export default function Home() {
  const { user, isCorporate } = useAuth()
  const [issues, setIssues] = useState(null)
  const now = repo.getVirtualToday()

  useEffect(() => {
    repo.listIssuesForUser(user).then(setIssues)
  }, [user])

  const stats = useMemo(() => {
    if (!issues) return null
    const open = issues.filter((i) => i.status !== 'Closed')
    const closed = issues.filter((i) => i.status === 'Closed')
    const critical = open.filter((i) => i.severity === 'Critical')
    const overdue = open.filter((i) => i.target_date && i.target_date < now)
    const awaiting = issues.filter((i) => i.status === 'Awaiting Verification')
    const pending = open.filter((i) => ['Open', 'Under Investigation', 'Action Initiated'].includes(i.status))
    return { total: issues.length, open, closed, critical, overdue, awaiting, pending }
  }, [issues, now])

  if (!stats) return <div className="muted">Loading…</div>

  const cards = isCorporate
    ? [
        { label: 'Open Issues', value: stats.open.length, tone: 'accent' },
        { label: 'Critical', value: stats.critical.length, tone: 'critical' },
        { label: 'Overdue', value: stats.overdue.length, tone: 'high' },
        { label: 'Awaiting Verification', value: stats.awaiting.length, tone: 'medium' },
        { label: 'Closed (all time)', value: stats.closed.length, tone: 'green' },
      ]
    : [
        { label: 'Assigned to you', value: stats.open.length, tone: 'accent' },
        { label: 'Needs your action', value: stats.pending.length, tone: 'high' },
        { label: 'Overdue', value: stats.overdue.length, tone: 'critical' },
        { label: 'Awaiting verification', value: stats.awaiting.length, tone: 'medium' },
        { label: 'Recently closed', value: stats.closed.length, tone: 'green' },
      ]

  const recent = [...issues].sort((a, b) => b.created_at - a.created_at).slice(0, 8)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Welcome, {user.name.split(' ')[0]}</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {isCorporate
              ? 'Fleet-wide performance & issue overview across all sites.'
              : `Issues for ${repo.siteName(user.site_id)}${/plant head/i.test(user.title) ? ' (all departments)' : ' · ' + repo.deptName(user.dept_id)}.`}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className={`stat-card card tone-${c.tone}`}>
            <div className="stat-value mono">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="section-label">Recent issues in your scope</div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th><th>Title</th><th>Site / Dept</th><th>Severity</th><th>Status</th><th>Raised</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((i) => (
              <tr key={i.id}>
                <td className="mono faint">{i.id}</td>
                <td>{i.title}</td>
                <td className="muted">{repo.siteName(i.site_id)} · {repo.deptName(i.dept_id)}</td>
                <td><span className={`badge ${SEV[i.severity]}`}>{i.severity}</span></td>
                <td><span className={`badge ${i.status === 'Closed' ? 'closed' : 'open'}`}>{i.status}</span></td>
                <td className="mono faint">{fmtDate(i.created_at)}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td colSpan="6" className="muted" style={{ textAlign: 'center', padding: 24 }}>No issues in your scope yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Full dashboards, the issue workflow, KPI analytics, escalations and reports arrive in the next modules.
      </p>
    </div>
  )
}
