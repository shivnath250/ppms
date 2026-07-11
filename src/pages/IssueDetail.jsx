import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { repo } from '../data/repository.js'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  SEV_CLASS, statusClass, fmtDate, fmtDateTime, deviationText, toDateInput, fromDateInput,
} from '../lib/format.js'

const MAX_ATTACH = 1.5 * 1024 * 1024 // 1.5 MB cap for localStorage-backed base64

export default function IssueDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const now = repo.getVirtualToday()

  const load = useCallback(async () => {
    const issue = await repo.getIssue(id)
    if (!issue) { setData({ notFound: true }); return }
    const [responses, comments, attachments, audit] = await Promise.all([
      repo.listResponses(id), repo.listComments(id), repo.listAttachments(id), repo.listAudit(id),
    ])
    setData({ issue, responses, comments, attachments, audit })
  }, [id])

  useEffect(() => { load() }, [load])

  if (!data) return <div className="muted">Loading…</div>
  if (data.notFound) return <div className="muted">Issue not found. <Link to="/issues">Back to issues</Link></div>

  const { issue, responses, comments, attachments, audit } = data
  // access checks
  const canSee = repo.canSeeIssue(user, issue)
  if (!canSee) return <div className="muted">You don't have access to this issue. <Link to="/issues">Back</Link></div>
  const canVerify = repo.canVerify(user)
  const canRespond = user.role === 'plant' && issue.status !== 'Closed'
  const kpi = issue.kpi_key ? repo.kpiDef(issue.kpi_key) : null
  const overdue = issue.status !== 'Closed' && issue.target_date && issue.target_date < now

  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="breadcrumb-sm"><Link to="/issues">Issues</Link> › {issue.id}</div>
      <div className="issue-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${SEV_CLASS[issue.severity]}`}>{issue.severity}</span>
            <span className={`badge ${statusClass(issue.status)}`}>{issue.status}</span>
            {overdue && <span className="badge critical">Overdue</span>}
            <span className="mono faint">{issue.id}</span>
          </div>
          <h1 style={{ fontSize: 22, margin: '8px 0 0' }}>{issue.title}</h1>
        </div>
      </div>

      <div className="detail-cols">
        <div className="detail-main">
          {/* meta */}
          <div className="card meta-card">
            <MetaRow label="Site / Unit">{repo.siteName(issue.site_id)}{issue.unit_id ? ` · ${issue.unit_id.split('-U')[1] ? 'Unit ' + issue.unit_id.split('-U')[1] : ''}` : ''}</MetaRow>
            <MetaRow label="Department">{repo.deptName(issue.dept_id)}</MetaRow>
            {issue.equipment_id && <MetaRow label="Equipment">{repo.equipmentLabel(issue.equipment_id)}</MetaRow>}
            <MetaRow label="Raised by">{repo.userName(issue.created_by)} · {fmtDate(issue.created_at)}</MetaRow>
            <MetaRow label="Target date"><span className={overdue ? 'overdue-txt' : ''}>{fmtDate(issue.target_date)}</span></MetaRow>
            {issue.impact_generation && <MetaRow label="Impact">{issue.impact_generation}</MetaRow>}
          </div>

          {kpi && (
            <div className="card kpi-context">
              <div className="section-label" style={{ margin: '0 0 10px' }}>KPI context — {kpi.label}</div>
              <div className="kpi-context-grid">
                <div><div className="kc-val mono">{issue.benchmark_value ?? '—'}</div><div className="kc-lbl">Benchmark ({kpi.unit})</div></div>
                <div><div className="kc-val mono">{issue.actual_value ?? '—'}</div><div className="kc-lbl">Actual ({kpi.unit})</div></div>
                <div><div className="kc-val mono overdue-txt">{deviationText(kpi, issue.actual_value, issue.benchmark_value)}</div><div className="kc-lbl">Deviation</div></div>
              </div>
            </div>
          )}

          {issue.observation && (
            <div className="card sect">
              <div className="section-label">Engineering observation</div>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{issue.observation}</p>
            </div>
          )}

          {/* progress */}
          <div className="card sect">
            <div className="row"><div className="section-label" style={{ margin: 0 }}>Progress</div><div className="spacer" /><span className="mono">{issue.progress_pct || 0}%</span></div>
            <div className="progress lg"><span style={{ width: `${issue.progress_pct || 0}%` }} /></div>
          </div>

          {/* plant response history */}
          {responses.length > 0 && (
            <div className="card sect">
              <div className="section-label">Plant responses ({responses.length})</div>
              {responses.map((r) => (
                <div key={r.id} className="resp">
                  <div className="resp-head"><b>{repo.userName(r.user_id)}</b><span className="faint mono">{fmtDateTime(r.created_at)}</span></div>
                  {r.root_cause && <div className="resp-line"><span className="resp-k">Root cause</span> {r.root_cause}</div>}
                  {r.action_taken && <div className="resp-line"><span className="resp-k">Action taken</span> {r.action_taken}</div>}
                  {r.preventive_action && <div className="resp-line"><span className="resp-k">Preventive</span> {r.preventive_action}</div>}
                  {r.expected_completion && <div className="resp-line"><span className="resp-k">Expected</span> {fmtDate(r.expected_completion)}</div>}
                </div>
              ))}
            </div>
          )}

          {/* action panels */}
          {canRespond && <ResponseForm issue={issue} user={user} onDone={load} />}
          {canVerify && <VerifyPanel issue={issue} user={user} onDone={load} />}

          {/* attachments */}
          <div className="card sect">
            <div className="section-label">Attachments ({attachments.length})</div>
            {attachments.length === 0 && <div className="muted" style={{ fontSize: 13 }}>None.</div>}
            {attachments.map((a) => (
              <a key={a.id} className="attach" href={`data:${a.mime};base64,${a.data_b64}`} download={a.filename}>
                📎 {a.filename} <span className="faint">({Math.round((a.size_bytes || 0) / 1024)} KB)</span>
              </a>
            ))}
            {canRespond && <AttachmentUpload issue={issue} user={user} onDone={load} />}
          </div>

          {/* comments */}
          <div className="card sect">
            <div className="section-label">Comments ({comments.length})</div>
            {comments.map((c) => (
              <div key={c.id} className="resp">
                <div className="resp-head"><b>{repo.userName(c.user_id)}</b><span className="faint mono">{fmtDateTime(c.created_at)}</span></div>
                <div>{c.body}</div>
              </div>
            ))}
            <CommentBox issue={issue} user={user} onDone={load} />
          </div>
        </div>

        {/* audit timeline */}
        <div className="detail-side">
          <div className="card sect">
            <div className="section-label">Audit trail · append-only ({audit.length})</div>
            <div className="timeline">
              {audit.map((a) => (
                <div key={a.id} className="tl-item">
                  <div className="tl-dot" />
                  <div className="tl-body">
                    <div className="tl-top"><b>{repo.userName(a.user_id)}</b><span className="faint mono">{fmtDateTime(a.ts)}</span></div>
                    <div className="tl-change">
                      {a.field === 'status' && <>set status {a.old_value ? <>from <em>{a.old_value}</em> </> : ''}to <em>{a.new_value}</em></>}
                      {a.field === 'progress_pct' && <>updated progress {a.old_value}% → {a.new_value}%</>}
                      {a.field === 'assignment' && <>routed to <em>{a.new_value}</em></>}
                      {!['status', 'progress_pct', 'assignment'].includes(a.field) && <>{a.field}: {a.new_value}</>}
                    </div>
                    {a.comment && <div className="tl-comment">“{a.comment}”</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, children }) {
  return <div className="meta-row"><span className="meta-label">{label}</span><span>{children}</span></div>
}

function ResponseForm({ issue, user, onDone }) {
  const [f, setF] = useState({
    root_cause: '', action_taken: '', preventive_action: '',
    expected_completion: toDateInput(repo.getVirtualToday() + 5 * 86400),
    progress_pct: issue.progress_pct || 0,
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  async function submit(newStatus) {
    setBusy(true)
    await repo.addResponse(issue.id, user, {
      root_cause: f.root_cause, action_taken: f.action_taken, preventive_action: f.preventive_action,
      expected_completion: fromDateInput(f.expected_completion), progress_pct: Number(f.progress_pct),
    }, newStatus)
    setBusy(false)
    onDone()
  }

  return (
    <div className="card sect action-panel">
      <div className="section-label">Submit investigation / action</div>
      <div className="field"><label>Root cause (RCA)</label>
        <textarea value={f.root_cause} onChange={(e) => set('root_cause', e.target.value)} placeholder="Root cause analysis…" /></div>
      <div className="field"><label>Corrective action taken</label>
        <textarea value={f.action_taken} onChange={(e) => set('action_taken', e.target.value)} placeholder="What has been done…" /></div>
      <div className="form-grid">
        <div className="field"><label>Preventive action</label>
          <input value={f.preventive_action} onChange={(e) => set('preventive_action', e.target.value)} /></div>
        <div className="field"><label>Expected completion</label>
          <input type="date" value={f.expected_completion} onChange={(e) => set('expected_completion', e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Progress · {f.progress_pct}%</label>
        <input type="range" min="0" max="100" step="5" value={f.progress_pct} onChange={(e) => set('progress_pct', e.target.value)} />
      </div>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => submit('Action Initiated')}>Save update</button>
        <button className="btn primary" disabled={busy} onClick={() => submit('Awaiting Verification')}>Submit for verification</button>
      </div>
    </div>
  )
}

function VerifyPanel({ issue, user, onDone }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const awaiting = issue.status === 'Awaiting Verification'
  const closed = issue.status === 'Closed'

  async function act(action) {
    setBusy(true)
    await repo.verifyIssue(issue.id, user, action, comment)
    setBusy(false); setComment(''); onDone()
  }

  return (
    <div className="card sect action-panel corp">
      <div className="section-label">Corporate verification</div>
      {!awaiting && !closed && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Awaiting the plant's response. You can still comment, or close/reopen if needed.</p>}
      <div className="field"><label>Verification note (optional)</label>
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason / decision…" /></div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {!closed && <button className="btn primary" disabled={busy} onClick={() => act('close')}>Accept &amp; close</button>}
        {!closed && <button className="btn" disabled={busy} onClick={() => act('info')}>Request more info</button>}
        <button className="btn danger" disabled={busy} onClick={() => act('reopen')}>{closed ? 'Reopen issue' : 'Reopen'}</button>
      </div>
    </div>
  )
}

function CommentBox({ issue, user, onDone }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  async function add() {
    if (!body.trim()) return
    setBusy(true); await repo.addComment(issue.id, user, body.trim()); setBusy(false); setBody(''); onDone()
  }
  return (
    <div className="row" style={{ marginTop: 10, alignItems: 'flex-start' }}>
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" onKeyDown={(e) => e.key === 'Enter' && add()} />
      <button className="btn" disabled={busy || !body.trim()} onClick={add}>Post</button>
    </div>
  )
}

function AttachmentUpload({ issue, user, onDone }) {
  const [err, setErr] = useState('')
  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_ATTACH) { setErr('File too large for the demo (max 1.5 MB).'); return }
    setErr('')
    const reader = new FileReader()
    reader.onload = async () => {
      const b64 = String(reader.result).split(',')[1]
      await repo.addAttachment(issue.id, user, { filename: file.name, mime: file.type || 'application/octet-stream', size_bytes: file.size, data_b64: b64 })
      onDone()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  return (
    <div style={{ marginTop: 10 }}>
      <label className="btn ghost" style={{ cursor: 'pointer' }}>
        + Attach file<input type="file" style={{ display: 'none' }} onChange={onFile} />
      </label>
      {err && <span className="login-error" style={{ display: 'inline-block', marginLeft: 10, marginBottom: 0 }}>{err}</span>}
    </div>
  )
}
