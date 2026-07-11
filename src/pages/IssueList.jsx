import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { SEV_CLASS, statusClass, STATUSES, SEVERITIES, fmtDateShort, daysBetween } from '../lib/format.js'

export default function IssueList() {
  const { user, isCorporate } = useAuth()
  const navigate = useNavigate()
  const [issues, setIssues] = useState(null)
  const [f, setF] = useState({ q: '', status: 'all', severity: 'all', site: 'all', dept: 'all', view: 'active' })
  const now = repo.getVirtualToday()

  useEffect(() => { repo.listIssuesForUser(user).then(setIssues) }, [user])

  const sites = useMemo(() => (issues ? [...new Set(issues.map((i) => i.site_id))] : []), [issues])
  const depts = useMemo(() => (issues ? [...new Set(issues.map((i) => i.dept_id))] : []), [issues])

  const rows = useMemo(() => {
    if (!issues) return []
    return issues.filter((i) => {
      if (f.view === 'active' && i.status === 'Closed') return false
      if (f.view === 'closed' && i.status !== 'Closed') return false
      if (f.status !== 'all' && i.status !== f.status) return false
      if (f.severity !== 'all' && i.severity !== f.severity) return false
      if (f.site !== 'all' && i.site_id !== f.site) return false
      if (f.dept !== 'all' && i.dept_id !== f.dept) return false
      if (f.q) {
        const hay = `${i.id} ${i.title} ${i.observation}`.toLowerCase()
        if (!hay.includes(f.q.toLowerCase())) return false
      }
      return true
    }).sort((a, b) => b.created_at - a.created_at)
  }, [issues, f])

  if (!issues) return <div className="muted">Loading…</div>

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Issues</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {isCorporate ? 'Engineering issues across the fleet.' : 'Issues assigned to your scope.'} · {rows.length} shown
          </p>
        </div>
        {isCorporate && <Link className="btn primary" to="/issues/new">+ Raise issue</Link>}
      </div>

      <div className="filter-row">
        <div className="seg-tabs">
          {['active', 'closed', 'all'].map((v) => (
            <button key={v} className={`seg-tab${f.view === v ? ' on' : ''}`} onClick={() => setF((s) => ({ ...s, view: v }))}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <input className="filter-search" placeholder="Search id, title…" value={f.q} onChange={set('q')} />
        <select value={f.status} onChange={set('status')}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={f.severity} onChange={set('severity')}>
          <option value="all">All severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {isCorporate && sites.length > 1 && (
          <select value={f.site} onChange={set('site')}>
            <option value="all">All sites</option>
            {sites.map((s) => <option key={s} value={s}>{repo.siteName(s)}</option>)}
          </select>
        )}
        {depts.length > 1 && (
          <select value={f.dept} onChange={set('dept')}>
            <option value="all">All departments</option>
            {depts.map((d) => <option key={d} value={d}>{repo.deptName(d)}</option>)}
          </select>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th><th>Title</th><th>Site / Dept</th><th>Severity</th><th>Status</th><th>Progress</th><th>Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const overdue = i.status !== 'Closed' && i.target_date && i.target_date < now
              return (
                <tr key={i.id} className="clickable" onClick={() => navigate(`/issues/${i.id}`)}>
                  <td className="mono faint">{i.id}</td>
                  <td>{i.title}</td>
                  <td className="muted">{repo.siteName(i.site_id)} · {repo.deptName(i.dept_id)}</td>
                  <td><span className={`badge ${SEV_CLASS[i.severity]}`}>{i.severity}</span></td>
                  <td><span className={`badge ${statusClass(i.status)}`}>{i.status}</span></td>
                  <td style={{ minWidth: 90 }}>
                    <div className="progress"><span style={{ width: `${i.progress_pct || 0}%` }} /></div>
                  </td>
                  <td className={`mono ${overdue ? 'overdue-txt' : 'faint'}`}>
                    {overdue ? `${daysBetween(i.target_date, now)}d overdue` : fmtDateShort(i.target_date)}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 28 }}>No issues match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
