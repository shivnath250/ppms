import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEconomics, setEconomics, resetEconomics, ECON_FIELDS, fmtINR } from '../lib/plantEconomics.js'
import { fleetImpact } from '../lib/impact.js'

const SEV_CLASS = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' }

// map a computed impact to a PPMS issue severity + representative KPI (for the raise-issue prefill)
const KPI_FOR_TYPE = {
  CW_PUMP: 'cond_backpress', TURBINE: 'turbine_hr', MILL: 'boiler_eff',
  GENERATOR: 'availability', BFP: 'apc', FD_FAN: 'apc', ID_FAN: 'apc', PA_FAN: 'apc', CEP: 'apc',
}
function severityFor(imp) {
  if (imp.pTrip >= 0.5 || imp.totalRupeesPerDay >= 3e5) return 'Critical'
  if (imp.pTrip >= 0.25 || imp.totalRupeesPerDay >= 1e5) return 'High'
  if (imp.totalRupeesPerDay >= 4e4) return 'Medium'
  return 'Low'
}

export default function Impact() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [econ, setEcon] = useState(getEconomics())
  const [open, setOpen] = useState(null)          // expanded eid
  const [showAssume, setShowAssume] = useState(false)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}apm_impact.json`).then((r) => r.ok ? r.json() : null).then(setData).catch(() => setData({ issues: [] }))
  }, [])

  const fleet = useMemo(() => (data ? fleetImpact(data.issues, econ) : null), [data, econ])

  if (!data) return <div className="muted">Loading condition data…</div>

  function setField(k, v) {
    const next = { ...econ, [k]: Number(v) }
    setEcon(next); setEconomics(next)
  }
  function resetAssume() { setEcon(resetEconomics()) }

  function raiseIssue(issue, imp) {
    const kpi = KPI_FOR_TYPE[issue.type] || ''
    const sev = severityFor(imp)
    const parts = imp.contributors.map((c) => `${c.label}: ${c.detail} (${fmtINR(c.rupeesPerDay)}/day)`).join('; ')
    const params = new URLSearchParams({
      severity: sev, kpi,
      title: `${issue.name} (${issue.plant}) — condition-driven performance risk`,
      observation: `Condition monitoring flags ${issue.name} at ${issue.health}% health `
        + `(${issue.worst.label} ${issue.worst.value}${issue.worst.unit || ''}). Projected impact ≈ `
        + `${fmtINR(imp.totalRupeesPerDay)}/day at risk`
        + (imp.pTrip > 0 ? `, ${(imp.pTrip * 100).toFixed(0)}% ${imp.isCritical ? 'unit-trip' : 'derate'} probability` : '')
        + `. Drivers — ${parts}. Select the responsible site/department to assign.`,
    })
    navigate(`/issues/new?${params.toString()}`)
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>Performance Impact &amp; Risk</h1>
          <p className="muted" style={{ margin: '2px 0 0', maxWidth: 720 }}>
            Every equipment condition issue from the monitoring module, projected into plant-performance and
            economic terms — APC, heat rate, trip probability, and ₹ at risk. Modelled estimates (editable
            assumptions); a real deployment calibrates against unit test curves.
          </p>
        </div>
        <button className="btn" onClick={() => setShowAssume((s) => !s)}>⚙ Assumptions</button>
      </div>

      {showAssume && (
        <div className="card assume-card">
          <div className="assume-grid">
            {ECON_FIELDS.map((f) => (
              <label key={f.key} className="assume-field">
                <span>{f.label} <span className="faint">({f.unit})</span></span>
                <input type="number" step={f.step} value={econ[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={resetAssume}>Reset to defaults</button>
            <span className="muted" style={{ fontSize: 12 }}>Margin = ₹{(econ.realizationPerKwh - econ.variableCostPerKwh).toFixed(2)}/kWh · changes recompute everything live.</span>
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))' }}>
        <div className="stat-card card tone-critical"><div className="stat-value mono">{fmtINR(fleet.totalPerDay)}</div><div className="stat-label">Total at risk / day</div></div>
        <div className="stat-card card tone-high"><div className="stat-value mono">{fmtINR(fleet.totalPerMonth)}</div><div className="stat-label">Per month</div></div>
        <div className="stat-card card tone-accent"><div className="stat-value mono">{fleet.muPerMonth.toFixed(1)}</div><div className="stat-label">MU/month equivalent</div></div>
        <div className="stat-card card tone-medium"><div className="stat-value mono">{fleet.highRisk}</div><div className="stat-label">High-risk assets</div></div>
        <div className="stat-card card tone-green"><div className="stat-value mono">{fleet.co2PerDay.toFixed(0)}<span style={{ fontSize: 13 }}> t</span></div><div className="stat-label">Extra CO₂ / day</div></div>
        <div className="stat-card card tone-accent"><div className="stat-value mono">{fmtINR(fleet.maintExposure)}</div><div className="stat-label">Maint. exposure (one-off)</div></div>
      </div>

      <div className="section-label" style={{ marginTop: 26 }}>Condition issues ranked by ₹ at risk</div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table impact-table">
          <thead>
            <tr><th>Equipment</th><th>Health</th><th>Worst sensor</th><th>Projected impact</th><th>Trip prob</th><th style={{ textAlign: 'right' }}>₹ / day</th><th></th></tr>
          </thead>
          <tbody>
            {fleet.rows.map(({ issue, impact: imp }) => {
              const expanded = open === issue.eid
              return [
                <tr key={issue.eid} className="clickable" onClick={() => setOpen(expanded ? null : issue.eid)}>
                  <td><b>{issue.name}</b><div className="mono faint" style={{ fontSize: 11 }}>{issue.plant} · {issue.redundancy}</div></td>
                  <td><span className={`badge ${issue.status === 'alarm' ? 'critical' : 'high'}`}>{issue.health}%</span></td>
                  <td className="muted">{issue.worst.label}<div className="mono faint" style={{ fontSize: 11 }}>{issue.worst.value}{issue.worst.unit || ''} → trip {issue.worst.tripLimit ?? '—'}</div></td>
                  <td>
                    <div className="impact-badges">
                      {imp.extraAuxMW > 0 && <span className="ibadge apc">APC +{imp.extraAuxMW.toFixed(2)}MW</span>}
                      {imp.deltaHeatRate > 0 && <span className="ibadge hr">HR +{imp.deltaHeatRate.toFixed(0)}</span>}
                      {imp.pTrip > 0 && <span className="ibadge trip">{imp.isCritical ? 'Trip' : 'Derate'} {(imp.pTrip * 100).toFixed(0)}%</span>}
                    </div>
                  </td>
                  <td className="mono">{imp.pTrip > 0 ? `${(imp.pTrip * 100).toFixed(0)}%` : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtINR(imp.totalRupeesPerDay)}</td>
                  <td className="faint">{expanded ? '▾' : '▸'}</td>
                </tr>,
                expanded && (
                  <tr key={issue.eid + '-x'} className="impact-detail-row">
                    <td colSpan="7">
                      <div className="impact-detail">
                        <div className="impact-breakdown">
                          <div className="section-label" style={{ margin: '0 0 8px' }}>Impact breakdown</div>
                          {imp.contributors.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Below the modelling threshold.</div>}
                          {imp.contributors.map((c, idx) => (
                            <div key={idx} className="contrib-row">
                              <span className={`ibadge ${c.path}`}>{c.label}</span>
                              <span className="contrib-detail">{c.detail}</span>
                              <span className="mono contrib-rupees">{fmtINR(c.rupeesPerDay)}/day</span>
                            </div>
                          ))}
                          <div className="contrib-extra">
                            <span>Extra CO₂ ≈ <b className="mono">{imp.extraCO2PerDay.toFixed(1)} t/day</b></span>
                            <span>Avoidable maintenance ≈ <b className="mono">{fmtINR(imp.maintOneOff)}</b> ({imp.maintMult.toFixed(1)}× planned cost)</span>
                          </div>
                        </div>
                        <div className="impact-actions">
                          <button className="btn primary" onClick={() => raiseIssue(issue, imp)}>⚑ Raise performance issue</button>
                          <button className="btn ghost" onClick={() => navigate('/monitoring')}>Open in APM →</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Snapshot of the condition-monitoring fleet. Sensitivities are cited rules of thumb (back pressure→heat rate,
        APC composition, boiler-efficiency loss); the assumptions above are editable so the economics stay transparent.
      </p>
    </div>
  )
}
