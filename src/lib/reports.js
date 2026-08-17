// reports.js -- builds structured report objects (title, columns, rows) from
// repository data. Each builder returns a shape the export utilities in
// export.js turn into Excel / PDF.
import { repo } from '../data/repository.js'
import { kpiDeviationScore } from './metrics.js'
import { fmtDate } from './format.js'

const DAY = 86400
function sevFromScore(s) {
  if (s >= 1) return 'Critical'; if (s >= 0.6) return 'High'; if (s >= 0.3) return 'Medium'; if (s > 0) return 'Low'; return 'OK'
}
const asOf = () => `as of ${fmtDate(repo.getVirtualToday())}`

// ---- 1) Monthly performance: fleet KPI averages per site --------------------
export function monthlyPerformance(sites, perf, kpiDefs) {
  const columns = [{ key: 'site', label: 'Site' }, ...kpiDefs.map((d) => ({ key: d.kpi_key, label: `${d.label} (${d.unit})` }))]
  const rows = sites.map((s) => {
    const r = { site: s.name }
    for (const d of kpiDefs) {
      const v = perf.bySite[s.id]?.[d.kpi_key]
      r[d.kpi_key] = v == null ? '' : Number(v.toFixed(2))
    }
    return r
  })
  return { id: 'monthly', title: 'Monthly Performance Report', subtitle: `Fleet KPI averages · ${asOf()}`, file: 'monthly_performance', sheet: 'Performance', landscape: true, columns, rows }
}

// ---- 2) Issue closure report -----------------------------------------------
export function issueClosure(issues) {
  const columns = [
    { key: 'id', label: 'Issue' }, { key: 'title', label: 'Title' }, { key: 'site', label: 'Site' },
    { key: 'dept', label: 'Dept' }, { key: 'severity', label: 'Severity' },
    { key: 'raised', label: 'Raised' }, { key: 'closed', label: 'Closed' },
    { key: 'days', label: 'Days to close' }, { key: 'ontime', label: 'On time' },
  ]
  const rows = issues.filter((i) => i.status === 'Closed' && i.closed_at)
    .sort((a, b) => b.closed_at - a.closed_at)
    .map((i) => ({
      id: i.id, title: i.title, site: repo.siteName(i.site_id), dept: repo.deptName(i.dept_id),
      severity: i.severity, raised: fmtDate(i.created_at), closed: fmtDate(i.closed_at),
      days: Math.round((i.closed_at - i.created_at) / DAY),
      ontime: !i.target_date || i.closed_at <= i.target_date ? 'Yes' : 'No',
    }))
  return { id: 'closure', title: 'Issue Closure Report', subtitle: `${rows.length} closed issues · ${asOf()}`, file: 'issue_closure', sheet: 'Closures', landscape: true, columns, rows }
}

// ---- 3) RCA summary --------------------------------------------------------
export function rcaSummary(issues) {
  const responses = repo.allResponses()
  const latestByIssue = {}
  for (const r of responses) {
    const cur = latestByIssue[r.issue_id]
    if (!cur || r.created_at > cur.created_at) latestByIssue[r.issue_id] = r
  }
  const columns = [
    { key: 'id', label: 'Issue' }, { key: 'title', label: 'Title' }, { key: 'site', label: 'Site' },
    { key: 'dept', label: 'Dept' }, { key: 'root_cause', label: 'Root cause' },
    { key: 'action_taken', label: 'Action taken' }, { key: 'status', label: 'Status' },
  ]
  const rows = issues.filter((i) => latestByIssue[i.id])
    .sort((a, b) => b.created_at - a.created_at)
    .map((i) => {
      const r = latestByIssue[i.id]
      return {
        id: i.id, title: i.title, site: repo.siteName(i.site_id), dept: repo.deptName(i.dept_id),
        root_cause: r.root_cause || '', action_taken: r.action_taken || '', status: i.status,
      }
    })
  return { id: 'rca', title: 'RCA Summary', subtitle: `${rows.length} issues with root-cause analysis · ${asOf()}`, file: 'rca_summary', sheet: 'RCA', landscape: true, columns, rows }
}

// ---- 4) Department performance ---------------------------------------------
export function deptPerformance(issues) {
  const now = repo.getVirtualToday()
  const m = {}
  for (const i of issues) {
    const r = (m[i.dept_id] ||= { total: 0, open: 0, closed: 0, overdue: 0, resSum: 0, resN: 0 })
    r.total++
    if (i.status === 'Closed') { r.closed++; if (i.closed_at) { r.resSum += (i.closed_at - i.created_at) / DAY; r.resN++ } }
    else { r.open++; if (i.target_date && i.target_date < now) r.overdue++ }
  }
  const columns = [
    { key: 'dept', label: 'Department' }, { key: 'total', label: 'Total' }, { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' }, { key: 'overdue', label: 'Overdue' }, { key: 'avg', label: 'Avg resolution (d)' },
  ]
  const rows = Object.entries(m).map(([dept, r]) => ({
    dept: repo.deptName(dept), total: r.total, open: r.open, closed: r.closed, overdue: r.overdue,
    avg: r.resN ? Number((r.resSum / r.resN).toFixed(1)) : '',
  })).sort((a, b) => b.total - a.total)
  return { id: 'dept', title: 'Department Performance Report', subtitle: asOf(), file: 'dept_performance', sheet: 'Departments', columns, rows }
}

// ---- 5) Plant performance scorecard ----------------------------------------
export function plantScorecard(sites, issues) {
  const now = repo.getVirtualToday()
  const bySite = {}
  for (const s of sites) bySite[s.id] = { open: 0, closed: 0, critical: 0, overdue: 0, onTime: 0, breach: 0, resSum: 0, resN: 0 }
  for (const i of issues) {
    const r = bySite[i.site_id]; if (!r) continue
    if (i.status === 'Closed') {
      r.closed++
      if (i.closed_at) { r.resSum += (i.closed_at - i.created_at) / DAY; r.resN++; if (!i.target_date || i.closed_at <= i.target_date) r.onTime++; else r.breach++ }
    } else {
      r.open++
      if (i.severity === 'Critical') r.critical++
      if (i.target_date && i.target_date < now) r.overdue++
    }
  }
  const columns = [
    { key: 'site', label: 'Site' }, { key: 'open', label: 'Open' }, { key: 'critical', label: 'Critical' },
    { key: 'overdue', label: 'Overdue' }, { key: 'closed', label: 'Closed' },
    { key: 'sla', label: 'SLA %' }, { key: 'avg', label: 'Avg res (d)' }, { key: 'grade', label: 'Grade' },
  ]
  const rows = sites.map((s) => {
    const r = bySite[s.id]
    const slaTot = r.onTime + r.breach
    const sla = slaTot ? Math.round((r.onTime / slaTot) * 100) : 100
    const avg = r.resN ? r.resSum / r.resN : 0
    // simple composite grade
    let pts = 100 - r.critical * 8 - r.overdue * 5 - (100 - sla) * 0.5
    const grade = pts >= 85 ? 'A' : pts >= 70 ? 'B' : pts >= 55 ? 'C' : 'D'
    return { site: s.name, open: r.open, critical: r.critical, overdue: r.overdue, closed: r.closed, sla: `${sla}%`, avg: avg ? Number(avg.toFixed(1)) : '', grade }
  })
  return { id: 'scorecard', title: 'Plant Performance Scorecard', subtitle: asOf(), file: 'plant_scorecard', sheet: 'Scorecard', landscape: true, columns, rows }
}

// ---- 6) KPI deviation report -----------------------------------------------
export function kpiDeviation(units, perf, kpiDefs) {
  const defByKey = Object.fromEntries(kpiDefs.map((d) => [d.kpi_key, d]))
  const columns = [
    { key: 'site', label: 'Site' }, { key: 'unit', label: 'Unit' }, { key: 'kpi', label: 'KPI' },
    { key: 'benchmark', label: 'Benchmark' }, { key: 'actual', label: 'Actual' },
    { key: 'deviation', label: 'Deviation' }, { key: 'severity', label: 'Severity' },
  ]
  const rows = []
  for (const u of units) {
    const vals = perf.byUnit[u.id] || {}
    for (const d of kpiDefs) {
      const v = vals[d.kpi_key]
      if (v == null) continue
      const score = kpiDeviationScore(d, v)
      const sev = sevFromScore(score)
      if (sev === 'OK') continue     // only report deviations
      rows.push({
        site: repo.siteName(u.site_id), unit: u.name, kpi: d.label,
        benchmark: d.benchmark, actual: Number(v.toFixed(2)),
        deviation: Number((v - d.benchmark).toFixed(2)), severity: sev,
      })
    }
  }
  const sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  rows.sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
  return { id: 'deviation', title: 'KPI Deviation Report', subtitle: `${rows.length} KPI deviations off benchmark · ${asOf()}`, file: 'kpi_deviation', sheet: 'Deviations', landscape: true, columns, rows }
}

// list of report builders with metadata for the picker
export const REPORTS = [
  { id: 'monthly', name: 'Monthly Performance', desc: 'Fleet KPI averages per site.', needs: 'perf' },
  { id: 'scorecard', name: 'Plant Scorecard', desc: 'Issue & SLA performance per site, with a grade.', needs: 'issues' },
  { id: 'deviation', name: 'KPI Deviation', desc: 'Every KPI currently off its benchmark.', needs: 'perf' },
  { id: 'closure', name: 'Issue Closure', desc: 'Closed issues with time-to-close and SLA outcome.', needs: 'issues' },
  { id: 'rca', name: 'RCA Summary', desc: 'Root-cause & corrective actions submitted by plants.', needs: 'issues' },
  { id: 'dept', name: 'Department Performance', desc: 'Open/closed/overdue and resolution by department.', needs: 'issues' },
]
