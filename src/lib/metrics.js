// metrics.js -- pure dashboard aggregations over issue lists.
// All functions take plain arrays so they're trivially testable and stay
// independent of the repository/UI.

const DAY = 86400
export const isOpen = (i) => i.status !== 'Closed'
export const isOverdue = (i, now) => isOpen(i) && i.target_date && i.target_date < now

export function severityCounts(issues) {
  const c = { Low: 0, Medium: 0, High: 0, Critical: 0 }
  for (const i of issues) if (c[i.severity] != null) c[i.severity]++
  return c
}

export function statusCounts(issues) {
  const c = {}
  for (const i of issues) c[i.status] = (c[i.status] || 0) + 1
  return c
}

// open issues per site, split by severity (for a stacked bar)
export function bySite(issues) {
  const m = {}
  for (const i of issues) {
    if (!isOpen(i)) continue
    const r = (m[i.site_id] ||= { site_id: i.site_id, Low: 0, Medium: 0, High: 0, Critical: 0, total: 0 })
    r[i.severity] = (r[i.severity] || 0) + 1
    r.total++
  }
  return Object.values(m).sort((a, b) => b.total - a.total)
}

// open issues per department
export function byDept(issues) {
  const m = {}
  for (const i of issues) {
    if (!isOpen(i)) continue
    m[i.dept_id] = (m[i.dept_id] || 0) + 1
  }
  return Object.entries(m).map(([dept_id, count]) => ({ dept_id, count })).sort((a, b) => b.count - a.count)
}

// aging buckets for open issues, aligned to the SLA thresholds (3/7/15 days)
export function agingBuckets(issues, now) {
  const b = [
    { bucket: '0–3d', count: 0 }, { bucket: '3–7d', count: 0 },
    { bucket: '7–15d', count: 0 }, { bucket: '>15d', count: 0 },
  ]
  for (const i of issues) {
    if (!isOpen(i)) continue
    const d = (now - i.created_at) / DAY
    if (d < 3) b[0].count++
    else if (d < 7) b[1].count++
    else if (d < 15) b[2].count++
    else b[3].count++
  }
  return b
}

// SLA compliance from closed issues: closed on/before target = on-time
export function slaCompliance(issues) {
  let onTime = 0, breached = 0
  for (const i of issues) {
    if (i.status !== 'Closed' || !i.closed_at) continue
    if (!i.target_date || i.closed_at <= i.target_date) onTime++
    else breached++
  }
  const total = onTime + breached
  return { onTime, breached, total, pct: total ? Math.round((onTime / total) * 100) : 0 }
}

// resolution-time analytics over closed issues
export function resolutionStats(issues) {
  const closed = issues.filter((i) => i.status === 'Closed' && i.closed_at)
  const days = closed.map((i) => (i.closed_at - i.created_at) / DAY)
  const avg = days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0
  const bySev = {}
  for (const i of closed) {
    const d = (i.closed_at - i.created_at) / DAY
    ;(bySev[i.severity] ||= []).push(d)
  }
  const bySeverity = Object.entries(bySev).map(([severity, arr]) => ({
    severity, avg: arr.reduce((a, b) => a + b, 0) / arr.length,
  }))
  return { count: closed.length, avgDays: avg, bySeverity }
}

// equipment type (ekey) from an id like 'TLC-U1-CW_PUMP' -> 'CW_PUMP'
export function equipType(id) {
  if (!id) return null
  return id.split('-').slice(2).join('-')
}

// top equipment TYPES by issue count (aggregated across sites/units)
export function equipmentTrends(issues, topN = 6) {
  const m = {}
  for (const i of issues) {
    const t = equipType(i.equipment_id)
    if (!t) continue
    m[t] = (m[t] || 0) + 1
  }
  return Object.entries(m).map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count).slice(0, topN)
}

// escalated open issues, using a repo.escalationFor-style function
export function escalated(issues, escalationFor, rules, now) {
  return issues.filter(isOpen)
    .map((i) => ({ issue: i, ...escalationFor(i, rules, now) }))
    .filter((e) => e.level >= 1)
    .sort((a, b) => b.level - a.level || b.days - a.days)
}

// how far a KPI's latest value is off benchmark, in the "bad" direction,
// normalised by its critical threshold. >1 = past critical. Signed so
// negative means better-than-benchmark.
export function kpiDeviationScore(def, value) {
  if (!def || value == null || !def.benchmark) return 0
  const rel = (value - def.benchmark) / Math.abs(def.benchmark)
  const bad = def.direction === 'lower' ? rel : -rel
  return def.critical_pct ? bad / def.critical_pct : bad
}
