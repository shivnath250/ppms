import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { repo } from '../data/repository.js'

// Editable SLA / escalation rules. Changes persist in the localStorage overlay
// and immediately re-run the escalation engine.
export default function SlaAdmin() {
  const [rules, setRules] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { repo.listSlaRules().then((r) => setRules(r.map((x) => ({ ...x })))) }, [])
  if (!rules) return <div className="muted">Loading…</div>

  const setField = (i, key, val) => setRules((rs) => rs.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  async function save() {
    const clean = rules
      .map((r) => ({ ...r, days_pending: Number(r.days_pending), level: Number(r.level) }))
      .sort((a, b) => a.days_pending - b.days_pending)
    await repo.updateSlaRules(clean)
    setSaved(true); setTimeout(() => setSaved(false), 1600)
  }
  async function reset() {
    await repo.updateSlaRules(null)          // clears the overlay override
    const r = await repo.listSlaRules()
    setRules(r.map((x) => ({ ...x })))
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22 }}>SLA &amp; escalation rules</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            When an open issue has been pending for the given number of days, it escalates to the responsible role.
          </p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>Level</th><th>Days pending ≥</th><th>Responsible role</th></tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i}>
                <td><span className={`badge ${r.level >= 3 ? 'critical' : r.level === 2 ? 'high' : 'medium'}`}>L{r.level}</span></td>
                <td style={{ width: 160 }}>
                  <input type="number" min="1" value={r.days_pending} onChange={(e) => setField(i, 'days_pending', e.target.value)} style={{ width: 90 }} />
                </td>
                <td><input value={r.role} onChange={(e) => setField(i, 'role', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={save}>{saved ? '✓ Saved & re-evaluated' : 'Save rules'}</button>
        <button className="btn ghost" onClick={reset}>Reset to defaults</button>
        <div className="spacer" />
        <Link className="btn ghost" to="/escalations">View escalations →</Link>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Saving re-runs the escalation engine against the current as-of date; any newly-crossed thresholds are logged and notified.
      </p>
    </div>
  )
}
