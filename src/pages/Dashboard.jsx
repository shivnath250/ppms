import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { SEV_CLASS, statusClass, fmtDateShort, daysBetween } from '../lib/format.js'
import * as M from '../lib/metrics.js'
import { BarCard, HBarCard, DonutCard, Card, SEV_COLORS, CHART } from '../components/charts.jsx'
import { getEconomics, fmtINR } from '../lib/plantEconomics.js'
import { fleetImpact } from '../lib/impact.js'

export default function Dashboard() {
  const { user, isCorporate } = useAuth()
  const [issues, setIssues] = useState(null)
  useEffect(() => { repo.listIssuesForUser(user).then(setIssues) }, [user])
  if (!issues) return <div className="muted">Loading…</div>
  return isCorporate
    ? <CorporateDashboard user={user} issues={issues} />
    : <PlantDashboard user={user} issues={issues} />
}

// ---- shared bits -----------------------------------------------------------
function StatRow({ cards }) {
  return (
    <div className="stat-grid">
      {cards.map((c) => (
        <div key={c.label} className={`stat-card card tone-${c.tone}`}>
          <div className="stat-value mono">{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

function IssueMiniList({ items, empty, right }) {
  if (!items.length) return <div className="muted" style={{ fontSize: 13, padding: '6px 2px' }}>{empty}</div>
  return (
    <div className="mini-list">
      {items.map((i) => (
        <Link key={i.id} to={`/issues/${i.id}`} className="mini-row">
          <span className={`sev-dot ${SEV_CLASS[i.severity]}`} />
          <span className="mini-title">{i.title}</span>
          <span className="mini-meta">{repo.siteName(i.site_id)} · {repo.deptName(i.dept_id)}</span>
          <span className="mini-right">{right(i)}</span>
        </Link>
      ))}
    </div>
  )
}

// APM condition-monitoring highlights card (cross-module tie-in on the dashboard)
function ApmHighlights({ apm }) {
  const [risk, setRisk] = useState(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}apm_impact.json`).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setRisk(fleetImpact(d.issues, getEconomics()))
    }).catch(() => {})
  }, [])
  return (
    <div className="card apm-card">
      <div className="apm-head">
        <div>
          <div className="dash-card-title">Fleet Condition Monitoring <span className="apm-tag">APM module</span></div>
          <div className="dash-card-sub">Sensor-health snapshot · {apm.counts.total} equipment monitored</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {risk && <Link className="btn" to="/impact" title="Projected performance & cost impact">{fmtINR(risk.totalPerDay)}/day at risk →</Link>}
          <Link className="btn primary" to="/monitoring">Open module →</Link>
        </div>
      </div>
      <div className="apm-body">
        <div className="apm-stats">
          <div className="apm-fleet">
            <div className={`apm-fleet-val mono ${apm.fleetHealth >= 80 ? 'healthy-t2' : apm.fleetHealth >= 60 ? 'warn-t2' : 'alarm-t2'}`}>{apm.fleetHealth}%</div>
            <div className="stat-label">Fleet health</div>
          </div>
          <div className="apm-counts">
            <div><b className="mono critical-txt">{apm.counts.alarms}</b> alarms</div>
            <div><b className="mono high-txt">{apm.counts.warns}</b> warnings</div>
            <div><b className="mono muted">{apm.counts.healthy}</b> healthy</div>
          </div>
        </div>
        <div className="apm-list">
          <div className="section-label" style={{ margin: '0 0 8px' }}>Equipment needing attention</div>
          <div className="mini-list">
            {apm.top.slice(0, 5).map((e) => (
              <Link key={e.eid} to="/monitoring" className="mini-row">
                <span className={`sev-dot ${e.status === 'alarm' ? 'critical' : 'high'}`} />
                <span className="mini-title">{e.name}</span>
                <span className="mini-meta">{e.plant} · {e.worstLabel} {e.worstValue}{e.worstUnit || ''}</span>
                <span className="mini-right mono">{e.health}%</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CORPORATE
// ============================================================================
function CorporateDashboard({ user, issues }) {
  const now = repo.getVirtualToday()
  const [heat, setHeat] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function build() {
      const [sites, defs] = await Promise.all([repo.listSites(), repo.listKpiDefinitions()])
      const rows = []
      for (const s of sites) {
        const units = await repo.listUnits(s.id)
        const acc = {}
        for (const u of units) {
          const latest = await repo.latestKpis(u.id)
          for (const r of latest) (acc[r.kpi_key] ||= []).push(r.value)
        }
        const cells = defs.map((d) => {
          const arr = acc[d.kpi_key] || []
          const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
          return { def: d, value: avg, score: M.kpiDeviationScore(d, avg) }
        })
        rows.push({ site: s, cells })
      }
      if (!cancelled) setHeat({ defs, rows })
    }
    build()
    return () => { cancelled = true }
  }, [])

  const m = useMemo(() => {
    const open = issues.filter(M.isOpen)
    return {
      open, closed: issues.filter((i) => i.status === 'Closed'),
      critical: open.filter((i) => i.severity === 'Critical'),
      overdue: open.filter((i) => M.isOverdue(i, now)),
      awaiting: issues.filter((i) => i.status === 'Awaiting Verification'),
      bySite: M.bySite(issues), byDept: M.byDept(issues),
      aging: M.agingBuckets(issues, now), sla: M.slaCompliance(issues),
      res: M.resolutionStats(issues), equip: M.equipmentTrends(issues),
    }
  }, [issues, now])

  // escalations need the (sync) sla rules; listSlaRules is async → resolve once
  const [rules, setRules] = useState([])
  useEffect(() => { repo.listSlaRules().then(setRules) }, [])
  const escalations = useMemo(
    () => (rules.length ? M.escalated(issues, repo.escalationFor, rules, now) : []),
    [issues, rules, now])

  // APM condition-monitoring highlights (snapshot from the sibling module)
  const [apm, setApm] = useState(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}apm_summary.json`).then((r) => r.ok ? r.json() : null).then(setApm).catch(() => setApm(null))
  }, [])

  const navigate = useNavigate()
  const siteData = m.bySite.map((r) => ({ name: repo.siteName(r.site_id), site_id: r.site_id, Low: r.Low, Medium: r.Medium, High: r.High, Critical: r.Critical }))
  const deptData = m.byDept.map((r) => ({ name: repo.deptName(r.dept_id).replace(/ \(.*\)/, ''), dept_id: r.dept_id, value: r.count }))
  const agingData = m.aging.map((a) => ({ bucket: a.bucket, value: a.count }))
  const equipData = m.equip.map((r) => ({ name: repo.ekeyLabel(r.type), value: r.count }))
  const slaData = [
    { name: 'On time', value: m.sla.onTime, color: CHART.green },
    { name: 'Breached', value: m.sla.breached, color: CHART.critical },
  ]
  const AGE_PARAM = { '0–3d': '0-3', '3–7d': '3-7', '7–15d': '7-15', '>15d': '15+' }
  const toIssues = (params) => navigate(`/issues?${new URLSearchParams({ view: 'active', ...params }).toString()}`)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Corporate performance dashboard</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>Fleet-wide issue & KPI overview · virtual date {fmtDateShort(now)}</p>
        </div>
      </div>

      <StatRow cards={[
        { label: 'Open issues', value: m.open.length, tone: 'accent' },
        { label: 'Critical', value: m.critical.length, tone: 'critical' },
        { label: 'Overdue', value: m.overdue.length, tone: 'high' },
        { label: 'Awaiting verification', value: m.awaiting.length, tone: 'medium' },
        { label: 'SLA compliance', value: `${m.sla.pct}%`, tone: 'green' },
        { label: 'Avg resolution', value: `${m.res.avgDays.toFixed(1)}d`, tone: 'accent' },
      ]} />

      {apm && <ApmHighlights apm={apm} />}

      <div className="dash-grid">
        <BarCard title="Open issues by site" subtitle="stacked by severity — click a segment" data={siteData} xKey="name"
          bars={[
            { key: 'Low', color: SEV_COLORS.Low }, { key: 'Medium', color: SEV_COLORS.Medium },
            { key: 'High', color: SEV_COLORS.High }, { key: 'Critical', color: SEV_COLORS.Critical, last: true },
          ]}
          onBarClick={(entry, sev) => toIssues({ severity: sev, site: entry.site_id })} />
        <BarCard title="Issue aging" subtitle="open issues by age" data={agingData} xKey="bucket" color={CHART.high}
          onBarClick={(entry) => toIssues({ age: AGE_PARAM[entry.bucket] || 'all' })} />
        <BarCard title="Open issues by department" data={deptData} xKey="name"
          onBarClick={(entry) => toIssues({ dept: entry.dept_id })} />
        <DonutCard title="SLA compliance" subtitle={`${m.sla.total} closed with a target`} data={slaData}
          centerValue={`${m.sla.pct}%`} centerLabel="on time" />
        <HBarCard title="Top equipment by issues" subtitle="all statuses" data={equipData} />
        <Card title="Escalated issues" subtitle={`${escalations.length} past SLA`}>
          <IssueMiniList items={escalations.slice(0, 6).map((e) => e.issue)} empty="No issues past SLA."
            right={(i) => {
              const e = escalations.find((x) => x.issue.id === i.id)
              return <span className={`badge ${e.level >= 3 ? 'critical' : e.level === 2 ? 'high' : 'medium'}`}>L{e.level} · {e.days}d</span>
            }} />
        </Card>
      </div>

      <div className="section-label" style={{ marginTop: 28 }}>Plant performance heat map — latest daily KPI vs benchmark</div>
      <p className="muted" style={{ fontSize: 12, margin: '-6px 0 12px' }}>
        Each cell is the <b>most recent daily value</b> (24-hour average), averaged across the site's units, as of the virtual date {fmtDateShort(now)}. Daily KPI series span the last 120 days.
      </p>
      {!heat ? <div className="muted">Building heat map…</div> : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="heat">
            <thead>
              <tr><th>Site</th>{heat.defs.map((d) => <th key={d.kpi_key} title={d.label}>{shortKpi(d.label)}<span className="heat-unit">{d.unit}</span></th>)}</tr>
            </thead>
            <tbody>
              {heat.rows.map((r) => (
                <tr key={r.site.id}>
                  <td className="heat-site">{r.site.name}</td>
                  {r.cells.map((c) => (
                    <td key={c.def.kpi_key} className="heat-cell" style={{ background: heatColor(c.score) }} title={`${c.def.label}: ${c.value?.toFixed(1)} (bench ${c.def.benchmark})`}>
                      {c.value == null ? '—' : c.value.toFixed(c.value < 10 ? 2 : 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="heat-legend">
        <span><i style={{ background: heatColor(-1) }} /> better than benchmark</span>
        <span><i style={{ background: heatColor(0.4) }} /> drifting</span>
        <span><i style={{ background: heatColor(0.8) }} /> approaching critical</span>
        <span><i style={{ background: heatColor(1.5) }} /> past critical</span>
      </div>
    </div>
  )
}

function shortKpi(label) {
  return label.replace('Gross ', '').replace('Auxiliary Power Consumption', 'APC')
    .replace('Specific Coal Consumption', 'Sp. Coal').replace('Condenser Back Pressure', 'Back Press.')
    .replace('Plant Load Factor', 'PLF').replace('Unit Availability', 'Availability')
}
function heatColor(score) {
  if (score <= 0) return 'rgba(53,192,122,0.22)'
  if (score < 0.5) return 'rgba(217,167,42,0.16)'
  if (score < 1) return 'rgba(239,143,74,0.24)'
  return 'rgba(240,82,79,0.30)'
}

// ============================================================================
// PLANT
// ============================================================================
function PlantDashboard({ user, issues }) {
  const now = repo.getVirtualToday()
  const m = useMemo(() => {
    const open = issues.filter(M.isOpen)
    const needsAction = open.filter((i) => ['Open', 'Under Investigation', 'Action Initiated'].includes(i.status))
    const sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3 }
    return {
      open, closed: issues.filter((i) => i.status === 'Closed'),
      needsAction: [...needsAction].sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (a.target_date || 0) - (b.target_date || 0)),
      overdue: open.filter((i) => M.isOverdue(i, now)),
      awaiting: issues.filter((i) => i.status === 'Awaiting Verification'),
      upcoming: open.filter((i) => i.target_date).sort((a, b) => a.target_date - b.target_date),
      recentClosed: issues.filter((i) => i.status === 'Closed').sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0)),
      status: M.statusCounts(issues), res: M.resolutionStats(issues),
    }
  }, [issues, now])

  const statusData = Object.entries(m.status).map(([name, value]) => ({
    name, value, color: name === 'Closed' ? CHART.green : name === 'Open' ? CHART.medium : CHART.accent,
  }))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>{repo.siteName(user.site_id)} — plant dashboard</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {/plant head/i.test(user.title) ? 'All departments' : repo.deptName(user.dept_id)} · virtual date {fmtDateShort(now)}
          </p>
        </div>
      </div>

      <StatRow cards={[
        { label: 'Assigned (open)', value: m.open.length, tone: 'accent' },
        { label: 'Needs your action', value: m.needsAction.length, tone: 'high' },
        { label: 'Overdue', value: m.overdue.length, tone: 'critical' },
        { label: 'Awaiting verification', value: m.awaiting.length, tone: 'medium' },
        { label: 'Avg resolution', value: `${m.res.avgDays.toFixed(1)}d`, tone: 'green' },
      ]} />

      <div className="dash-grid">
        <Card title="Needs your action" subtitle="open, most severe first" wide>
          <IssueMiniList items={m.needsAction.slice(0, 8)} empty="Nothing pending — all caught up."
            right={(i) => <span className={`badge ${statusClass(i.status)}`}>{i.status}</span>} />
        </Card>
        <Card title="Upcoming due dates">
          <IssueMiniList items={m.upcoming.slice(0, 7)} empty="No open issues with a target date."
            right={(i) => {
              const overdue = i.target_date < now
              return <span className={`mono ${overdue ? 'overdue-txt' : 'faint'}`}>{overdue ? `${daysBetween(i.target_date, now)}d over` : fmtDateShort(i.target_date)}</span>
            }} />
        </Card>
        <DonutCard title="Status breakdown" data={statusData} centerValue={m.open.length} centerLabel="open" />
        <Card title="Recently closed" subtitle="last resolved">
          <IssueMiniList items={m.recentClosed.slice(0, 7)} empty="Nothing closed yet."
            right={(i) => <span className="mono faint">{fmtDateShort(i.closed_at)}</span>} />
        </Card>
      </div>
    </div>
  )
}
