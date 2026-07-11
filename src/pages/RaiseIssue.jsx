import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { SEVERITIES, toDateInput, fromDateInput } from '../lib/format.js'

// Corporate raises an engineering observation. Can be pre-filled from a KPI
// deviation (query params) by the KPI-analytics module later.
export default function RaiseIssue() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sp] = useSearchParams()

  const [sites2, setSites] = useState([])
  const [units, setUnits] = useState([])
  const [depts, setDepts] = useState([])
  const [equipment, setEquipment] = useState([])
  const [kpis, setKpis] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [form, setForm] = useState({
    site_id: sp.get('site') || '', unit_id: sp.get('unit') || '', dept_id: sp.get('dept') || '',
    equipment_id: '', kpi_key: sp.get('kpi') || '', severity: sp.get('severity') || 'Medium',
    title: sp.get('title') || '', observation: sp.get('observation') || '',
    benchmark_value: sp.get('benchmark') || '', actual_value: sp.get('actual') || '',
    impact_generation: '', target_date: toDateInput(repo.getVirtualToday() + 10 * 86400),
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([repo.listSites(), repo.listDepartments(), repo.listKpiDefinitions()])
      .then(([s, d, k]) => { setSites(s); setDepts(d); setKpis(k) })
  }, [])

  useEffect(() => { repo.listUnits(form.site_id).then(setUnits) }, [form.site_id])
  useEffect(() => { repo.listEquipment(form.unit_id, form.dept_id).then(setEquipment) }, [form.unit_id, form.dept_id])

  // when a KPI is chosen, auto-fill benchmark + default owning department
  const kpi = useMemo(() => kpis.find((k) => k.kpi_key === form.kpi_key), [kpis, form.kpi_key])
  useEffect(() => {
    if (kpi) {
      setForm((f) => ({ ...f, benchmark_value: f.benchmark_value || String(kpi.benchmark), dept_id: f.dept_id || kpi.dept_id }))
    }
  }, [kpi])

  async function submit(e) {
    e.preventDefault()
    if (!form.site_id || !form.dept_id || !form.title.trim()) {
      setErr('Site, department and a title are required.'); return
    }
    setBusy(true); setErr('')
    const bench = form.benchmark_value === '' ? null : Number(form.benchmark_value)
    const actual = form.actual_value === '' ? null : Number(form.actual_value)
    const issue = await repo.createIssue({
      ...form,
      benchmark_value: bench, actual_value: actual,
      deviation: bench != null && actual != null ? Number((actual - bench).toFixed(2)) : null,
      target_date: fromDateInput(form.target_date),
    }, user)
    navigate(`/issues/${issue.id}`)
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="breadcrumb-sm"><Link to="/issues">Issues</Link> › Raise issue</div>
      <h1 style={{ fontSize: 22, margin: '4px 0 4px' }}>Raise an engineering issue</h1>
      <p className="muted" style={{ marginTop: 0 }}>The issue is auto-routed to the selected department at the chosen site.</p>

      <form onSubmit={submit} className="card" style={{ padding: 22, marginTop: 12 }}>
        <div className="form-grid">
          <div className="field">
            <label>Site *</label>
            <select value={form.site_id} onChange={(e) => set('site_id', e.target.value)}>
              <option value="">Select site…</option>
              {sites2.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Unit</label>
            <select value={form.unit_id} onChange={(e) => set('unit_id', e.target.value)} disabled={!form.site_id}>
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Department *</label>
            <select value={form.dept_id} onChange={(e) => set('dept_id', e.target.value)}>
              <option value="">Select department…</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Equipment</label>
            <select value={form.equipment_id} onChange={(e) => set('equipment_id', e.target.value)} disabled={!form.unit_id}>
              <option value="">—</option>
              {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Parameter (KPI)</label>
            <select value={form.kpi_key} onChange={(e) => set('kpi_key', e.target.value)}>
              <option value="">—</option>
              {kpis.map((k) => <option key={k.kpi_key} value={k.kpi_key}>{k.label} ({k.unit})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Severity</label>
            <select value={form.severity} onChange={(e) => set('severity', e.target.value)}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Expected benchmark {kpi ? `(${kpi.unit})` : ''}</label>
            <input type="number" step="any" value={form.benchmark_value} onChange={(e) => set('benchmark_value', e.target.value)} />
          </div>
          <div className="field">
            <label>Actual value {kpi ? `(${kpi.unit})` : ''}</label>
            <input type="number" step="any" value={form.actual_value} onChange={(e) => set('actual_value', e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Title *</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Unit-2 Gross Heat Rate deviation" />
        </div>
        <div className="field">
          <label>Engineering observation</label>
          <textarea value={form.observation} onChange={(e) => set('observation', e.target.value)}
            placeholder="Describe the deviation, trend and probable cause…" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Impact on generation</label>
            <input value={form.impact_generation} onChange={(e) => set('impact_generation', e.target.value)}
              placeholder="e.g. ~12 MU/month cost impact at risk" />
          </div>
          <div className="field">
            <label>Target resolution date</label>
            <input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
          </div>
        </div>

        {err && <div className="login-error">{err}</div>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={busy}>{busy ? 'Raising…' : 'Raise & assign issue'}</button>
          <Link className="btn ghost" to="/issues">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
