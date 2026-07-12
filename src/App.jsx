import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { repo } from './data/repository.js'
import { AuthProvider } from './auth/AuthContext.jsx'
import RequireAuth from './auth/RequireAuth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import IssueList from './pages/IssueList.jsx'
import IssueDetail from './pages/IssueDetail.jsx'
import RaiseIssue from './pages/RaiseIssue.jsx'
import KpiAnalytics from './pages/KpiAnalytics.jsx'

// Boots the read-only seed database once, then renders the routed app.
export default function App() {
  const [boot, setBoot] = useState('loading')

  useEffect(() => {
    repo.init().then(() => setBoot('ready')).catch((e) => setBoot(String(e)))
  }, [])

  if (boot === 'loading')
    return <div className="boot"><div className="spinner" />Loading PPMS…</div>
  if (boot !== 'ready')
    return <div className="boot">Failed to load database<br />{boot}</div>

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={<RequireAuth><Layout /></RequireAuth>}
        >
          <Route index element={<Dashboard />} />
          <Route path="issues" element={<IssueList />} />
          <Route path="issues/new" element={<RequireAuth role="corporate"><RaiseIssue /></RequireAuth>} />
          <Route path="issues/:id" element={<IssueDetail />} />
          <Route path="kpi" element={<KpiAnalytics />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
