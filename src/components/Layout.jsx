import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import NotificationCenter from './NotificationCenter.jsx'

// Nav is data-driven so later modules just flip `soon` off / add a route.
const NAV = {
  corporate: [
    { to: '/', label: 'Dashboard', icon: '▦', end: true },
    { to: '/monitoring', label: 'Condition Monitoring', icon: '🩺' },
    { to: '/issues', label: 'Issues', icon: '❏' },
    { to: '/kpi', label: 'KPI Analytics', icon: '📈' },
    { to: '/escalations', label: 'Escalations', icon: '⇧' },
    { to: '/audit', label: 'Audit Log', icon: '📜' },
    { to: '/reports', label: 'Reports', icon: '⤓' },
    { to: '/sla', label: 'SLA Admin', icon: '⚙' },
  ],
  plant: [
    { to: '/', label: 'Dashboard', icon: '▦', end: true },
    { to: '/monitoring', label: 'Condition Monitoring', icon: '🩺' },
    { to: '/issues', label: 'My Issues', icon: '❏' },
    { to: '/kpi', label: 'KPI Analytics', icon: '📈' },
    { to: '/audit', label: 'Audit Log', icon: '📜' },
    { to: '/reports', label: 'Reports', icon: '⤓' },
  ],
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase()
}

export default function Layout() {
  const { user, logout, isPlantHead } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)

  const refreshUnread = useCallback(() => {
    repo.listNotifications(user.id).then((ns) => setUnread(ns.filter((n) => !n.read).length))
  }, [user.id])
  useEffect(() => { refreshUnread() }, [refreshUnread])

  const nav = NAV[user.role] || NAV.plant
  const scope = user.role === 'corporate'
    ? 'All sites'
    : `${repo.siteName(user.site_id)}${isPlantHead ? ' · site-wide' : ' · ' + repo.deptName(user.dept_id)}`

  function resetDemo() {
    if (!confirm('Reset all demo changes back to the seeded state? Your session stays signed in.')) return
    repo.resetDemoData().then(() => window.location.reload())
  }

  return (
    <div className="shell">
      <div className="demo-banner">
        Demo build · simulated authentication &amp; workflow engine · not a secure production system
      </div>
      <div className="shell-body">
        <aside className="sidebar-nav">
          <div className="nav-brand">
            <span className="login-mark sm">PPMS</span>
            <span className="nav-brand-txt">Bharat Thermal Power</span>
          </div>
          <nav className="nav-list">
            {nav.map((item) => item.soon ? (
              <span key={item.label} className="nav-item soon" title="Coming in a later module">
                <span className="nav-ico">{item.icon}</span>{item.label}<span className="soon-tag">soon</span>
              </span>
            ) : (
              <NavLink key={item.label} to={item.to} end={item.end}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-ico">{item.icon}</span>{item.label}
              </NavLink>
            ))}
          </nav>
          <div className="spacer" />
          <div className="user-card">
            <div className="user-row">
              <span className="avatar">{initials(user.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="user-name">{user.name}</div>
                <div className="user-title">{user.title}</div>
              </div>
            </div>
            <div className="user-scope"><span className={`badge ${user.role === 'corporate' ? 'low' : 'neutral'}`}>{user.role}</span> {scope}</div>
            <div className="user-actions">
              <button className="btn ghost" onClick={resetDemo} title="Restore seeded demo data">Reset demo</button>
              <button className="btn ghost" onClick={() => { logout(); navigate('/login') }}>Sign out</button>
            </div>
          </div>
        </aside>

        <div className="content-col">
          <header className="topbar-app">
            {/* mobile-only brand + nav (sidebar is hidden on narrow screens) */}
            <span className="topbar-brand-m"><span className="login-mark sm">PPMS</span></span>
            <div className="spacer" />
            <div className="clock-chip mono" title="Virtual 'today' for the demo">
              {new Date(repo.getVirtualToday() * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <div className="bell-wrap">
              <button className="bell" aria-label={`${unread} unread notifications`} title={`${unread} unread notifications`} onClick={() => setNotifOpen((o) => !o)}>
                🔔{unread > 0 && <span className="bell-count">{unread}</span>}
              </button>
              {notifOpen && <NotificationCenter user={user} onClose={() => setNotifOpen(false)} onChanged={refreshUnread} />}
            </div>
            <button className="mobile-signout btn ghost" onClick={() => { logout(); navigate('/login') }}>Sign out</button>
          </header>
          <nav className="mobile-nav" aria-label="Primary">
            {nav.filter((i) => !i.soon).map((item) => (
              <NavLink key={item.label} to={item.to} end={item.end}
                className={({ isActive }) => `mnav-item${isActive ? ' active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">{item.icon}</span>{item.label}
              </NavLink>
            ))}
          </nav>
          <main className="content-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
