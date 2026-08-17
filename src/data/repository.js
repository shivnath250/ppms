// repository.js -- the single data-access layer for PPMS.
//
// Why this exists: sql.js is an in-memory, read-only copy of public/ppms.db
// (it resets on reload). Live workflow changes are persisted in a localStorage
// "overlay" and merged over the seed on every read. All UI code talks ONLY to
// this module through a small async, promise-based API -- so a real backend
// (Postgres + REST) could later replace the internals without touching the UI.
// That is the honest version of the spec's "modular architecture / RESTful".

import { openDb, query } from './db.js'

const OVERLAY_KEY = 'ppms_overlay_v1'
const SESSION_KEY = 'ppms_session_v1'

// --- module state -----------------------------------------------------------
let db = null
let seed = null          // snapshot of read-only tables
let overlay = null       // mutable, persisted to localStorage

function blankOverlay() {
  return {
    issues: {},          // id -> patch (seed edits) or full object (created)
    responses: [],
    comments: [],
    attachments: [],
    audits: [],
    notifications: [],
    notifRead: {},       // notificationId -> true
    sla: null,           // override array or null (use seed)
    virtualToday: null,  // epoch seconds override or null
    counter: 0,
  }
}

function loadOverlay() {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY)
    overlay = raw ? { ...blankOverlay(), ...JSON.parse(raw) } : blankOverlay()
  } catch {
    overlay = blankOverlay()
  }
}

function save() {
  try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay)) } catch { /* quota */ }
}

function nextId(prefix) {
  overlay.counter += 1
  return `${prefix}-9${String(overlay.counter).padStart(4, '0')}`
}

// --- init: load DB + snapshot seed tables -----------------------------------
async function init() {
  if (seed) return
  db = await openDb()
  seed = {
    sites: query(db, 'SELECT * FROM site ORDER BY name'),
    units: query(db, 'SELECT * FROM unit ORDER BY id'),
    departments: query(db, 'SELECT * FROM department'),
    equipment: query(db, 'SELECT * FROM equipment'),
    users: query(db, 'SELECT * FROM app_user'),
    kpiDefs: query(db, 'SELECT * FROM kpi_definition'),
    issues: query(db, 'SELECT * FROM issue'),
    responses: query(db, 'SELECT * FROM issue_response'),
    comments: query(db, 'SELECT * FROM issue_comment'),
    attachments: query(db, 'SELECT * FROM issue_attachment'),
    audits: query(db, 'SELECT * FROM audit_log'),
    notifications: query(db, 'SELECT * FROM notification'),
    sla: query(db, 'SELECT * FROM sla_rule ORDER BY days_pending'),
    meta: Object.fromEntries(query(db, 'SELECT key,value FROM meta').map((r) => [r.key, r.value])),
  }
  loadOverlay()
  reconcileEscalations()   // run the SLA engine once on load
}

// --- merge helpers ----------------------------------------------------------
function mergedIssues() {
  const map = {}
  for (const it of seed.issues) map[it.id] = { ...it }
  for (const [id, patch] of Object.entries(overlay.issues)) map[id] = { ...(map[id] || {}), ...patch }
  return Object.values(map)
}

const asleep = (v) => Promise.resolve(v)   // keep the API async / backend-swappable

// ============================================================================
// ORG / REFERENCE DATA
// ============================================================================
function listSites() { return asleep(seed.sites) }
function listUnits(siteId) { return asleep(siteId ? seed.units.filter((u) => u.site_id === siteId) : seed.units) }
function listDepartments() { return asleep(seed.departments) }
function listEquipment(unitId, deptId) {
  return asleep(seed.equipment.filter((e) => (!unitId || e.unit_id === unitId) && (!deptId || e.dept_id === deptId)))
}
function listUsers() { return asleep(seed.users) }
function getUser(id) { return asleep(seed.users.find((u) => u.id === id) || null) }
function deptName(id) { return seed.departments.find((d) => d.id === id)?.name || id }
function siteName(id) { return seed.sites.find((s) => s.id === id)?.name || id }
function userName(id) {
  if (!id || id === 'system') return 'System'
  return seed.users.find((u) => u.id === id)?.name || id
}
function siteRegion(siteId) { return seed.sites.find((s) => s.id === siteId)?.region || null }
function kpiDef(key) { return seed.kpiDefs.find((k) => k.kpi_key === key) || null }
function equipmentLabel(id) { return seed.equipment.find((e) => e.id === id)?.label || id }
function ekeyLabel(ekey) { return seed.equipment.find((e) => e.ekey === ekey)?.label || ekey }

// ============================================================================
// AUTH (SIMULATED -- demo credentials, not secure)
// ============================================================================
function authenticate(email, password) {
  const u = seed.users.find((x) => x.email.toLowerCase() === String(email).toLowerCase().trim())
  if (!u || u.password !== password) return asleep(null)
  return asleep(u)
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
function setSession(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  else localStorage.removeItem(SESSION_KEY)
}

// role scoping: corporate sees all; plant sees own site; plant heads see the
// whole site, other plant users only their own department.
function canSeeIssue(user, issue) {
  if (!user) return false
  if (user.role === 'corporate') return true
  if (issue.site_id !== user.site_id) return false
  const isPlantHead = /plant head/i.test(user.title || '')
  return isPlantHead ? true : issue.dept_id === user.dept_id
}
function canVerify(user) { return !!user && user.role === 'corporate' }

// ============================================================================
// KPIs
// ============================================================================
function listKpiDefinitions() { return asleep(seed.kpiDefs) }
function kpiSeries(unitId, kpiKey) {
  return asleep(query(db, 'SELECT ts,value,benchmark FROM kpi_reading WHERE unit_id=? AND kpi_key=? ORDER BY ts', [unitId, kpiKey]))
}
function latestKpis(unitId) {
  return asleep(query(db, `
    SELECT k.kpi_key, k.value, k.benchmark FROM kpi_reading k
    JOIN (SELECT kpi_key, MAX(ts) mx FROM kpi_reading WHERE unit_id=? GROUP BY kpi_key) m
      ON m.kpi_key=k.kpi_key AND m.mx=k.ts
    WHERE k.unit_id=?`, [unitId, unitId]))
}

// ============================================================================
// ISSUES
// ============================================================================
function listIssues() { return asleep(mergedIssues()) }
function listIssuesForUser(user) { return asleep(mergedIssues().filter((it) => canSeeIssue(user, it))) }

function getIssue(id) {
  const issue = mergedIssues().find((it) => it.id === id) || null
  return asleep(issue)
}

function listResponses(issueId) {
  const all = [...seed.responses, ...overlay.responses].filter((r) => r.issue_id === issueId)
  return asleep(all.sort((a, b) => a.created_at - b.created_at))
}
function listComments(issueId) {
  const all = [...seed.comments, ...overlay.comments].filter((c) => c.issue_id === issueId)
  return asleep(all.sort((a, b) => a.created_at - b.created_at))
}
function listAttachments(issueId) {
  const all = [...seed.attachments, ...overlay.attachments].filter((a) => a.issue_id === issueId)
  return asleep(all)
}
function listAudit(issueId) {
  const all = [...seed.audits, ...overlay.audits].filter((a) => a.entity_id === issueId)
  return asleep(all.sort((a, b) => a.ts - b.ts))
}
function listAllAudit() {
  return asleep([...seed.audits, ...overlay.audits].sort((a, b) => b.ts - a.ts))
}

// --- writes -----------------------------------------------------------------
function now() { return overlay.virtualToday || Number(seed.meta.virtual_today) || Math.floor(Date.now() / 1000) }

function appendAudit(issueId, userId, field, oldVal, newVal, comment = '') {
  overlay.audits.push({
    id: nextId('AUD'), entity: 'issue', entity_id: issueId, user_id: userId,
    ts: now(), field, old_value: oldVal == null ? null : String(oldVal),
    new_value: newVal == null ? null : String(newVal), comment,
  })
}

function pushNotification(userId, issueId, kind, subject, body, channel = 'inapp') {
  if (!userId) return
  overlay.notifications.push({
    id: nextId('NTF'), user_id: userId, issue_id: issueId, kind, channel,
    subject, body, read: 0, ts: now(),
  })
}

function deptEngineer(siteId, deptId) {
  return seed.users.find((u) => u.site_id === siteId && u.dept_id === deptId && u.role === 'plant')?.id || null
}

async function createIssue(data, user) {
  const id = nextId('ISS')
  const ts = now()
  const issue = {
    id, site_id: data.site_id, unit_id: data.unit_id || null, dept_id: data.dept_id,
    equipment_id: data.equipment_id || null, kpi_key: data.kpi_key || null,
    severity: data.severity, title: data.title, observation: data.observation || '',
    benchmark_value: data.benchmark_value ?? null, actual_value: data.actual_value ?? null,
    deviation: data.deviation ?? null, impact_generation: data.impact_generation || '',
    target_date: data.target_date || (ts + 10 * 86400), created_by: user.id, created_at: ts,
    status: 'Open', progress_pct: 0, escalation_level: 0, closed_at: null,
  }
  overlay.issues[id] = issue
  appendAudit(id, user.id, 'status', null, 'Open', 'Issue raised')
  appendAudit(id, user.id, 'assignment', null, `${data.site_id}/${data.dept_id}`, 'Auto-routed to responsible department')
  const eng = deptEngineer(data.site_id, data.dept_id)
  pushNotification(eng, id, 'assigned', `New issue assigned: ${data.title}`, data.observation || '')
  pushNotification(eng, id, 'assigned', `[PPMS] Issue ${id} assigned to your department`, data.observation || '', 'email')
  save()
  return issue
}

// generic patch + audited field changes.
// changes: [{ field, old, new, comment }]
async function updateIssue(id, patch, user, changes = []) {
  overlay.issues[id] = { ...(overlay.issues[id] || {}), ...patch }
  for (const c of changes) appendAudit(id, user.id, c.field, c.old, c.new, c.comment || '')
  save()
  return getIssue(id)
}

async function addResponse(issueId, user, data, newStatus) {
  overlay.responses.push({
    id: nextId('RSP'), issue_id: issueId, user_id: user.id,
    root_cause: data.root_cause || '', action_taken: data.action_taken || '',
    preventive_action: data.preventive_action || '', expected_completion: data.expected_completion || null,
    status: newStatus, created_at: now(),
  })
  const issue = await getIssue(issueId)
  const changes = []
  if (newStatus && issue.status !== newStatus)
    changes.push({ field: 'status', old: issue.status, new: newStatus, comment: 'Plant response submitted' })
  if (data.progress_pct != null && data.progress_pct !== issue.progress_pct)
    changes.push({ field: 'progress_pct', old: issue.progress_pct, new: data.progress_pct })
  const patch = {}
  if (newStatus) patch.status = newStatus
  if (data.progress_pct != null) patch.progress_pct = data.progress_pct
  await updateIssue(issueId, patch, user, changes)
  // notify the corporate raiser when verification is requested
  if (newStatus === 'Awaiting Verification') pushNotification(issue.created_by, issueId, 'info', `Issue ${issueId} awaiting your verification`, data.action_taken || '')
  save()
  return getIssue(issueId)
}

async function verifyIssue(issueId, user, action, comment) {
  const issue = await getIssue(issueId)
  const map = {
    close: { status: 'Closed', field: 'status', comment: comment || 'Verified and accepted', closed: true },
    reopen: { status: 'Open', field: 'status', comment: comment || 'Reopened — corrective action insufficient' },
    info: { status: 'Under Investigation', field: 'status', comment: comment || 'Additional information requested' },
  }
  const m = map[action]
  const patch = { status: m.status }
  if (m.closed) { patch.closed_at = now(); patch.progress_pct = 100 }
  await updateIssue(issueId, patch, user, [{ field: 'status', old: issue.status, new: m.status, comment: m.comment }])
  const eng = deptEngineer(issue.site_id, issue.dept_id)
  const kind = action === 'close' ? 'closed' : 'info'
  pushNotification(eng, issueId, kind, `Issue ${issueId}: ${m.status}`, m.comment)
  save()
  return getIssue(issueId)
}

async function addComment(issueId, user, body) {
  overlay.comments.push({ id: nextId('CMT'), issue_id: issueId, user_id: user.id, body, created_at: now() })
  save()
  return listComments(issueId)
}

async function addAttachment(issueId, user, file) {
  overlay.attachments.push({
    id: nextId('ATT'), issue_id: issueId, user_id: user.id, filename: file.filename,
    mime: file.mime, size_bytes: file.size_bytes, data_b64: file.data_b64, created_at: now(),
  })
  save()
  return listAttachments(issueId)
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================
function listNotifications(userId, channel = 'inapp') {
  const all = [...seed.notifications, ...overlay.notifications]
    .filter((n) => n.user_id === userId && (!channel || n.channel === channel))
    .map((n) => ({ ...n, read: overlay.notifRead[n.id] ? 1 : n.read }))
  return asleep(all.sort((a, b) => b.ts - a.ts))
}
function markNotificationRead(id) { overlay.notifRead[id] = true; save(); return asleep(true) }
function markAllNotificationsRead(userId) {
  for (const n of [...seed.notifications, ...overlay.notifications]) if (n.user_id === userId) overlay.notifRead[n.id] = true
  save(); return asleep(true)
}

// ============================================================================
// SLA / ESCALATION
// ============================================================================
function listSlaRules() { return asleep(overlay.sla || seed.sla) }
function updateSlaRules(rules) {
  overlay.sla = rules
  save()
  reconcileEscalations()   // new thresholds may change escalation levels
  return asleep(rules)
}

// derive escalation level from days pending against SLA rules
function escalationFor(issue, rules, asOf) {
  if (issue.status === 'Closed') return { level: 0, rule: null, days: 0 }
  const days = Math.floor((asOf - issue.created_at) / 86400)
  let hit = null
  for (const r of rules) if (days >= r.days_pending) hit = r
  return { level: hit ? hit.level : 0, rule: hit, days }
}

// who owns an issue at a given escalation level:
// L1 -> department head (the dept engineer acts as head here)
// L2 -> plant head · L3 -> regional performance head
function responsibleUser(issue, level) {
  if (level >= 3) {
    const region = siteRegion(issue.site_id)
    return seed.users.find((u) => u.id === `u_region_${(region || '').toLowerCase()}`)?.id || null
  }
  if (level === 2) return `u_${issue.site_id}_HEAD`
  if (level === 1) return deptEngineer(issue.site_id, issue.dept_id)
  return null
}
function responsibleRole(rules, level) {
  return rules.find((r) => r.level === level)?.role || null
}

// "SLA engine": persist any newly-crossed escalation level, writing an audit
// row + a notification to the responsible person. Idempotent — only fires when
// the derived level exceeds what's already stored, so re-running is safe.
function reconcileEscalations() {
  if (!seed) return false
  const rules = overlay.sla || seed.sla
  const asOf = now()
  let changed = false
  for (const it of mergedIssues()) {
    if (it.status === 'Closed') continue
    const { level } = escalationFor(it, rules, asOf)
    const stored = it.escalation_level || 0
    if (level > stored) {
      const role = responsibleRole(rules, level)
      const days = Math.floor((asOf - it.created_at) / 86400)
      overlay.issues[it.id] = { ...(overlay.issues[it.id] || {}), escalation_level: level }
      appendAudit(it.id, 'system', 'escalation_level', stored || null, level, `Auto-escalated to L${level} — ${role} (${days} days pending)`)
      const who = responsibleUser(it, level)
      const subject = `Escalation L${level}: ${it.id}`
      const body = `${it.title} — pending ${days} days, now with ${role}.`
      pushNotification(who, it.id, 'escalation', subject, body)                 // in-app
      pushNotification(who, it.id, 'escalation', `[PPMS] ${subject}`, body, 'email')   // simulated email
      changed = true
    }
  }
  if (changed) save()
  return changed
}

// ============================================================================
// META / VIRTUAL CLOCK / RESET
// ============================================================================
function getVirtualToday() { return now() }
function setVirtualToday(epochSeconds) {
  overlay.virtualToday = epochSeconds
  save()
  reconcileEscalations()   // advancing the clock may cross new SLA thresholds
  return asleep(epochSeconds)
}
function getMeta() { return asleep(seed.meta) }

function resetDemoData() {
  overlay = blankOverlay()
  save()
  return asleep(true)
}

export const repo = {
  init,
  // org
  listSites, listUnits, listDepartments, listEquipment, listUsers, getUser, deptName, siteName,
  userName, kpiDef, equipmentLabel, ekeyLabel, siteRegion,
  // auth
  authenticate, getSession, setSession, canSeeIssue, canVerify,
  // kpi
  listKpiDefinitions, kpiSeries, latestKpis,
  // issues
  listIssues, listIssuesForUser, getIssue, listResponses, listComments, listAttachments, listAudit,
  createIssue, updateIssue, addResponse, verifyIssue, addComment, addAttachment, appendAudit, listAllAudit,
  // notifications
  listNotifications, markNotificationRead, markAllNotificationsRead,
  // sla / escalation
  listSlaRules, updateSlaRules, escalationFor, reconcileEscalations, responsibleUser, responsibleRole,
  // meta
  getVirtualToday, setVirtualToday, getMeta, resetDemoData, now,
}
