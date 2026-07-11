// shared formatting + workflow constants used across issue pages.

export const SEV_CLASS = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' }
export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

export const STATUSES = [
  'Open', 'Under Investigation', 'Action Initiated', 'Awaiting Verification', 'Closed',
]

export function statusClass(status) {
  if (status === 'Closed') return 'closed'
  if (status === 'Open') return 'open'
  return 'neutral'
}

const DAY = 86400
export const fmtDate = (ts) =>
  ts ? new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtDateShort = (ts) =>
  ts ? new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'
export const fmtDateTime = (ts) =>
  ts ? new Date(ts * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export const daysBetween = (a, b) => Math.floor((b - a) / DAY)

// epoch (seconds) <-> yyyy-mm-dd for <input type=date>
export const toDateInput = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '')
export const fromDateInput = (s) => (s ? Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000) : null)

// KPI deviation label, e.g. "+45.0 kcal/kWh (worse)"
export function deviationText(kpi, actual, benchmark) {
  if (actual == null || benchmark == null) return '—'
  const d = actual - benchmark
  const sign = d >= 0 ? '+' : ''
  const worse = kpi?.direction === 'lower' ? d > 0 : d < 0
  return `${sign}${d.toFixed(2)} ${kpi?.unit || ''}${worse ? ' · off benchmark' : ''}`
}
