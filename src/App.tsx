import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  Activity,
  Bell,
  Camera,
  Check,
  ChevronDown,
  CirclePlus,
  ClipboardList,
  House,
  Map as MapIcon,
  MapPin,
  ShieldCheck,
  X,
} from 'lucide-react'
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ReportMap } from './components/ReportMap'
import { ReportPost } from './components/ReportPost'
import { StatusBadge } from './components/StatusBadge'
import { CommunityFeedPage } from './pages/CommunityFeedPage'
import { LoginPage, ProfileSetupGate, SignUpPage } from './pages/AuthPages'
import { MunicipalWorkspacePage } from './pages/MunicipalWorkspacePage'
import { isDemoMode, supabase } from './lib/supabase'
import { initialReports, reportCategories, statusOptions } from './data/mockData'
import {
  buildDashboardMetrics,
  findDuplicateReports,
  generateReferenceNumber,
} from './services/reportService'
import {
  loadCommunityData,
  loadNotifications,
  addReportComment,
  markNotificationRead,
  submitReport,
  toggleCommunityAction,
  type CommunityAction,
  type CivicNotification,
} from './services/civicDataService'
import type { Report, ReportComment, ReportDraft, ReportStatus } from './types'
import './App.css'

const blankDraft: ReportDraft = {
  title: '',
  description: '',
  category: 'Water & Sewage',
  locationDescription: '',
  latitude: '',
  longitude: '',
  priority: 'Medium',
}

function App() {
  const [reports, setReports] = useState<Report[]>(isDemoMode ? initialReports : [])
  const [supportedIds, setSupportedIds] = useState<string[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const [flaggedIds, setFlaggedIds] = useState<string[]>([])
  const [commentsByReport, setCommentsByReport] = useState<Record<string, ReportComment[]>>({})
  const [activeUser, setActiveUser] = useState<User | null>(null)
  const [notifications, setNotifications] = useState<CivicNotification[]>([])
  const [dataLoading, setDataLoading] = useState(!isDemoMode)
  const [dataError, setDataError] = useState('')
  const [previewImage, setPreviewImage] = useState('')
  const [toast, setToast] = useState('')
  const [toastIsError, setToastIsError] = useState(false)
  const dataRefreshSequence = useRef(0)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => { setToast(''); setToastIsError(false) }, 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const refreshLiveData = useCallback(async (user: User) => {
    if (!supabase) return
    const sequence = ++dataRefreshSequence.current
    setDataLoading(true)
    setDataError('')
    try {
      const [communityData, notificationData] = await Promise.all([
        loadCommunityData(supabase, user),
        loadNotifications(supabase),
      ])
      if (sequence !== dataRefreshSequence.current) return
      setReports(communityData.reports)
      setSupportedIds(communityData.supportedIds)
      setSavedIds(communityData.savedIds)
      setFollowedIds(communityData.followedIds)
      setFlaggedIds(communityData.flaggedIds)
      setCommentsByReport(communityData.commentsByReport)
      setNotifications(notificationData)
    } catch (cause) {
      if (sequence === dataRefreshSequence.current) {
        setDataError(cause instanceof Error ? cause.message : 'Could not load community data from Supabase.')
      }
    } finally {
      if (sequence === dataRefreshSequence.current) setDataLoading(false)
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) return
    let isActive = true
    let sequence = 0
    const acceptSession = async (user: User | null) => {
      const current = ++sequence
      if (!isActive) return
      setActiveUser(user)
      if (!user) {
        dataRefreshSequence.current += 1
        setReports([])
        setSupportedIds([])
        setSavedIds([])
        setFollowedIds([])
        setFlaggedIds([])
        setCommentsByReport({})
        setNotifications([])
        setDataLoading(false)
        setDataError('')
        return
      }
      await refreshLiveData(user)
      if (!isActive || current !== sequence) return
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void acceptSession(session?.user ?? null), 0)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (error) throw error
      return acceptSession(data.session?.user ?? null)
    }).catch((cause: unknown) => {
      if (!isActive) return
      setDataError(cause instanceof Error ? cause.message : 'Could not check your Supabase session.')
      setDataLoading(false)
    })
    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [refreshLiveData])

  const showError = (message: string) => {
    setToast(message)
    setToastIsError(true)
  }
  const showSuccess = (message: string) => {
    setToast(message)
    setToastIsError(false)
  }

  const handleCommunityAction = async (action: CommunityAction, reportId: string) => {
    const currentIds = action === 'support' ? supportedIds
      : action === 'bookmark' ? savedIds
      : action === 'follow' ? followedIds
      : flaggedIds
    const enabled = action === 'flag' || !currentIds.includes(reportId)
    if (!supabase) {
      const update = (setter: (value: (current: string[]) => string[]) => void) => setter((current) =>
        enabled ? [...current, reportId] : current.filter((id) => id !== reportId))
      if (action === 'support') update(setSupportedIds)
      else if (action === 'bookmark') update(setSavedIds)
      else if (action === 'follow') update(setFollowedIds)
      else update(setFlaggedIds)
      showSuccess('Saved in this demo session only.')
      return
    }
    if (!activeUser) {
      showError('Log in to support, save, follow, or flag a report.')
      return
    }
    try {
      await toggleCommunityAction(supabase, action, activeUser.id, reportId, enabled)
      const update = (setter: (value: (current: string[]) => string[]) => void) => setter((current) =>
        enabled ? [...current, reportId] : current.filter((id) => id !== reportId))
      if (action === 'support') update(setSupportedIds)
      else if (action === 'bookmark') update(setSavedIds)
      else if (action === 'follow') update(setFollowedIds)
      else update(setFlaggedIds)
      if (action === 'support') {
        setReports((current) => current.map((report) => report.id === reportId
          ? { ...report, supportCount: Math.max(0, (report.supportCount ?? 0) + (enabled ? 1 : -1)) }
          : report))
      }
      showSuccess(action === 'flag' ? 'Report flagged for review.' : `${action === 'bookmark' ? 'Saved item' : action === 'support' ? 'Support' : 'Follow'} ${enabled ? 'added' : 'removed'}.`)
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'The report action could not be saved.')
    }
  }

  const handleSupport = (reportId: string) => void handleCommunityAction('support', reportId)
  const handleSave = (reportId: string) => void handleCommunityAction('bookmark', reportId)
  const handleFollow = (reportId: string) => void handleCommunityAction('follow', reportId)
  const handleFlag = (reportId: string) => void handleCommunityAction('flag', reportId)
  const handleAddComment = async (reportId: string, comment: string): Promise<boolean> => {
    if (!supabase) {
      setCommentsByReport((current) => ({
        ...current,
        [reportId]: [...(current[reportId] ?? []), {
          id: crypto.randomUUID(), body: comment, author: 'You', createdAt: new Date().toISOString(),
        }],
      }))
      return true
    }
    if (!activeUser) {
      showError('Log in to comment on community reports.')
      return false
    }
    try {
      await addReportComment(supabase, activeUser.id, reportId, comment)
      await refreshLiveData(activeUser)
      return true
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Your comment could not be saved.')
      return false
    }
  }
  const handleShare = async (report: Report) => {
    const reportUrl = `${window.location.origin}/reports/${report.id}`
    try {
      await navigator.clipboard.writeText(reportUrl)
      showSuccess(`Link copied for ${report.referenceNumber}.`)
    } catch {
      showSuccess(`Share this report using its reference: ${report.referenceNumber}.`)
    }
  }
  const handleReportSubmit = async (draft: ReportDraft, imageFile?: File): Promise<Report> => {
    if (supabase) {
      if (!activeUser) throw new Error('Log in to submit a community report.')
      const { report, attachmentWarning } = await submitReport(supabase, activeUser, draft, imageFile)
      setReports((current) => [report, ...current.filter((item) => item.id !== report.id)])
      if (attachmentWarning) showError(attachmentWarning)
      else showSuccess(`Report submitted with reference ${report.referenceNumber}.`)
      await refreshLiveData(activeUser)
      return report
    }
    const timestamp = new Date().toISOString()
    const possibleDuplicates = findDuplicateReports(reports, draft)
    const nextReport: Report = {
      id: `demo-${crypto.randomUUID()}`,
      referenceNumber: generateReferenceNumber(),
      userId: 'resident-demo',
      reporterDisplayName: 'You',
      community: draft.locationDescription,
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      status: 'Submitted',
      priority: draft.priority,
      latitude: draft.latitude.trim() ? Number(draft.latitude) : null,
      longitude: draft.longitude.trim() ? Number(draft.longitude) : null,
      locationDescription: draft.locationDescription.trim(),
      assignedTo: 'Unassigned',
      createdAt: timestamp,
      updatedAt: timestamp,
      supportCount: 0,
      commentCount: 0,
      imageUrl: imageFile ? URL.createObjectURL(imageFile) : undefined,
      statusHistory: [
        {
          id: `history-${crypto.randomUUID()}`,
          previousStatus: 'Submitted',
          newStatus: 'Submitted',
          changedBy: 'Resident',
          note: 'Report submitted in the CivicFix demo environment.',
          createdAt: timestamp,
        },
      ],
    }
    setReports((current) => [nextReport, ...current])
    showSuccess(
      possibleDuplicates.length
        ? `Report created (${nextReport.referenceNumber}). Similar sample reports: ${possibleDuplicates.map((report) => report.referenceNumber).join(', ')}.`
        : `Report created with reference ${nextReport.referenceNumber}.`,
    )
    return nextReport
  }
  const handleStatusChange = (reportId: string, status: ReportStatus, note: string, assignedTo: string) => {
    const timestamp = new Date().toISOString()
    setReports((current) =>
      current.map((report) => {
        if (report.id !== reportId) return report
        if (status === report.status && assignedTo.trim() === report.assignedTo && !note.trim()) return report
        const statusChanged = status !== report.status
        return {
          ...report,
          status,
          updatedAt: timestamp,
          resolvedAt: status === 'Resolved' ? timestamp : undefined,
          assignedTo: assignedTo.trim() || report.assignedTo,
          resolutionNotes: status === 'Resolved' ? note.trim() : report.resolutionNotes,
          statusHistory: statusChanged || note.trim()
            ? [
                {
                  id: `history-${crypto.randomUUID()}`,
                  previousStatus: report.status,
                  newStatus: status,
                  changedBy: 'Demo administrator',
                  note: note.trim(),
                  createdAt: timestamp,
                },
                ...report.statusHistory,
              ]
            : report.statusHistory,
        }
      }),
    )
    showSuccess(`Demo status update recorded: ${status}.`)
  }

  const communityFeedProps = {
    reports,
    supportedIds,
    savedIds,
    followedIds,
    flaggedIds,
    commentsByReport,
    onSupport: handleSupport,
    onSave: handleSave,
    onFollow: handleFollow,
    onFlag: handleFlag,
    onAddComment: handleAddComment,
    onPreview: setPreviewImage,
    onShare: handleShare,
    liveMode: !isDemoMode,
    isAuthenticated: Boolean(activeUser),
    isLoading: dataLoading,
  }
  const myReports = supabase
    ? activeUser ? reports.filter((report) => report.userId === activeUser.id) : []
    : reports.filter((report) => report.userId === 'resident-demo' || report.userId === 'resident-a')

  const handleMarkNotificationRead = async (notificationId: string) => {
    if (!supabase) {
      setNotifications((current) => current.map((item) => item.id === notificationId
        ? { ...item, readAt: new Date().toISOString() }
        : item))
      return
    }
    if (!activeUser) return
    try {
      await markNotificationRead(supabase, notificationId)
      setNotifications((current) => current.map((item) => item.id === notificationId
        ? { ...item, readAt: new Date().toISOString() }
        : item))
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Could not mark notification as read.')
    }
  }
  const handleMarkAllNotificationsRead = async () => {
    for (const notification of notifications.filter((item) => !item.readAt)) {
      await handleMarkNotificationRead(notification.id)
    }
  }

  return (
    <BrowserRouter>
      <ProfileSetupGate>
      <div className="app-shell">
        <SiteHeader
          user={activeUser}
          notifications={notifications}
          isLoading={dataLoading}
          onMarkAllNotificationsRead={() => void handleMarkAllNotificationsRead()}
        />
        <main className="app-main">
          {dataError ? <div className="auth-error data-load-error" role="alert">Supabase data could not be loaded: {dataError}</div> : null}
          <Routes>
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/municipal" element={<MunicipalWorkspacePage />} />
            <Route
              path="/"
              element={<CommunityFeedPage {...communityFeedProps} />}
            />
            <Route
              path="/feed"
              element={<CommunityFeedPage {...communityFeedProps} />}
            />
            <Route path="/report" element={<ReportSubmissionPage reports={reports} onSubmit={handleReportSubmit} liveMode={!isDemoMode} isAuthenticated={Boolean(activeUser)} />} />
            <Route path="/dashboard" element={<MyReportsPage reports={myReports} liveMode={!isDemoMode} isAuthenticated={Boolean(activeUser)} isLoading={dataLoading} />} />
            <Route
              path="/admin"
              element={
                <AdminPage
                  reports={reports}
                  onStatusChange={handleStatusChange}
                  onPreview={setPreviewImage}
                />
              }
            />
            <Route path="/map" element={<MapPage reports={reports} liveMode={!isDemoMode} isAuthenticated={Boolean(activeUser)} isLoading={dataLoading} />} />
            <Route
              path="/notifications"
              element={<NotificationsPage notifications={notifications} reports={reports} liveMode={!isDemoMode} isAuthenticated={Boolean(activeUser)} isLoading={dataLoading} onMarkRead={handleMarkNotificationRead} />}
            />
            <Route
              path="/reports/:reportId"
              element={
                <ReportDetailsPage
                  reports={reports}
                  supportedIds={supportedIds}
                  savedIds={savedIds}
                  followedIds={followedIds}
                  flaggedIds={flaggedIds}
                  commentsByReport={commentsByReport}
                  onSupport={handleSupport}
                  onSave={handleSave}
                  onFollow={handleFollow}
                  onFlag={handleFlag}
                  onAddComment={handleAddComment}
                  onPreview={setPreviewImage}
                  onShare={handleShare}
                  liveMode={!isDemoMode}
                  isAuthenticated={Boolean(activeUser)}
                  isLoading={dataLoading}
                />
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        <MobileNavigation />
        {previewImage ? (
          <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Report photo preview" onClick={() => setPreviewImage('')}>
            <button type="button" className="lightbox-close" onClick={() => setPreviewImage('')} aria-label="Close photo preview"><X size={22} /></button>
            <img src={previewImage} alt="Expanded community report evidence" onClick={(event) => event.stopPropagation()} />
          </div>
        ) : null}
        {toast ? (
          <div className={`toast-message${toastIsError ? ' toast-error' : ''}`} role={toastIsError ? 'alert' : 'status'}>
            <Check size={16} /> <span>{toast}</span>
            <button type="button" onClick={() => { setToast(''); setToastIsError(false) }} aria-label="Dismiss message"><X size={15} /></button>
          </div>
        ) : null}
      </div>
      </ProfileSetupGate>
    </BrowserRouter>
  )
}

function SiteHeader({
  user,
  notifications,
  isLoading,
  onMarkAllNotificationsRead,
}: {
  user: User | null
  notifications: CivicNotification[]
  isLoading: boolean
  onMarkAllNotificationsRead: () => void
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [roleInfo, setRoleInfo] = useState<{ userId: string; role: string } | null>(null)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client || !user) return

    let isActive = true
    void client.from('profiles').select('app_role').eq('id', user.id).single()
      .then(({ data, error }) => {
        if (!isActive) return
        if (error) setProfileError(error.message)
        else setRoleInfo({ userId: user.id, role: data.app_role })
      })

    return () => {
      isActive = false
    }
  }, [user])

  const visibleRole = user && roleInfo?.userId === user.id ? roleInfo.role : null

  const handleSignOut = async () => {
    if (!supabase) return
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setProfileError(error.message)
        return
      }
      setProfileOpen(false)
      setRoleInfo(null)
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : 'Could not log out. Please try again.')
    }
  }

  const fullName = typeof user?.user_metadata.full_name === 'string' ? user.user_metadata.full_name : ''
  const accountName = fullName || user?.email || 'Account'
  const avatarInitial = (fullName || user?.email || 'A').charAt(0).toUpperCase()

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand" aria-label="CivicFix home">
          <img className="brand-logo" src="/CivicFix_Logo.svg" alt="" />
          <span className="brand-name">CivicFix</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => `top-nav-link${isActive ? ' is-active' : ''}`}><House size={16} />Home</NavLink>
          <NavLink to="/feed" className={({ isActive }) => `top-nav-link${isActive ? ' is-active' : ''}`}><Activity size={16} />Community feed</NavLink>
          <NavLink to="/report" className={({ isActive }) => `top-nav-link${isActive ? ' is-active' : ''}`}><CirclePlus size={16} />Report an issue</NavLink>
          <NavLink to="/map" className={({ isActive }) => `top-nav-link${isActive ? ' is-active' : ''}`}><MapIcon size={16} />Map</NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `top-nav-link${isActive ? ' is-active' : ''}`}><ClipboardList size={16} />My reports</NavLink>
          {visibleRole === 'municipal_admin' || visibleRole === 'municipal_worker' ? (
            <NavLink to="/municipal" className={({ isActive }) => `top-nav-link admin-nav${isActive ? ' is-active' : ''}`}><ShieldCheck size={16} />Municipal workspace</NavLink>
          ) : null}
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <div className="header-popover-wrap">
                <button
                  type="button"
                  className={`header-icon-button${notificationsOpen ? ' is-active' : ''}`}
                  onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false) }}
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell size={18} />
                  {notifications.some((notification) => !notification.readAt) ? <span className="notification-dot" /> : null}
                </button>
                {notificationsOpen ? (
                  <div className="header-popover">
                    <div className="popover-heading"><strong>Notifications</strong><button type="button" onClick={onMarkAllNotificationsRead}>Mark all read</button></div>
                    {notifications.slice(0, 3).map((notification) => (
                      <p className="notification-item" key={notification.id}>
                        <span className="notification-indicator" />{notification.message}
                      </p>
                    ))}
                    {!notifications.length ? <p className="notification-item">{isLoading ? 'Loading report updates…' : 'No report updates yet.'}</p> : null}
                    <Link to="/notifications" onClick={() => setNotificationsOpen(false)}>View notification centre <span>→</span></Link>
                  </div>
                ) : null}
              </div>
              <div className="header-popover-wrap profile-wrap">
                <button
                  type="button"
                  className="profile-trigger"
                  onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false) }}
                  aria-expanded={profileOpen}
                >
                  <span className="avatar avatar-header">{avatarInitial}</span><span className="profile-trigger-label">{accountName}</span><ChevronDown size={14} />
                </button>
                {profileOpen ? (
                  <div className="header-popover profile-popover">
                    <strong>{accountName}</strong>
                    {user.email ? <p>{user.email}</p> : null}
                    {profileError ? <p className="auth-error" role="alert">{profileError}</p> : null}
                    <button type="button" className="profile-signout" onClick={handleSignOut}>Log out</button>
                    <Link to="/dashboard" onClick={() => setProfileOpen(false)}>Open my reports <span>→</span></Link>
                    {visibleRole === 'municipal_admin' || visibleRole === 'municipal_worker' ? (
                      <Link to="/municipal" onClick={() => setProfileOpen(false)}>Municipal workspace <span>→</span></Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="header-auth-links">
              <Link to="/login" className="header-login-link">Log in</Link>
              <Link to="/signup" className="header-signup-link">Sign up</Link>
            </div>
          )}
          <span className="environment-label">{isDemoMode ? 'Demo Environment' : 'Supabase Mode'}</span>
        </div>
      </div>
    </header>
  )
}

function MobileNavigation() {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end><House size={19} /><span>Home</span></NavLink>
      <NavLink to="/map"><MapPin size={19} /><span>Map</span></NavLink>
      <NavLink to="/report" className="mobile-report-link"><CirclePlus size={22} /><span>Report</span></NavLink>
      <NavLink to="/dashboard"><ClipboardList size={19} /><span>My reports</span></NavLink>
      <NavLink to="/notifications"><Bell size={19} /><span>Updates</span></NavLink>
    </nav>
  )
}

function ReportSubmissionPage({
  reports,
  onSubmit,
  liveMode,
  isAuthenticated,
}: {
  reports: Report[]
  onSubmit: (draft: ReportDraft, imageFile?: File) => Promise<Report>
  liveMode: boolean
  isAuthenticated: boolean
}) {
  const [draft, setDraft] = useState<ReportDraft>(blankDraft)
  const [imageUrl, setImageUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [duplicateRefs, setDuplicateRefs] = useState<string[]>([])
  const [geolocationMessage, setGeolocationMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => () => {
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl)
  }, [imageUrl])

  const update = (field: keyof ReportDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setError('')
    setDuplicateRefs([])
  }
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeolocationMessage('Location isn’t available in this browser. Enter a nearby landmark instead.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDraft((current) => ({ ...current, latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6) }))
        setGeolocationMessage('Location added. The report map will use approximate coordinates.')
      },
      () => setGeolocationMessage('Location permission was unavailable. You can enter a nearby landmark and coordinates manually.'),
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }
  const handleImage = (file?: File) => {
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl)
    setImageFile(null)
    setImageUrl('')
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image to attach.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Images must be 10 MB or smaller.')
      return
    }
    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (liveMode && !isAuthenticated) {
      setError('Log in to submit a report.')
      return
    }
    const latitude = draft.latitude.trim() ? Number(draft.latitude) : undefined
    const longitude = draft.longitude.trim() ? Number(draft.longitude) : undefined
    if (!draft.title.trim() || !draft.description.trim() || !draft.locationDescription.trim()) {
      setError('Add a title, description and community location before submitting.')
      return
    }
    if ((latitude !== undefined && !Number.isFinite(latitude)) || (longitude !== undefined && !Number.isFinite(longitude))) {
      setError('Latitude and longitude must be valid numbers.')
      return
    }
    if ((latitude === undefined) !== (longitude === undefined)) {
      setError('Enter both latitude and longitude, or leave both blank.')
      return
    }
    if ((latitude !== undefined && (latitude < -90 || latitude > 90)) || (longitude !== undefined && (longitude < -180 || longitude > 180))) {
      setError('The location coordinates are outside valid map ranges.')
      return
    }
    const matches = findDuplicateReports(reports, draft)
    const matchedReferences = matches.map((report) => report.referenceNumber)
    if (matchedReferences.length && matchedReferences.join('|') !== duplicateRefs.join('|')) {
      setDuplicateRefs(matchedReferences)
      return
    }
    setIsSubmitting(true)
    try {
      const createdReport = await onSubmit(draft, imageFile ?? undefined)
      navigate(`/reports/${createdReport.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your report.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-content form-page">
      <div className="page-title-block">
        <p className="eyebrow">Community reporting</p>
        <h1>Report an issue</h1>
        <p>Share a service-delivery concern with a clear location so the community can follow its progress.</p>
      </div>
      <div className="form-disclaimer"><ShieldCheck size={18} /><p><strong>Independent community platform.</strong> {liveMode ? 'Your report is saved to CivicFix and is not automatically submitted as an official municipal complaint.' : 'This demo records reports in your browser session and does not submit official municipal complaints.'}</p></div>
      {liveMode && !isAuthenticated ? <p className="auth-notice">Log in to submit a report. <Link to="/login">Log in</Link> or <Link to="/signup">create an account</Link>.</p> : null}
      <form className="report-form" onSubmit={submit}>
        <div className="form-section-title"><span>01</span><div><h2>Describe the issue</h2><p>Keep the report specific and factual.</p></div></div>
        <label>Report title
          <input required maxLength={100} value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="For example, water leak on Main Road" />
        </label>
        <label>Description
          <textarea required maxLength={1200} rows={5} value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="What happened? When did you notice it? Is there a safety concern?" />
          <small>{draft.description.length}/1200 characters</small>
        </label>
        <div className="form-grid">
          <label>Issue category
            <select value={draft.category} onChange={(event) => update('category', event.target.value)}>
              {reportCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label>Urgency observed
            <select value={draft.priority} onChange={(event) => update('priority', event.target.value)}>
              {['Low', 'Medium', 'High', 'Critical'].map((priority) => <option key={priority}>{priority}</option>)}
            </select>
            <small>This helps triage, but does not guarantee response time.</small>
          </label>
        </div>
        <div className="form-section-title section-title-spaced"><span>02</span><div><h2>Where is it?</h2><p>Use a public landmark or general area. Avoid home addresses.</p></div></div>
        <label>Suburb, township or nearby landmark
          <input required maxLength={140} value={draft.locationDescription} onChange={(event) => update('locationDescription', event.target.value)} placeholder="e.g. near the community hall, Mamelodi West" />
        </label>
        <button type="button" className="secondary-button location-button" onClick={useCurrentLocation}><MapPin size={16} /> Use my location</button>
        {geolocationMessage ? <p className="form-help-message">{geolocationMessage}</p> : null}
        <div className="form-grid coordinate-grid">
          <label>Latitude <input inputMode="decimal" value={draft.latitude} onChange={(event) => update('latitude', event.target.value)} placeholder="Optional" /></label>
          <label>Longitude <input inputMode="decimal" value={draft.longitude} onChange={(event) => update('longitude', event.target.value)} placeholder="Optional" /></label>
        </div>
        <div className="form-section-title section-title-spaced"><span>03</span><div><h2>Add a photo</h2><p>Optional, JPG, PNG or WebP up to 10 MB.</p></div></div>
        <label className="upload-control">
          <span className="upload-icon"><Camera size={18} /></span>
          <span><strong>{imageUrl ? 'Replace selected photo' : 'Choose a photo'}</strong><small>JPG, PNG or WebP · 10 MB max</small></span>
          <input type="file" accept="image/*" onChange={(event) => handleImage(event.currentTarget.files?.[0])} />
        </label>
        {imageUrl ? <img className="upload-preview" src={imageUrl} alt="Selected report evidence preview" /> : null}
        {duplicateRefs.length ? <div className="form-warning"><strong>Similar reports to review:</strong> {duplicateRefs.join(', ')}. Review them before continuing. If this is a separate issue, choose “Submit as separate issue”.</div> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-footer">
          <p>{liveMode ? 'Submitting creates a report in the CivicFix database.' : 'Submitting creates a demo report in this browser session.'}</p>
          <button className="primary-button" type="submit" disabled={isSubmitting || (liveMode && !isAuthenticated)}>{isSubmitting ? 'Submitting…' : duplicateRefs.length ? 'Submit as separate issue' : 'Submit report'} <CirclePlus size={17} /></button>
        </div>
      </form>
      <button type="button" className="back-link" onClick={() => navigate(-1)}>← Back</button>
    </section>
  )
}

function MyReportsPage({ reports, liveMode, isAuthenticated, isLoading }: { reports: Report[]; liveMode: boolean; isAuthenticated: boolean; isLoading: boolean }) {
  return (
    <section className="page-content">
      <div className="page-title-block page-title-flex">
        <div><p className="eyebrow">Resident dashboard</p><h1>My reports</h1><p>{liveMode ? 'Follow the latest status and updates for reports you submitted.' : 'Follow the latest status and updates for demo reports.'}</p></div>
        <Link className="primary-button" to="/report">Report an issue <CirclePlus size={17} /></Link>
      </div>
      {isLoading ? <div className="empty-state" role="status"><h2>Loading your reports…</h2></div> : reports.length ? (
        <div className="my-report-list">
          {reports.map((report) => (
            <Link to={`/reports/${report.id}`} className="my-report-row" key={report.id}>
              <span className="my-report-icon"><ClipboardList size={19} /></span>
              <span className="my-report-content"><strong>{report.title}</strong><small>{report.referenceNumber} · {report.community ?? report.locationDescription}</small><span className="my-report-update">{report.statusHistory[0]?.note}</span></span>
              <StatusBadge status={report.status} />
            </Link>
          ))}
        </div>
      ) : liveMode && !isAuthenticated
        ? (
          <EmptyPageState title="Log in to see your reports" description="Sign in to view reports submitted by your account.">
            <Link to="/login" className="primary-button">Log in</Link>
          </EmptyPageState>
        )
        : <EmptyPageState title="No reports yet" description="Your submitted reports will appear here." />}
    </section>
  )
}

function AdminPage({ reports, onStatusChange, onPreview }: { reports: Report[]; onStatusChange: (reportId: string, status: ReportStatus, note: string, assignedTo: string) => void; onPreview: (imageUrl: string) => void }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const metrics = buildDashboardMetrics(reports)
  const filteredReports = reports.filter((report) => {
    const matchesSearch = `${report.title} ${report.referenceNumber} ${report.locationDescription}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (statusFilter === 'All statuses' || report.status === statusFilter)
  })

  return (
    <section className="page-content admin-page">
      <div className="admin-demo-notice"><ShieldCheck size={18} /><span><strong>Admin demo view.</strong> This screen is not protected by authentication and updates are local to this demo session.</span></div>
      <div className="page-title-block"><p className="eyebrow">Service operations</p><h1>Report management</h1><p>Review and update the sample community reports. Dashboard figures are calculated from these records.</p></div>
      <div className="metric-grid">
        {metrics.map((metric) => <div className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}
      </div>
      <div className="admin-table-panel">
        <div className="table-toolbar">
          <div><h2>All reports</h2><p>{filteredReports.length} matching sample records</p></div>
          <div className="table-filters">
            <label className="search-field"><span className="visually-hidden">Search reports</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports" /></label>
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select>
          </div>
        </div>
        <div className="admin-report-list">
          {filteredReports.map((report) => (
            <AdminReportRow key={report.id} report={report} onStatusChange={onStatusChange} onPreview={onPreview} />
          ))}
          {!filteredReports.length ? <EmptyPageState title="No matching reports" description="Change the search or status filter to see other records." /> : null}
        </div>
      </div>
    </section>
  )
}

function AdminReportRow({ report, onStatusChange, onPreview }: { report: Report; onStatusChange: (reportId: string, status: ReportStatus, note: string, assignedTo: string) => void; onPreview: (imageUrl: string) => void }) {
  const [status, setStatus] = useState(report.status)
  const [note, setNote] = useState('')
  const [assignedTo, setAssignedTo] = useState(report.assignedTo)
  const [error, setError] = useState('')
  const save = () => {
    if (status === 'Rejected' && !note.trim()) {
      setError('Add a reason before rejecting a report.')
      return
    }
    if (status === 'Resolved' && !note.trim()) {
      setError('Add completion notes before marking a report resolved.')
      return
    }
    if (status === report.status && !note.trim() && assignedTo === report.assignedTo) return
    onStatusChange(report.id, status, note || `Status updated to ${status}.`, assignedTo)
    setNote('')
    setError('')
  }
  return (
    <article className="admin-report">
      <div className="admin-report-summary">
        <div className="admin-report-heading"><div><span className="reference-number">{report.referenceNumber}</span><StatusBadge status={report.status} /></div><Link to={`/reports/${report.id}`}>{report.title}</Link><p><MapPin size={13} />{report.community ?? report.locationDescription} · {report.category}</p></div>
        {report.imageUrl ? <button type="button" className="admin-image-button" onClick={() => onPreview(report.imageUrl!)}><img src={report.imageUrl} alt={`Illustrative demo image for ${report.title}`} loading="lazy" /></button> : null}
      </div>
      <div className="admin-controls">
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as ReportStatus)}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Responsible team<input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Assign a team" /></label>
        <label className="admin-note-field">Public progress note<input value={note} onChange={(event) => { setNote(event.target.value); setError('') }} placeholder={status === 'Resolved' ? 'Completion details required' : status === 'Rejected' ? 'Reason required' : 'What should residents know?'} /></label>
        <button className="secondary-button" type="button" onClick={save}>Save update</button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {report.statusHistory.length ? <p className="admin-last-update"><Activity size={13} />Latest: {report.statusHistory[0].note}</p> : null}
    </article>
  )
}

function MapPage({ reports, liveMode, isAuthenticated, isLoading }: { reports: Report[]; liveMode: boolean; isAuthenticated: boolean; isLoading: boolean }) {
  const [status, setStatus] = useState('All statuses')
  const [category, setCategory] = useState('All categories')
  const filtered = reports.filter((report) =>
    (status === 'All statuses' || report.status === status) &&
    (category === 'All categories' || report.category === category),
  )
  return (
    <section className="page-content map-page">
      <div className="page-title-block"><p className="eyebrow">Location view</p><h1>Community issue map</h1><p>{liveMode ? 'Explore approximate locations of reports visible to your account.' : 'Explore sample report locations. Exact resident addresses are not shown.'}</p></div>
      {liveMode && !isAuthenticated ? (
        <EmptyPageState title="Log in to view the map" description="Sign in to see approximate locations of reports available to your account.">
          <Link to="/login" className="primary-button">Log in</Link>
        </EmptyPageState>
      ) : (
        <>
          <div className="map-filter-row">
            <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{reportCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <span>{filtered.length} {liveMode ? 'reports' : 'sample reports'}</span>
          </div>
          {isLoading ? <div className="empty-state" role="status"><h2>Loading report locations…</h2></div> : null}
          <ReportMap reports={filtered} />
          <div className="map-report-list">{filtered.map((report) => <Link to={`/reports/${report.id}`} className="map-report-row" key={report.id}><MapPin size={17} /><span><strong>{report.title}</strong><small>{report.community ?? report.locationDescription}</small></span><StatusBadge status={report.status} /></Link>)}</div>
          <p className="map-disclaimer">{liveMode ? 'Locations are approximate and reports are not automatically sent as official municipal complaints.' : 'Sample locations only. No claim of official municipal integration.'}</p>
        </>
      )}
    </section>
  )
}

function ReportDetailsPage(props: {
  reports: Report[]
  supportedIds: string[]
  savedIds: string[]
  followedIds: string[]
  flaggedIds: string[]
  commentsByReport: Record<string, ReportComment[]>
  onSupport: (reportId: string) => void
  onSave: (reportId: string) => void
  onFollow: (reportId: string) => void
  onFlag: (reportId: string) => void
  onAddComment: (reportId: string, comment: string) => Promise<boolean> | void
  onPreview: (imageUrl: string) => void
  onShare: (report: Report) => void
  liveMode: boolean
  isAuthenticated: boolean
  isLoading: boolean
}) {
  const { reportId } = useParams()
  const report = props.reports.find((item) => item.id === reportId)
  if (!report && props.isLoading) return <div className="empty-state" role="status"><h2>Loading report…</h2></div>
  if (!report && props.liveMode && !props.isAuthenticated) {
    return (
      <EmptyPageState title="Log in to view this report" description="Report details are available after you sign in.">
        <Link to="/login" className="primary-button">Log in</Link>
      </EmptyPageState>
    )
  }
  if (!report) return <EmptyPageState title="Report not found" description={props.liveMode ? 'This report is not visible to your account or is no longer available.' : 'This report may no longer be available in the current demo session.'} />
  const comments = props.commentsByReport[report.id] ?? []
  return (
    <section className="page-content detail-page">
      <Link to="/" className="back-link">← Back to community feed</Link>
      <div className="detail-grid">
        <div>
          <ReportPost
            report={report}
            supported={props.supportedIds.includes(report.id)}
            saved={props.savedIds.includes(report.id)}
            followed={props.followedIds.includes(report.id)}
            flagged={props.flaggedIds.includes(report.id)}
            comments={comments}
            onSupport={props.onSupport}
            onSave={props.onSave}
            onFollow={props.onFollow}
            onFlag={props.onFlag}
            onAddComment={props.onAddComment}
            onPreview={props.onPreview}
            onShare={props.onShare}
          />
        </div>
        <aside className="detail-side-panel">
          <div className="detail-status-heading"><div><p className="eyebrow">Current status</p><StatusBadge status={report.status} /></div></div>
          <h2>Progress history</h2>
          <ol className="detail-history">
            {report.statusHistory.slice().reverse().map((entry) => (
              <li key={entry.id}>
                <span className="history-marker" />
                <div><strong>{entry.newStatus}</strong><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('en-ZA')}</time><p>{entry.note}</p></div>
              </li>
            ))}
          </ol>
          {report.resolutionNotes ? <div className="resolution-note"><Check size={16} /><p><strong>Resolution notes</strong><br />{report.resolutionNotes}</p></div> : null}
          {report.resolutionImageUrl ? <button type="button" className="detail-evidence" onClick={() => props.onPreview(report.resolutionImageUrl!)}><img src={report.resolutionImageUrl} alt="Resolution evidence" /><span>View resolution evidence</span></button> : null}
          <div className="detail-follow">
            <p>Get updates when this report progresses.</p>
            <button type="button" className="secondary-button" onClick={() => props.onFollow(report.id)}>{props.followedIds.includes(report.id) ? 'Following updates' : 'Follow updates'}</button>
          </div>
          <div className="detail-location"><MapPin size={16} /><p><strong>Reported area</strong><br />{report.community ?? report.locationDescription}</p></div>
          <div className="detail-map-block">
            <p>Approximate location view</p>
            <ReportMap reports={[report]} />
          </div>
        </aside>
      </div>
    </section>
  )
}

function NotificationsPage({
  notifications,
  reports,
  liveMode,
  isAuthenticated,
  isLoading,
  onMarkRead,
}: {
  notifications: CivicNotification[]
  reports: Report[]
  liveMode: boolean
  isAuthenticated: boolean
  isLoading: boolean
  onMarkRead: (notificationId: string) => Promise<void>
}) {
  const reportById = new Map(reports.map((report) => [report.id, report]))
  return (
    <section className="page-content">
      <div className="page-title-block"><p className="eyebrow">Updates</p><h1>Notifications</h1><p>{liveMode ? 'In-app status updates for your reports and reports you follow. Push and email delivery are not configured.' : 'Demo updates based on report status history. No push or email delivery is configured.'}</p></div>
      {liveMode && !isAuthenticated ? (
        <EmptyPageState title="Log in to see updates" description="Sign in to receive in-app status updates for your reports and reports you follow.">
          <Link to="/login" className="primary-button">Log in</Link>
        </EmptyPageState>
      ) : (
        <div className="notification-list">
          {isLoading ? <div className="empty-state" role="status"><h2>Loading notifications…</h2></div> : null}
          {!isLoading ? notifications.map((notification) => {
            const report = notification.reportId ? reportById.get(notification.reportId) : undefined
            const content = <><span className="notification-icon"><Activity size={17} /></span><span><strong>{report ? `${report.referenceNumber}: ` : ''}{notification.message}</strong><time>{new Date(notification.createdAt).toLocaleString('en-ZA')}</time></span>{!notification.readAt ? <span className="notification-indicator" aria-label="Unread" /> : null}</>
            return (
              <article className={`notification-card${notification.readAt ? '' : ' notification-unread'}`} key={notification.id}>
                {report ? <Link to={`/reports/${report.id}`}>{content}</Link> : <div>{content}</div>}
                {!notification.readAt ? <button type="button" className="secondary-button" onClick={() => void onMarkRead(notification.id)}>Mark read</button> : null}
              </article>
            )
          }) : null}
          {!isLoading && !notifications.length ? <EmptyPageState title="No updates to show" description={liveMode ? 'Updates will appear when your reports or followed reports change status.' : 'Follow a report or submit one to see demo updates here.'} /> : null}
        </div>
      )}
    </section>
  )
}

function EmptyPageState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state"><ClipboardList size={24} /><h2>{title}</h2><p>{description}</p>{children}</div>
}

function NotFoundPage() {
  return <section className="page-content"><EmptyPageState title="Page not found" description="The page you are looking for is not part of this CivicFix demo." /><Link to="/" className="primary-button">Go to community feed</Link></section>
}

export default App
