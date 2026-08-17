import { useEffect, useMemo, useState } from 'react'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import * as builders from '../lib/reports.js'
import { REPORTS } from '../lib/reports.js'
import { exportExcel, exportPdf, buildReport } from '../lib/export.js'

const PREVIEW_ROWS = 12

export default function Reports() {
  const { user, isCorporate } = useAuth()
  const [ctx, setCtx] = useState(null)
  const [sel, setSel] = useState(REPORTS[0].id)

  useEffect(() => {
    let cancelled = false
    async function prep() {
      const [issues, allSites, kpiDefs] = await Promise.all([
        repo.listIssuesForUser(user), repo.listSites(), repo.listKpiDefinitions(),
      ])
      // scope sites/units for plant users to their own site
      const sites = isCorporate ? allSites : allSites.filter((s) => s.id === user.site_id)
      const units = []
      const byUnit = {}, bySiteAcc = {}
      for (const s of sites) {
        const us = await repo.listUnits(s.id)
        for (const u of us) {
          units.push(u)
          const latest = await repo.latestKpis(u.id)
          const map = {}
          for (const r of latest) {
            map[r.kpi_key] = r.value
            ;(bySiteAcc[s.id] ||= {})
            ;(bySiteAcc[s.id][r.kpi_key] ||= []).push(r.value)
          }
          byUnit[u.id] = map
        }
      }
      const bySite = {}
      for (const [sid, kmap] of Object.entries(bySiteAcc)) {
        bySite[sid] = {}
        for (const [k, arr] of Object.entries(kmap)) bySite[sid][k] = arr.reduce((a, b) => a + b, 0) / arr.length
      }
      if (!cancelled) setCtx({ sites, units, issues, kpiDefs, perf: { byUnit, bySite } })
    }
    prep()
    return () => { cancelled = true }
  }, [user, isCorporate])

  const report = useMemo(() => (ctx ? buildReport(sel, builders, ctx) : null), [ctx, sel])

  if (!ctx) return <div className="muted">Preparing report data…</div>

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Reports</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            Generate and export performance & issue reports{isCorporate ? ' across the fleet' : ` for ${repo.siteName(user.site_id)}`}.
          </p>
        </div>
      </div>

      <div className="reports-layout">
        <div className="report-menu">
          {REPORTS.map((r) => (
            <button key={r.id} className={`report-item${sel === r.id ? ' active' : ''}`} onClick={() => setSel(r.id)}>
              <div className="report-item-name">{r.name}</div>
              <div className="report-item-desc">{r.desc}</div>
            </button>
          ))}
        </div>

        <div className="report-view card">
          <div className="report-view-head">
            <div>
              <div className="report-view-title">{report.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{report.subtitle}</div>
            </div>
            <div className="row">
              <button className="btn" onClick={() => exportExcel(report)} disabled={!report.rows.length}>⤓ Excel</button>
              <button className="btn primary" onClick={() => exportPdf(report)} disabled={!report.rows.length}>⤓ PDF</button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table report-table">
              <thead>
                <tr>{report.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {report.rows.slice(0, PREVIEW_ROWS).map((r, idx) => (
                  <tr key={idx}>
                    {report.columns.map((c) => <td key={c.key}>{r[c.key] === '' || r[c.key] == null ? '—' : String(r[c.key])}</td>)}
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr><td colSpan={report.columns.length} className="muted" style={{ textAlign: 'center', padding: 24 }}>No data for this report.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {report.rows.length > PREVIEW_ROWS && (
            <div className="muted" style={{ fontSize: 12, padding: '10px 2px 0' }}>
              Previewing {PREVIEW_ROWS} of {report.rows.length} rows — export for the full report.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
