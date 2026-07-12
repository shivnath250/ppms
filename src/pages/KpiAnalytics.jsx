import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Area, ComposedChart,
} from 'recharts'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { kpiDeviationScore } from '../lib/metrics.js'
import { CHART } from '../components/charts.jsx'

const tip = { background: '#171e2b', border: '1px solid #354256', borderRadius: 8, fontSize: 12 }
const fmtDay = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

// map a normalised deviation score to a severity label (null = within benchmark)
function sevFromScore(s) {
  if (s >= 1) return 'Critical'
  if (s >= 0.6) return 'High'
  if (s >= 0.3) return 'Medium'
  if (s > 0) return 'Low'
  return null
}
const SEV_CLASS = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' }

export default function KpiAnalytics() {
  const { user, isCorporate } = useAuth()
  const navigate = useNavigate()
  const lockedSite = isCorporate ? null : user.site_id

  const [sites, setSites] = useState([])
  const [defs, setDefs] = useState([])
  const [units, setUnits] = useState([])
  const [sel, setSel] = useState({ site: lockedSite || '', unit: '', kpi: '' })
  const [series, setSeries] = useState([])
  const [latest, setLatest] = useState([])

  useEffect(() => {
    Promise.all([repo.listSites(), repo.listKpiDefinitions()]).then(([s, d]) => {
      setSites(s); setDefs(d)
      const site = lockedSite || s[0].id
      setSel((x) => ({ ...x, site, kpi: d[0].kpi_key }))
    })
  }, [])

  useEffect(() => {
    if (!sel.site) return
    repo.listUnits(sel.site).then((u) => { setUnits(u); setSel((x) => ({ ...x, unit: u[0]?.id || '' })) })
  }, [sel.site])

  useEffect(() => {
    if (sel.unit) repo.latestKpis(sel.unit).then(setLatest)
  }, [sel.unit])

  useEffect(() => {
    if (sel.unit && sel.kpi) repo.kpiSeries(sel.unit, sel.kpi).then((rows) =>
      setSeries(rows.map((r) => ({ ...r, t: fmtDay(r.ts) }))))
  }, [sel.unit, sel.kpi])

  const def = useMemo(() => defs.find((d) => d.kpi_key === sel.kpi), [defs, sel.kpi])
  const latestVal = series.length ? series[series.length - 1].value : null
  const score = def ? kpiDeviationScore(def, latestVal) : 0
  const severity = sevFromScore(score)
  const deviation = def && latestVal != null ? latestVal - def.benchmark : null

  // critical threshold line for the chart
  const critLine = def
    ? def.direction === 'lower' ? def.benchmark * (1 + def.critical_pct) : def.benchmark * (1 - def.critical_pct)
    : null

  function raiseFromDeviation() {
    const unitNo = sel.unit.split('-U')[1]
    const params = new URLSearchParams({
      site: sel.site, unit: sel.unit, kpi: sel.kpi,
      severity: severity || 'Medium',
      title: `Unit-${unitNo} ${def.label} deviation`,
      observation: `${def.label} at ${latestVal?.toFixed(2)} ${def.unit} vs benchmark ${def.benchmark} ${def.unit}` +
        ` (${deviation >= 0 ? '+' : ''}${deviation?.toFixed(2)} ${def.unit}), flagged from the KPI trend.`,
      benchmark: String(def.benchmark), actual: latestVal != null ? latestVal.toFixed(2) : '',
    })
    navigate(`/issues/new?${params.toString()}`)
  }

  const set = (k) => (e) => setSel((x) => ({ ...x, [k]: e.target.value }))
  const ydomain = useMemo(() => {
    if (!series.length || !def) return ['auto', 'auto']
    const vals = series.map((r) => r.value).concat([def.benchmark, critLine])
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const pad = (hi - lo) * 0.12 || 1
    return [lo - pad, hi + pad]
  }, [series, def, critLine])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>KPI analytics</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            Daily performance trends vs benchmark. {isCorporate ? 'Flag a deviation to raise an issue.' : `Scoped to ${repo.siteName(user.site_id)}.`}
          </p>
        </div>
      </div>

      <div className="filter-row">
        <select value={sel.site} onChange={set('site')} disabled={!!lockedSite}>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={sel.unit} onChange={set('unit')}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={sel.kpi} onChange={set('kpi')}>
          {defs.map((d) => <option key={d.kpi_key} value={d.kpi_key}>{d.label}</option>)}
        </select>
      </div>

      {def && (
        <div className="card kpi-chart-card">
          <div className="kpi-chart-head">
            <div>
              <div className="kpi-chart-title">{def.label} <span className="faint mono">({def.unit})</span></div>
              <div className="muted" style={{ fontSize: 12 }}>{repo.siteName(sel.site)} · {units.find((u) => u.id === sel.unit)?.name}</div>
            </div>
            <div className="kpi-readout">
              <div className="kpi-readout-val mono">{latestVal?.toFixed(latestVal < 10 ? 2 : 0)}</div>
              <div className="kpi-readout-meta">
                <span className="faint">bench {def.benchmark}</span>
                {deviation != null && (
                  <span className={severity ? SEV_CLASS[severity] + '-txt' : 'faint'}>
                    {deviation >= 0 ? '+' : ''}{deviation.toFixed(2)} {def.unit}
                  </span>
                )}
                {severity
                  ? <span className={`badge ${SEV_CLASS[severity]}`}>{severity} deviation</span>
                  : <span className="badge closed">within benchmark</span>}
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={series} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="t" tick={{ fill: CHART.axis, fontSize: 10 }} minTickGap={40} />
              <YAxis domain={ydomain} tick={{ fill: CHART.axis, fontSize: 10 }} width={52} />
              <Tooltip contentStyle={tip} labelStyle={{ color: '#93a0b3' }}
                formatter={(v, n) => [Number(v).toFixed(2), n === 'value' ? 'Actual' : n]} />
              <ReferenceLine y={def.benchmark} stroke={CHART.green} strokeDasharray="5 4" strokeWidth={1.3}
                label={{ value: 'benchmark', position: 'insideTopLeft', fill: CHART.green, fontSize: 10 }} />
              {critLine != null && (
                <ReferenceLine y={critLine} stroke={CHART.critical} strokeDasharray="2 4" strokeOpacity={0.8}
                  label={{ value: 'critical', position: 'insideBottomLeft', fill: CHART.critical, fontSize: 10 }} />
              )}
              <Line type="monotone" dataKey="value" name="Actual" stroke={CHART.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>

          {isCorporate && (
            <div className="kpi-chart-actions">
              {severity
                ? <button className="btn primary" onClick={raiseFromDeviation}>⚑ Raise issue from this deviation</button>
                : <span className="muted" style={{ fontSize: 13 }}>KPI is within benchmark — nothing to flag.</span>}
            </div>
          )}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 26 }}>All KPIs for this unit</div>
      <div className="kpi-score-grid">
        {defs.map((d) => {
          const row = latest.find((r) => r.kpi_key === d.kpi_key)
          const v = row?.value
          const sc = kpiDeviationScore(d, v)
          const sv = sevFromScore(sc)
          return (
            <button key={d.kpi_key} className={`kpi-score card${sel.kpi === d.kpi_key ? ' active' : ''}`}
              onClick={() => setSel((x) => ({ ...x, kpi: d.kpi_key }))}>
              <span className={`kpi-score-bar ${sv ? SEV_CLASS[sv] : 'ok'}`} />
              <div className="kpi-score-label">{d.label}</div>
              <div className="kpi-score-val mono">{v?.toFixed(v < 10 ? 2 : 0)} <span className="faint">{d.unit}</span></div>
              <div className="kpi-score-dev mono">
                {v != null ? <>bench {d.benchmark} · {sv ? <span className={SEV_CLASS[sv] + '-txt'}>{sv}</span> : <span className="ok-txt">OK</span>}</> : '—'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
