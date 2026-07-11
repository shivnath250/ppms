import { useEffect, useState } from 'react'
import { repo } from './data/repository.js'

// Module 1 smoke-test shell. Auth, routing, dashboards and the issue
// workflow arrive in later modules; for now this proves the generated
// database loads in the browser and the repository layer reads it.
export default function App() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    repo.init()
      .then(async () => {
        const [sites, users, kpis, issues] = await Promise.all([
          repo.listSites(),
          repo.listUsers(),
          repo.listKpiDefinitions(),
          repo.listIssues(),
        ])
        setState({ status: 'ready', sites, users, kpis, issues })
      })
      .catch((e) => setState({ status: 'error', error: String(e) }))
  }, [])

  if (state.status === 'loading')
    return <div className="boot"><div className="spinner" />Loading PPMS database…</div>
  if (state.status === 'error')
    return <div className="boot">Failed to load database<br />{state.error}</div>

  const { sites, users, kpis, issues } = state
  return (
    <div style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
      <div className="demo-banner" style={{ borderRadius: 6, marginBottom: 24 }}>
        Demo build · simulated auth &amp; workflow · not a secure production system
      </div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>PPMS</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Power Plant Performance Monitoring &amp; Issue Management — Module 1 data layer online.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 24 }}>
        {[
          ['Sites', sites.length],
          ['Users', users.length],
          ['KPIs', kpis.length],
          ['Issues (seeded)', issues.length],
        ].map(([label, n]) => (
          <div key={label} className="card" style={{ padding: 16 }}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 600 }}>{n}</div>
            <div className="muted" style={{ fontSize: 12 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
