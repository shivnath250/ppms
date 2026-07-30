import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { SEV_CLASS, fmtDate } from '../lib/format.js'
import * as M from '../lib/metrics.js'

const LEVEL_CLASS = { 1: 'medium', 2: 'high', 3: 'critical' }
const DAY = 86400

export default function Escalations() {
  const { user } = useAuth()
  const [issues, setIssues] = useState(null)
  const [rules, setRules] = useState([])
  const [now, setNow] = useState(repo.getVirtualToday())

  const load = useCallback(async () => {
    const [is, rl] = await Promise.all([repo.listIssuesForUser(user), repo.listSlaRules()])
    setIssues(is); setRules(rl); setNow(repo.getVirtualToday())
  }, [user])
  useEffect(() => { load() }, [load])

  async function shiftClock(days) {
    await repo.setVirtualToday(repo.getVirtualToday() + days * DAY)   // triggers reconciliation
    load()
  }
  async function resetClock() {
    const meta = await repo.getMeta()
    await repo.setVirtualToday(Number(meta.generated_at))
    load()
  }

  const escalated = useMemo(() => {
    if (!issues) return []
    return M.escalated(issues, repo.escalationFor, rules, now)
  }, [issues, rules, now])

  if (!issues) return <div className="muted">Loading…</div>

  const counts = { 1: 0, 2: 0, 3: 0 }
  for (const e of escalated) counts[e.level] = (counts[e.level] || 0) + 1

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Escalations</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            Open issues past their SLA thresholds, auto-routed up the chain. {escalated.length} escalated.
          </p>
        </div>
        <div className="clock-ctrl">
          <span className="clock-ctrl-label">As-of date</span>
          <span className="clock-ctrl-date mono">{fmtDate(now)}</span>
          <button className="btn ghost" onClick={() => shiftClock(1)}>+1d</button>
          <button className="btn ghost" onClick={() => shiftClock(7)}>+7d</button>
          <button className="btn ghost" onClick={resetClock} title="Back to the seeded date">Reset</button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        {rules.map((r) => (
          <div key={r.level} className={`stat-card card tone-${LEVEL_CLASS[r.level]}`}>
            <div className="stat-value mono">{counts[r.level] || 0}</div>
            <div className="stat-label">L{r.level} · {r.role} <span className="faint">(≥{r.days_pending}d)</span></div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden', marginTop: 6 }}>
        <table className="table">
          <thead>
            <tr><th>Level</th><th>Issue</th><th>Site / Dept</th><th>Severity</th><th>Days pending</th><th>Responsible</th><th>Target</th></tr>
          </thead>
          <tbody>
            {escalated.map(({ issue, level, days }) => {
              const respId = repo.responsibleUser(issue, level)
              return (
                <tr key={issue.id}>
                  <td><Link to={`/issues/${issue.id}`} className={`badge ${LEVEL_CLASS[level]}`} style={{ textDecoration: 'none' }}>L{level}</Link></td>
                  <td><Link to={`/issues/${issue.id}`} style={{ color: 'var(--text)' }}>{issue.title}</Link><div className="mono faint" style={{ fontSize: 11 }}>{issue.id}</div></td>
                  <td className="muted">{repo.siteName(issue.site_id)} · {repo.deptName(issue.dept_id)}</td>
                  <td><span className={`badge ${SEV_CLASS[issue.severity]}`}>{issue.severity}</span></td>
                  <td className="mono overdue-txt">{days}d</td>
                  <td>{repo.userName(respId)}<div className="mono faint" style={{ fontSize: 11 }}>{repo.responsibleRole(rules, level)}</div></td>
                  <td className="mono faint">{fmtDate(issue.target_date)}</td>
                </tr>
              )
            })}
            {escalated.length === 0 && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 28 }}>No issues past SLA at this date.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Escalation levels are derived from days pending against the SLA rules (editable in <Link to="/sla">SLA Admin</Link>).
        Advancing the as-of date runs the SLA engine — crossings write an audit entry and notify the responsible person.
      </p>
    </div>
  )
}
