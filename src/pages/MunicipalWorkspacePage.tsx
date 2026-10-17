import { type FormEvent, useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type MunicipalRole = 'municipal_worker' | 'municipal_admin'

type MunicipalReport = {
  id: string
  reference_number: string
  title: string
  description: string
  category: string
  status: string
  priority: string
  latitude: number | null
  longitude: number | null
  location_description: string | null
  assigned_to: string | null
  assigned_worker_id: string | null
  assigned_team_id: string | null
  created_at: string
  updated_at: string
  public_update: string | null
  imageUrl?: string
}

type WorkerOption = {
  worker_id: string
  full_name: string
  team_id: string | null
  team_name: string | null
  department: string | null
  active_assignments: number
}
type TeamOption = { id: string; name: string; department: string | null }
type CompletionSubmission = {
  id: string
  report_id: string
  worker_id: string
  completion_notes: string
  evidence_storage_paths: string[]
  submitted_at: string
}

const reportFields = 'id,reference_number,title,description,category,status,priority,latitude,longitude,location_description,assigned_to,assigned_worker_id,assigned_team_id,created_at,updated_at,public_update'

function RoleCheckedMunicipalWorkspace({ user, role }: { user: User; role: MunicipalRole }) {
  const [reports, setReports] = useState<MunicipalReport[]>([])
  const [workers, setWorkers] = useState<WorkerOption[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [completions, setCompletions] = useState<CompletionSubmission[]>([])
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setPageError('')
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('app_role, municipality_id, team_id, is_active, full_name')
        .eq('id', user.id)
        .single()
      if (profileError) throw profileError
      if (!profile.is_active || profile.app_role !== role || !profile.municipality_id) {
        setPageError('Your active municipal role or municipality scope could not be confirmed.')
        setLoading(false)
        return
      }
      let reportsQuery = supabase.from('reports').select(reportFields).eq('municipality_id', profile.municipality_id)
      if (role === 'municipal_worker') {
        reportsQuery = reportsQuery.or(`assigned_worker_id.eq.${user.id}${profile.team_id ? `,assigned_team_id.eq.${profile.team_id}` : ''}`)
      }

      const [reportsResult, teamsResult, workersResult, completionsResult] = await Promise.all([
        reportsQuery.order('updated_at', { ascending: false }).limit(200),
        role === 'municipal_admin'
          ? supabase.from('municipal_teams').select('id,name,department').eq('municipality_id', profile.municipality_id).eq('is_active', true)
          : Promise.resolve({ data: [], error: null }),
        role === 'municipal_admin'
          ? supabase.rpc('list_municipal_workers')
          : Promise.resolve({ data: [], error: null }),
        role === 'municipal_admin'
          ? supabase.from('report_completion_submissions')
              .select('id,report_id,worker_id,completion_notes,evidence_storage_paths,submitted_at')
              .is('reviewed_at', null)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (reportsResult.error) throw reportsResult.error
      if (teamsResult.error) throw teamsResult.error
      if (workersResult.error) throw workersResult.error
      if (completionsResult.error) throw completionsResult.error

      const reportRows = (reportsResult.data ?? []) as MunicipalReport[]
      const attachmentRows = await (async () => {
        const ids = reportRows.map((r) => r.id)
        if (!ids.length) return []
        const { data, error } = await supabase
          .from('report_attachments')
          .select('report_id,storage_path')
          .in('report_id', ids)
        if (error) return []
        return data as { report_id: string; storage_path: string }[]
      })()

      const signedUrlByReport = new Map<string, string>()
      if (attachmentRows.length) {
        const paths = attachmentRows.map((row) => row.storage_path)
        const { data: signedData, error: signedError } = await supabase.storage
          .from('report-attachments')
          .createSignedUrls(paths, 3600)
        if (!signedError) {
          const pathToUrl = new Map<string, string>()
          for (const entry of signedData ?? []) {
            if (entry.path && entry.signedUrl) pathToUrl.set(entry.path, entry.signedUrl)
          }
          for (const row of attachmentRows) {
            const url = pathToUrl.get(row.storage_path)
            if (url && !signedUrlByReport.has(row.report_id)) signedUrlByReport.set(row.report_id, url)
          }
        }
      }

      const reportsWithImages = reportRows.map((report) => ({
        ...report,
        imageUrl: signedUrlByReport.get(report.id),
      }))

      setReports(reportsWithImages)
      setTeams((teamsResult.data ?? []) as TeamOption[])
      setWorkers((workersResult.data ?? []) as WorkerOption[])
      setCompletions((completionsResult.data ?? []) as CompletionSubmission[])
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not load municipal work data.')
    } finally {
      setLoading(false)
    }
  }, [role, user.id])

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [loadData])

  const invokeWorkflow = async (
    operation: string,
    args: Record<string, string | boolean | string[] | null>,
    successMessage: string,
  ): Promise<boolean> => {
    if (!supabase) return false
    setNotice('')
    setPageError('')
    try {
      const { error } = await supabase.rpc(operation, args)
      if (error) {
        setPageError(error.message)
        return false
      }
      setNotice(successMessage)
      await loadData()
      return true
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'The municipal operation failed.')
      return false
    }
  }

  const openReports = reports.filter((report) => !['Resolved', 'Rejected'].includes(report.status)).length
  const statusCounts = ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved']
    .map((status) => ({ status, count: reports.filter((report) => report.status === status).length }))

  if (loading) return <div className="auth-gate-message" role="status">Loading authorised municipal work…</div>

  return (
    <section className="municipal-workspace" aria-labelledby="municipal-title">
      <header className="municipal-workspace-heading">
        <div>
          <p className="municipal-kicker">{role === 'municipal_admin' ? 'Municipal administration' : 'Field operations'}</p>
          <h1 id="municipal-title">{role === 'municipal_admin' ? 'Municipal workspace' : 'My assigned work'}</h1>
          <p>Live report data is limited to the municipality and assignments permitted by your account.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void loadData()}>Refresh</button>
      </header>
      {pageError ? <p className="auth-error municipal-message" role="alert">{pageError}</p> : null}
      {notice ? <p className="auth-success municipal-message" role="status">{notice}</p> : null}

      {role === 'municipal_admin' ? (
        <div className="municipal-metrics" aria-label="Municipal report counts">
          <article><span>Total reports</span><strong>{reports.length}</strong></article>
          <article><span>Open reports</span><strong>{openReports}</strong></article>
          {statusCounts.map(({ status, count }) => <article key={status}><span>{status}</span><strong>{count}</strong></article>)}
        </div>
      ) : null}

      {role === 'municipal_worker' ? (
        <WorkerReportList
          reports={reports}
          onInvoke={invokeWorkflow}
        />
      ) : (
        <AdminReportWorkspace
          reports={reports}
          workers={workers}
          teams={teams}
          completions={completions}
          onInvoke={invokeWorkflow}
        />
      )}
      <StaffMessaging user={user} role={role} />
    </section>
  )
}

function WorkerReportList({
  reports,
  onInvoke,
}: {
  reports: MunicipalReport[]
  onInvoke: (operation: string, args: Record<string, string | boolean | string[] | null>, successMessage: string) => Promise<boolean>
}) {
  if (!reports.length) return <p className="municipal-empty">No reports are currently assigned to you or your team.</p>
  return (
    <div className="municipal-report-list">
      {reports.map((report) => (
        <article className="municipal-report-card" key={report.id}>
          <ReportSummary report={report} />
          {['Assigned', 'In Progress', 'Awaiting Action'].includes(report.status) ? (
            <WorkerUpdateForm report={report} onInvoke={onInvoke} />
          ) : null}
        </article>
      ))}
    </div>
  )
}

function WorkerUpdateForm({
  report,
  onInvoke,
}: {
  report: MunicipalReport
  onInvoke: (operation: string, args: Record<string, string | boolean | string[] | null>, successMessage: string) => Promise<boolean>
}) {
  const [publicUpdate, setPublicUpdate] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const execute = async (operation: string, args: Record<string, string | boolean | string[] | null>, message: string) => {
    setSubmitting(true)
    setFormError('')
    try {
      await onInvoke(operation, args, message)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The report update failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitCompletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSubmitting(true)
    setFormError('')
    const uploadedPaths: string[] = []
    try {
      if (evidenceFile) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(evidenceFile.type) || evidenceFile.size > 5 * 1024 * 1024) {
          setFormError('Choose a JPG, PNG, or WebP image no larger than 5 MB.')
          return
        }
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!user) throw new Error('Sign in again before uploading completion evidence.')
        const extension = evidenceFile.type === 'image/jpeg' ? 'jpg' : evidenceFile.type.slice('image/'.length)
        const path = `${user.id}/${report.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('work-evidence').upload(path, evidenceFile, { contentType: evidenceFile.type })
        if (uploadError) throw uploadError
        uploadedPaths.push(path)
      }
      const saved = await onInvoke('submit_civic_completion', {
        p_report_id: report.id,
        p_completion_notes: completionNotes,
        p_evidence_storage_paths: uploadedPaths,
        p_public_update: publicUpdate || null,
        p_internal_note: internalNote || null,
      }, 'Completion submitted for municipal review.')
      if (!saved && uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from('work-evidence').remove(uploadedPaths)
        if (cleanupError) setFormError(`Completion failed, and the uploaded evidence could not be removed: ${cleanupError.message}`)
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not submit completion.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="municipal-actions">
      <label>
        Public progress update
        <input value={publicUpdate} onChange={(event) => setPublicUpdate(event.target.value)} maxLength={500} />
      </label>
      <label>
        Internal note for municipal staff <span className="auth-optional">(not public)</span>
        <input value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} />
      </label>
      <div className="municipal-action-buttons">
        <button
          type="button"
          className="secondary-button"
          disabled={submitting}
          onClick={() => void execute('worker_update_civic_report', {
            p_report_id: report.id,
            p_new_status: 'In Progress',
            p_public_update: publicUpdate || null,
            p_internal_note: internalNote || null,
          }, 'Work progress recorded.')}
        >Acknowledge / in progress</button>
        <button
          type="button"
          className="secondary-button"
          disabled={submitting}
          onClick={() => void execute('worker_update_civic_report', {
            p_report_id: report.id,
            p_new_status: 'Awaiting Action',
            p_public_update: publicUpdate || null,
            p_internal_note: internalNote || null,
          }, 'Work blocker recorded.')}
        >Report a blocker</button>
      </div>
      {report.status !== 'Awaiting Action' ? (
        <form className="municipal-completion-form" onSubmit={submitCompletion}>
          <label>
            Completion notes
            <textarea required maxLength={3000} value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} />
          </label>
          <label>
            Work evidence <span className="auth-optional">(optional)</span>
            <input accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} />
          </label>
          <button type="submit" className="primary-button" disabled={submitting}>Submit for completion review</button>
        </form>
      ) : null}
      {formError ? <p className="auth-error" role="alert">{formError}</p> : null}
    </div>
  )
}

function AdminReportWorkspace({
  reports,
  workers,
  teams,
  completions,
  onInvoke,
}: {
  reports: MunicipalReport[]
  workers: WorkerOption[]
  teams: TeamOption[]
  completions: CompletionSubmission[]
  onInvoke: (operation: string, args: Record<string, string | boolean | string[] | null>, successMessage: string) => Promise<boolean>
}) {
  return (
    <>
      <section className="municipal-section" aria-labelledby="workers-heading">
        <h2 id="workers-heading">Team workload</h2>
        {workers.length ? (
          <ul className="municipal-worker-list">
            {workers.map((worker) => (
              <li key={worker.worker_id}>
                <strong>{worker.full_name}</strong>
                <span>{worker.team_name ?? 'No team'}{worker.department ? ` · ${worker.department}` : ''}</span>
                <span>{worker.active_assignments} active assignments</span>
              </li>
            ))}
          </ul>
        ) : <p className="municipal-empty">No active worker accounts have been provisioned for this municipality.</p>}
      </section>
      <section className="municipal-section" aria-labelledby="review-heading">
        <h2 id="review-heading">Completion review</h2>
        {completions.length ? completions.map((completion) => (
          <CompletionReview key={completion.id} completion={completion} onInvoke={onInvoke} />
        )) : <p className="municipal-empty">No work is awaiting completion review.</p>}
      </section>
      <section className="municipal-section" aria-labelledby="reports-heading">
        <h2 id="reports-heading">Report management</h2>
        {reports.length ? (
          <div className="municipal-report-list">
            {reports.map((report) => (
              <article className="municipal-report-card" key={report.id}>
                <ReportSummary report={report} />
                {report.status === 'Submitted' ? (
                  <ReviewForm report={report} onInvoke={onInvoke} />
                ) : null}
                {['Under Review', 'Assigned', 'In Progress', 'Awaiting Action'].includes(report.status) ? (
                  <AssignmentForm report={report} workers={workers} teams={teams} onInvoke={onInvoke} />
                ) : null}
              </article>
            ))}
          </div>
        ) : <p className="municipal-empty">No reports are available in this municipal scope.</p>}
      </section>
    </>
  )
}

function ReviewForm({
  report,
  onInvoke,
}: {
  report: MunicipalReport
  onInvoke: (operation: string, args: Record<string, string | boolean | string[] | null>, successMessage: string) => Promise<boolean>
}) {
  const [publicUpdate, setPublicUpdate] = useState('')
  const [internalNote, setInternalNote] = useState('')
  return (
    <div className="municipal-actions">
      <label>Public review update<input value={publicUpdate} maxLength={500} onChange={(event) => setPublicUpdate(event.target.value)} /></label>
      <label>Internal review note <span className="auth-optional">(not public)</span><input value={internalNote} maxLength={1000} onChange={(event) => setInternalNote(event.target.value)} /></label>
      <div className="municipal-action-buttons">
        <button type="button" className="primary-button" onClick={() => void onInvoke('review_civic_report', {
          p_report_id: report.id,
          p_reject: false,
          p_public_update: publicUpdate || 'Report reviewed.',
          p_internal_note: internalNote || null,
        }, 'Report moved to review.')}>Move to review</button>
        <button type="button" className="secondary-button" onClick={() => void onInvoke('review_civic_report', {
          p_report_id: report.id,
          p_reject: true,
          p_public_update: publicUpdate,
          p_internal_note: internalNote || null,
        }, 'Report rejected with a public explanation.')}>Reject report</button>
      </div>
    </div>
  )
}

function AssignmentForm({
  report,
  workers,
  teams,
  onInvoke,
}: {
  report: MunicipalReport
  workers: WorkerOption[]
  teams: TeamOption[]
  onInvoke: (operation: string, args: Record<string, string | boolean | string[] | null>, successMessage: string) => Promise<boolean>
}) {
  const [workerId, setWorkerId] = useState(report.assigned_worker_id ?? '')
  const [teamId, setTeamId] = useState(report.assigned_team_id ?? '')
  const [update, setUpdate] = useState('')
  const [internalNote, setInternalNote] = useState('')
  return (
    <div className="municipal-actions">
      <strong>{report.assigned_to ? `Assigned to ${report.assigned_to}` : 'Awaiting assignment'}</strong>
      <label>
        Worker
        <select value={workerId} onChange={(event) => setWorkerId(event.target.value)}>
          <option value="">Select worker (optional)</option>
          {workers.map((worker) => <option key={worker.worker_id} value={worker.worker_id}>{worker.full_name}</option>)}
        </select>
      </label>
      <label>
        Team
        <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
          <option value="">Select team (optional)</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
      <label>Public assignment update<input value={update} maxLength={500} onChange={(event) => setUpdate(event.target.value)} /></label>
      <label>Internal assignment note <span className="auth-optional">(not public)</span><input value={internalNote} maxLength={1000} onChange={(event) => setInternalNote(event.target.value)} /></label>
      <button
        type="button"
        className="primary-button"
        disabled={!workerId && !teamId}
        onClick={() => void onInvoke('assign_civic_report', {
          p_report_id: report.id,
          p_worker_id: workerId || null,
          p_team_id: teamId || null,
          p_public_update: update || 'Work assigned to the municipal response team.',
          p_internal_note: internalNote || null,
        }, 'Report assigned within your municipality.')}
      >Assign / reassign</button>
    </div>
  )
}

function CompletionReview({
  completion,
  onInvoke,
}: {
  completion: CompletionSubmission
  onInvoke: (operation: string, args: Record<string, string | boolean | string[] | null>, successMessage: string) => Promise<boolean>
}) {
  const [note, setNote] = useState('')
  const [publicUpdate, setPublicUpdate] = useState('')
  const [evidenceLinks, setEvidenceLinks] = useState<string[]>([])
  const [evidenceError, setEvidenceError] = useState('')

  useEffect(() => {
    let isActive = true
    if (!supabase || !completion.evidence_storage_paths.length) return
    void supabase.storage.from('work-evidence').createSignedUrls(completion.evidence_storage_paths, 300)
      .then(({ data, error }) => {
        if (error) {
          if (isActive) setEvidenceError(error.message)
          return
        }
        if (isActive) setEvidenceLinks((data ?? []).flatMap((entry) => entry.signedUrl ? [entry.signedUrl] : []))
      })
      .catch((cause: unknown) => {
        if (isActive) setEvidenceError(cause instanceof Error ? cause.message : 'Could not load completion evidence.')
      })
    return () => { isActive = false }
  }, [completion.evidence_storage_paths])

  return (
    <article className="municipal-completion-card">
      <p>{completion.completion_notes}</p>
      {evidenceLinks.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">View completion evidence</a>)}
      {evidenceError ? <p className="auth-error" role="alert">{evidenceError}</p> : null}
      <label>Public resolution update<input value={publicUpdate} onChange={(event) => setPublicUpdate(event.target.value)} maxLength={500} /></label>
      <label>Internal review note <span className="auth-optional">(not public)</span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label>
      <div className="municipal-action-buttons">
        <button type="button" className="primary-button" onClick={() => void onInvoke('review_civic_completion', {
          p_submission_id: completion.id,
          p_approve: true,
          p_public_update: publicUpdate || 'Completion reviewed and confirmed.',
          p_review_note: note || null,
        }, 'Work approved and report resolved.')}>Confirm resolution</button>
        <button type="button" className="secondary-button" disabled={!note.trim()} onClick={() => void onInvoke('review_civic_completion', {
          p_submission_id: completion.id,
          p_approve: false,
          p_public_update: publicUpdate || 'Further work is required.',
          p_review_note: note,
        }, 'Completion returned to the assigned worker.')}>Return for more work</button>
      </div>
    </article>
  )
}

function ReportSummary({ report }: { report: MunicipalReport }) {
  return (
    <div className="municipal-report-summary">
      <div className="municipal-report-title">
        <div><span>{report.reference_number} · {report.category} · {report.priority}</span><h3>{report.title}</h3></div>
        <span className="status-badge">{report.status}</span>
      </div>
      {report.imageUrl ? (
        <button
          type="button"
          className="municipal-report-image"
          onClick={() => window.open(report.imageUrl, '_blank')}
          aria-label={`View report photo for ${report.title}`}
        >
          <img src={report.imageUrl} alt={`Report photo for ${report.title}`} loading="lazy" />
        </button>
      ) : null}
      <p>{report.description}</p>
      {report.location_description ? (
        <div className="municipal-report-location">
          <p><strong>Location:</strong> {report.location_description}</p>
          {report.latitude !== null && report.longitude !== null ? (
            <button type="button" className="municipal-map-link" onClick={() => {
              const url = new URL(`/map`, window.location.origin)
              url.searchParams.set('lat', String(report.latitude))
              url.searchParams.set('lng', String(report.longitude))
              url.searchParams.set('id', report.id)
              window.location.href = url.toString()
            }}>
              View exact location on map
            </button>
          ) : null}
        </div>
      ) : null}
      {report.public_update ? <p><strong>Latest public update:</strong> {report.public_update}</p> : null}
      <small>Updated {new Date(report.updated_at).toLocaleString()}</small>
    </div>
  )
}

type StaffMessage = {
  id: string
  senderId: string
  senderName: string
  senderRole: string
  text: string
  createdAt: string
}

function StaffMessaging({ user, role }: { user: User; role: MunicipalRole }) {
  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const otherRole = role === 'municipal_worker' ? 'municipal_admin' : 'municipal_worker'

  const senderName = profileFullName(user)

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setSending(true)
    try {
      const message: StaffMessage = {
        id: crypto.randomUUID(),
        senderId: user.id,
        senderName,
        senderRole: role,
        text,
        createdAt: new Date().toISOString(),
      }
      setMessages((current) => [...current, message])
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="municipal-section municipal-messaging" aria-labelledby="staff-messaging-heading">
      <div className="municipal-workspace-heading">
        <div>
          <h2 id="staff-messaging-heading">Private Staff Messages</h2>
          <p>Messages between {role === 'municipal_worker' ? 'you and the municipal administrator' : 'you and field workers'}. This is an in-session chat; message history is not persisted to the database yet.</p>
        </div>
      </div>
      <div className="municipal-message-list">
        {messages.length ? (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`municipal-message ${msg.senderId === user.id ? 'municipal-message-own' : 'municipal-message-theirs'}`}
            >
              <div className="municipal-message-header">
                <strong>{msg.senderName}</strong>
                <span className="municipal-message-role">{msg.senderRole}</span>
                <span className="municipal-message-time">{new Date(msg.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="municipal-message-text">{msg.text}</p>
            </div>
          ))
        ) : (
          <p className="municipal-empty">No messages yet. Start a conversation below.</p>
        )}
      </div>
      <form className="municipal-message-form" onSubmit={sendMessage}>
        <label className="visually-hidden">Your message</label>
        <input
          className="municipal-message-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Type a message to ${otherRole}…`}
          disabled={sending}
        />
        <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  )
}

function profileFullName(user: User): string {
  const meta = user.user_metadata as { full_name?: string } | undefined
  if (meta?.full_name) return meta.full_name
  return user.email ?? 'Staff member'
}

export function MunicipalWorkspacePage() {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true
    const loadRole = async () => {
      if (!supabase) {
        setError('Municipal staff tools are unavailable because Supabase is not configured.')
        setLoading(false)
        return
      }
      try {
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!currentUser) {
          if (isActive) setLoading(false)
          return
        }
        const { data: profile, error: profileError } = await supabase
          .from('profiles').select('app_role,is_active').eq('id', currentUser.id).single()
        if (profileError) throw profileError
        if (isActive) {
          setUser(currentUser)
          setRole(profile.is_active ? profile.app_role : 'inactive')
          setLoading(false)
        }
      } catch (cause) {
        if (!isActive) return
        setError(cause instanceof Error ? cause.message : 'Could not verify your municipal account.')
        setLoading(false)
      }
    }
    void loadRole()
    return () => { isActive = false }
  }, [])

  if (loading) return <div className="auth-gate-message" role="status">Verifying municipal account…</div>
  if (error) return <div className="auth-gate-message" role="alert"><p>{error}</p></div>
  if (!user) return <Navigate to="/login?next=/municipal" replace />
  if (role !== 'municipal_admin' && role !== 'municipal_worker') {
    return <div className="auth-gate-message" role="alert"><p>This workspace is only available to active municipal staff accounts.</p></div>
  }
  return <RoleCheckedMunicipalWorkspace user={user} role={role} />
}
