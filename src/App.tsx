import { type FormEvent, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CheckCheck,
  FileText,
  MapPinned,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { ReportMap } from './components/ReportMap'
import { StatusBadge } from './components/StatusBadge'
import { dashboardStats, demoNote, featureCards, initialReports, reportCategories, statusOptions } from './data/mockData'
import { isDemoMode } from './lib/supabase'
import { buildDashboardMetrics, findDuplicateReports, generateReferenceNumber, nextStatusMessage } from './services/reportService'
import type { Report, ReportDraft, ReportStatus } from './types'

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Report issue', to: '/report' },
  { label: 'Resident dashboard', to: '/dashboard' },
  { label: 'Admin dashboard', to: '/admin' },
  { label: 'Map view', to: '/map' },
]

const defaultDraft: ReportDraft = {
  title: '',
  description: '',
  category: 'Water & Sewage',
  locationDescription: '',
  latitude: '-26.1719',
  longitude: '28.0107',
  priority: 'Medium',
}

function App() {
  const [reports, setReports] = useState<Report[]>(initialReports)
  const [draft, setDraft] = useState<ReportDraft>(defaultDraft)
  const [submitMessage, setSubmitMessage] = useState('')
  const dashboardMetrics = useMemo(() => buildDashboardMetrics(reports), [reports])

  const residentReports = useMemo(
    () => reports.filter((report) => report.userId === 'resident-a' || report.userId === 'resident-demo'),
    [reports],
  )

  const openReportsCount = reports.filter(
    (report) => report.status !== 'Resolved' && report.status !== 'Rejected',
  ).length

  const handleDraftChange = (field: keyof ReportDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const handleStatusChange = (reportId: string, nextStatus: ReportStatus) => {
    setReports((current) =>
      current.map((report) => {
        if (report.id !== reportId) {
          return report
        }

        return {
          ...report,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
          resolvedAt: nextStatus === 'Resolved' ? new Date().toISOString() : report.resolvedAt,
          statusHistory: [
            {
              id: `history-${Date.now()}-${reportId}`,
              previousStatus: report.status,
              newStatus: nextStatus,
              changedBy: 'Municipal admin',
              note: `Status updated to ${nextStatus} by the admin review team.`,
              createdAt: new Date().toISOString(),
            },
            ...report.statusHistory,
          ],
        }
      }),
    )
  }

  const handleSubmitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!draft.title.trim() || !draft.description.trim() || !draft.locationDescription.trim()) {
      setSubmitMessage('Please complete the title, description, and location before submitting.')
      return
    }

    const duplicateMatches = findDuplicateReports(reports, draft)
    const uniqueReference = generateReferenceNumber()
    const timestamp = new Date().toISOString()

    if (duplicateMatches.length > 0) {
      setSubmitMessage(
        `Possible duplicate match detected: ${duplicateMatches
          .map((report) => report.referenceNumber)
          .join(', ')}. Please review before submitting if this is a separate issue.`,
      )
    }

    const newReport: Report = {
      id: `report-${Date.now()}`,
      referenceNumber: uniqueReference,
      userId: 'resident-demo',
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      status: 'Submitted',
      priority: draft.priority,
      latitude: Number(draft.latitude) || -26.1719,
      longitude: Number(draft.longitude) || 28.0107,
      locationDescription: draft.locationDescription.trim(),
      assignedTo: 'Unassigned',
      createdAt: timestamp,
      updatedAt: timestamp,
      statusHistory: [
        {
          id: `history-${Date.now()}`,
          previousStatus: 'Submitted',
          newStatus: 'Submitted',
          changedBy: 'Resident',
          note: 'Report submitted by resident through the CivicFix demo workflow.',
          createdAt: timestamp,
        },
      ],
    }

    setReports((current) => [newReport, ...current])
    setDraft(defaultDraft)
    setSubmitMessage(`Report submitted successfully. Your reference number is ${uniqueReference}.`)
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <header className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-white">CivicFix</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Your community. Your voice.</p>
                </div>
              </div>

              <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                {navItems.map(({ label, to }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `rounded-full px-3 py-2 transition ${
                        isActive ? 'bg-emerald-500 text-slate-950' : 'hover:bg-slate-800 hover:text-white'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>

              <div className="flex items-center gap-2 self-start rounded-full border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                {isDemoMode ? 'Demo mode' : 'Live Supabase ready'}
              </div>
            </div>
          </header>

          <main className="mt-8">
            <Routes>
              <Route
                path="/"
                element={<HomePage reports={reports} openReportsCount={openReportsCount} dashboardMetrics={dashboardMetrics} />}
              />
              <Route
                path="/report"
                element={
                  <ReportSubmissionPage
                    draft={draft}
                    submitMessage={submitMessage}
                    onChange={handleDraftChange}
                    onSubmit={handleSubmitReport}
                  />
                }
              />
              <Route path="/dashboard" element={<ResidentDashboardPage reports={residentReports} />} />
              <Route
                path="/admin"
                element={<AdminDashboardPage reports={reports} onStatusChange={handleStatusChange} />}
              />
              <Route path="/map" element={<MapPage reports={reports} />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

function HomePage({
  reports,
  openReportsCount,
  dashboardMetrics,
}: {
  reports: Report[]
  openReportsCount: number
  dashboardMetrics: ReturnType<typeof buildDashboardMetrics>
}) {
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/60 p-6 shadow-2xl shadow-slate-950/30 sm:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Community accountability
            </span>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                Fix what’s broken. Track what’s happening.
              </h1>
              <p className="max-w-xl text-lg text-slate-300">
                CivicFix makes it easier for residents to report infrastructure problems and for municipal teams to respond with clear status updates and accountable service delivery.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/report"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                Report an issue
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800"
              >
                View admin dashboard
              </Link>
            </div>
            <div className="flex flex-wrap gap-4 pt-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-emerald-300" />
                Location-aware reporting
              </div>
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-emerald-300" />
                Status tracking
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/25">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Live overview</p>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
                {openReportsCount} open
              </span>
            </div>
            <div className="space-y-4">
              {dashboardMetrics.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">{item.label}</p>
                    <TrendingUp className="h-4 w-4 text-emerald-300" />
                  </div>
                  <p className="mt-3 text-3xl font-black text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {featureCards.map((feature, index) => (
          <div key={feature.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20">
              {index === 0 ? <FileText className="h-4 w-4" /> : index === 1 ? <CheckCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </div>
            <h2 className="text-xl font-semibold text-white">{feature.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{feature.description}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Demo workflow</p>
            <h2 className="mt-2 text-2xl font-bold text-white">How CivicFix works</h2>
          </div>
          <div className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
            {demoNote}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            'Resident submits pothole or sewage leak',
            'Reference number generated and added to dashboard',
            'Admin reviews, prioritises, and assigns issue',
            'Report status updates appear to resident in real time',
          ].map((item, index) => (
            <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-300">
                {index + 1}
              </div>
              <p className="text-sm leading-6 text-slate-300">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Community map</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Reported issues</h2>
            </div>
            <Link to="/map" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
              Open full map
            </Link>
          </div>
          <ReportMap reports={reports} />
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Recent reports</p>
          <div className="mt-4 space-y-3">
            {reports.slice(0, 3).map((report) => (
              <div key={report.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{report.referenceNumber}</p>
                    <p className="text-sm text-slate-300">{report.title}</p>
                  </div>
                  <StatusBadge status={report.status} />
                </div>
                <p className="mt-3 text-sm text-slate-400">{report.locationDescription}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function ReportSubmissionPage({
  draft,
  submitMessage,
  onChange,
  onSubmit,
}: {
  draft: ReportDraft
  submitMessage: string
  onChange: (field: keyof ReportDraft, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Report an issue</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Submit an infrastructure concern</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="rounded-full border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
        >
          View my dashboard
        </button>
      </div>

      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Report title</span>
            <input
              value={draft.title}
              onChange={(event) => onChange('title', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none transition focus:border-emerald-400"
              placeholder="Large pothole causing traffic issues"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Problem description</span>
            <textarea
              value={draft.description}
              onChange={(event) => onChange('description', event.target.value)}
              rows={5}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none transition focus:border-emerald-400"
              placeholder="Describe what is happening, the urgency, and any risks to residents or motorists."
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Issue category</span>
            <select
              value={draft.category}
              onChange={(event) => onChange('category', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none transition focus:border-emerald-400"
            >
              {reportCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Priority</span>
            <select
              value={draft.priority}
              onChange={(event) => onChange('priority', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none transition focus:border-emerald-400"
            >
              {['Low', 'Medium', 'High', 'Critical'].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Location description</span>
            <input
              value={draft.locationDescription}
              onChange={(event) => onChange('locationDescription', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none transition focus:border-emerald-400"
              placeholder="Corner of Main Road and Jane Avenue, next to the school gate"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Latitude</span>
            <input
              value={draft.latitude}
              onChange={(event) => onChange('latitude', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none transition focus:border-emerald-400"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Longitude</span>
            <input
              value={draft.longitude}
              onChange={(event) => onChange('longitude', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-white outline-none transition focus:border-emerald-400"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Optional photo</span>
            <input
              type="file"
              accept="image/*"
              className="block w-full rounded-xl border border-dashed border-slate-700 bg-slate-950/70 px-3 py-3 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:font-medium file:text-slate-950"
            />
          </label>
        </div>

        {submitMessage ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {submitMessage}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Submit report
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}

function ResidentDashboardPage({ reports }: { reports: Report[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Resident view</p>
          <h1 className="mt-2 text-3xl font-bold text-white">My report dashboard</h1>
        </div>
        <Link
          to="/report"
          className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          New report
        </Link>
      </div>

      <div className="grid gap-4">
        {reports.map((report) => (
          <div key={report.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-semibold text-white">{report.referenceNumber}</p>
                  <StatusBadge status={report.status} />
                </div>
                <h2 className="mt-2 text-xl font-semibold text-slate-100">{report.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{report.description}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                {report.category}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Location</p>
                <p className="mt-2 text-sm text-slate-200">{report.locationDescription}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Assigned team</p>
                <p className="mt-2 text-sm text-slate-200">{report.assignedTo}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Updated</p>
                <p className="mt-2 text-sm text-slate-200">
                  {new Date(report.updatedAt).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Status history</p>
              <div className="mt-3 space-y-3">
                {report.statusHistory.map((entry) => (
                  <div key={entry.id} className="flex gap-3 rounded-xl bg-slate-900/80 p-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-white">{entry.previousStatus}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-sm font-medium text-emerald-300">{entry.newStatus}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString('en-ZA')}</p>
                      <p className="mt-1 text-sm text-slate-300">{entry.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminDashboardPage({
  reports,
  onStatusChange,
}: {
  reports: Report[]
  onStatusChange: (reportId: string, nextStatus: ReportStatus) => void
}) {
  const [selectedStatus, setSelectedStatus] = useState<'All' | ReportStatus>('All')
  const [selectedCategory, setSelectedCategory] = useState<'All' | string>('All')
  const [adminHint, setAdminHint] = useState('')

  const filteredReports = reports.filter((report) => {
    const matchesStatus = selectedStatus === 'All' || report.status === selectedStatus
    const matchesCategory = selectedCategory === 'All' || report.category === selectedCategory
    return matchesStatus && matchesCategory
  })

  const duplicateWarnings = reports
    .map((report) => ({
      report,
      duplicates: findDuplicateReports(
        reports.filter((candidate) => candidate.id !== report.id),
        report,
      ),
    }))
    .filter(({ duplicates }) => duplicates.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Admin operations</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Service request dashboard</h1>
        </div>
        <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200">
          {reports.length} total records
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {dashboardStats.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-3 text-3xl font-black text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {adminHint ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {adminHint}
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value as 'All' | ReportStatus)}
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white"
            >
              <option value="All">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white"
            >
              <option value="All">All categories</option>
              {reportCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            Duplicate warnings require manual review before merging.
          </div>
        </div>

        {duplicateWarnings.length > 0 ? (
          <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Possible duplicate reviews</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {duplicateWarnings.slice(0, 4).map(({ report, duplicates }) => (
                <div key={report.id} className="rounded-full border border-amber-400/30 bg-slate-950/60 px-3 py-2 text-xs text-amber-100">
                  {report.referenceNumber} ↔ {duplicates[0]?.referenceNumber ?? 'manual review'}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-3">Report</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr key={report.id} className="border-b border-slate-800/80">
                  <td className="px-4 py-4 align-top">
                    <div>
                      <p className="font-semibold text-white">{report.referenceNumber}</p>
                      <p className="mt-1 text-slate-300">{report.title}</p>
                      <p className="mt-2 text-xs text-slate-500">{report.locationDescription}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-200">{report.category}</td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      <StatusBadge status={report.status} />
                      <select
                        value={report.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as ReportStatus
                          setAdminHint(nextStatusMessage(report.status, nextStatus))
                          onStatusChange(report.id, nextStatus)
                        }}
                        className="rounded-xl border border-slate-700 bg-slate-950/70 px-2 py-2 text-xs text-white"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-200">{report.priority}</td>
                  <td className="px-4 py-4 align-top text-slate-200">{report.assignedTo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MapPage({ reports }: { reports: Report[] }) {
  return (
    <div className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Location intelligence</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Map of reported issues</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
          <MapPinned className="h-3.5 w-3.5 text-emerald-300" />
          OpenStreetMap data
        </div>
      </div>
      <ReportMap reports={reports} />
    </div>
  )
}

export default App
