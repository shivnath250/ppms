import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { repo } from './data/repository.js'
import { AuthProvider } from './auth/AuthContext.jsx'
import RequireAuth from './auth/RequireAuth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'

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
          <Route index element={<Home />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
