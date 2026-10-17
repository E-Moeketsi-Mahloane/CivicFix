import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowRight,
  Bookmark,
  CirclePlus,
  ClipboardList,
  Filter,
  Map,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ReportPost } from '../components/ReportPost'
import { reportCategories, statusOptions } from '../data/mockData'
import type { Report, ReportCategory, ReportComment, ReportStatus } from '../types'

type FeedSort = 'newest' | 'updated' | 'supported'
type FeedTab = 'all' | 'following' | 'resolved'

type CommunityFeedPageProps = {
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
}

export function CommunityFeedPage({
  reports,
  supportedIds,
  savedIds,
  followedIds,
  flaggedIds,
  commentsByReport,
  onSupport,
  onSave,
  onFollow,
  onFlag,
  onAddComment,
  onPreview,
  onShare,
  liveMode,
  isAuthenticated,
  isLoading,
}: CommunityFeedPageProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'All categories' | ReportCategory>('All categories')
  const [status, setStatus] = useState<'All statuses' | ReportStatus>('All statuses')
  const [community, setCommunity] = useState('All communities')
  const [priority, setPriority] = useState('Any urgency')
  const [sort, setSort] = useState<FeedSort>('newest')
  const [tab, setTab] = useState<FeedTab>('all')
  const [visibleCount, setVisibleCount] = useState(5)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const communities = useMemo(
    () => [...new Set(reports.map((report) => report.community ?? 'Local community'))].sort(),
    [reports],
  )
  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase()
    return reports
      .filter((report) => {
        const matchesQuery =
          !query ||
          report.title.toLowerCase().includes(query) ||
          report.description.toLowerCase().includes(query) ||
          report.referenceNumber.toLowerCase().includes(query)
        const matchesCategory = category === 'All categories' || report.category === category
        const matchesStatus = status === 'All statuses' || report.status === status
        const matchesCommunity = community === 'All communities' || report.community === community
        const matchesPriority = priority === 'Any urgency' || report.priority === priority
        const matchesTab =
          tab === 'all' ||
          (tab === 'following' && (followedIds.includes(report.id) || savedIds.includes(report.id))) ||
          (tab === 'resolved' && report.status === 'Resolved')
        return matchesQuery && matchesCategory && matchesStatus && matchesCommunity && matchesPriority && matchesTab
      })
      .sort((first, second) => {
        if (sort === 'updated') return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
        if (sort === 'supported') {
          return (second.supportCount ?? 0) - (first.supportCount ?? 0)
        }
        return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
      })
  }, [category, community, followedIds, priority, reports, savedIds, search, sort, status, tab])

  const clearFilters = () => {
    setSearch('')
    setCategory('All categories')
    setStatus('All statuses')
    setCommunity('All communities')
    setPriority('Any urgency')
    setTab('all')
    setVisibleCount(5)
  }

  const openCount = reports.filter((report) => !['Resolved', 'Rejected'].includes(report.status)).length
  const reviewCount = reports.filter((report) => report.status === 'Under Review').length
  const recentlyResolved = reports.filter((report) => report.status === 'Resolved').length
  const activeFilters = [
    search ? `Search: ${search}` : '',
    category !== 'All categories' ? category : '',
    status !== 'All statuses' ? status : '',
    community !== 'All communities' ? community : '',
    priority !== 'Any urgency' ? `${priority} urgency` : '',
    tab === 'following' ? 'Saved & followed' : '',
    tab === 'resolved' ? 'Resolved' : '',
  ].filter(Boolean)

  return (
    <div className="feed-layout">
      <aside className="feed-sidebar left-sidebar" aria-label="Community navigation">
        <section className="sidebar-profile">
          <div className="avatar avatar-large">{isAuthenticated ? 'Y' : 'G'}</div>
          <div>
            <strong>{isAuthenticated ? 'Welcome to CivicFix' : 'Welcome, community member'}</strong>
            <span>{liveMode ? 'Community reports' : 'Sample community'}</span>
          </div>
        </section>
        <nav className="feed-side-nav">
          <Link to="/" className="side-nav-link"><Activity size={18} />Community Feed</Link>
          <Link to="/report" className="side-nav-link"><CirclePlus size={18} />Report an issue</Link>
          <Link to="/dashboard" className="side-nav-link"><ClipboardList size={18} />My reports</Link>
          <button type="button" className="side-nav-link" onClick={() => setTab('following')}><Bookmark size={18} />Saved & followed</button>
          <Link to="/map" className="side-nav-link"><Map size={18} />Map view</Link>
        </nav>
        <div className="sidebar-rule" />
        <div className="community-select-wrap">
          <label htmlFor="community-selector">Your community</label>
          <select id="community-selector" value={community} onChange={(event) => setCommunity(event.target.value)}>
            <option>All communities</option>
            {communities.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div className="guidelines-note">
          <ShieldCheck size={17} />
          <p><strong>Community guidelines</strong><br />Keep reports factual, respectful and free of private contact details.</p>
        </div>
      </aside>

      <section className="feed-main" aria-labelledby="feed-heading">
        <div className="feed-heading-row">
          <div>
            <p className="eyebrow">Community updates</p>
            <h1 id="feed-heading">Community Feed</h1>
            <p className="feed-intro">See what’s happening nearby and follow the progress of reported service-delivery issues.</p>
          </div>
        </div>

        <Link to="/report" className="feed-composer">
          <div className="avatar avatar-small">{isAuthenticated ? 'Y' : 'G'}</div>
          <span>What needs attention in your community?</span>
          <span className="composer-action"><CirclePlus size={17} /> Report</span>
        </Link>

        <div className="feed-controls">
          <div className="feed-tabs" role="tablist" aria-label="Feed type">
            <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')}>All reports</button>
            <button type="button" role="tab" aria-selected={tab === 'following'} className={tab === 'following' ? 'is-active' : ''} onClick={() => setTab('following')}>Following</button>
            <button type="button" role="tab" aria-selected={tab === 'resolved'} className={tab === 'resolved' ? 'is-active' : ''} onClick={() => setTab('resolved')}>Resolved</button>
          </div>
          <button type="button" className="filter-toggle" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            <SlidersHorizontal size={16} /> Filters
          </button>
        </div>

        <div className="feed-search-row">
          <label className="search-field">
            <Search size={17} />
            <span className="visually-hidden">Search reports</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, reference or description" />
          </label>
          <label className="sort-field">
            <ArrowDownWideNarrow size={16} />
            <span className="visually-hidden">Sort reports</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as FeedSort)}>
              <option value="newest">Newest</option>
              <option value="updated">Recently updated</option>
              <option value="supported">Most supported</option>
            </select>
          </label>
        </div>

        {filtersOpen ? (
          <div className="filter-panel">
            <label>Category
              <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                <option>All categories</option>
                {reportCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>Status
              <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option>All statuses</option>
                {statusOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>Community
              <select value={community} onChange={(event) => setCommunity(event.target.value)}>
                <option>All communities</option>
                {communities.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>Urgency
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option>Any urgency</option>
                {['Low', 'Medium', 'High', 'Critical'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <button type="button" className="clear-filter-button" onClick={clearFilters}><Filter size={14} /> Clear filters</button>
          </div>
        ) : null}
        {activeFilters.length ? (
          <div className="active-filter-row" aria-label="Active filters">
            <span>Showing:</span>
            {activeFilters.map((filter) => <span className="active-filter-chip" key={filter}>{filter}</span>)}
            <button type="button" onClick={clearFilters}>Clear all</button>
          </div>
        ) : null}

        <div className="feed-count-row">
          <span>{filteredReports.length} {filteredReports.length === 1 ? 'report' : 'reports'}</span>
          <span>{liveMode ? 'Community-submitted reports · Independent platform' : 'Sample community reports · Demo'}</span>
        </div>

        {isLoading ? (
          <div className="empty-state" role="status"><h2>Loading community reports…</h2></div>
        ) : filteredReports.length ? (
          <div className="feed-post-list">
            {filteredReports.slice(0, visibleCount).map((report) => (
              <ReportPost
                key={report.id}
                report={report}
                supported={supportedIds.includes(report.id)}
                saved={savedIds.includes(report.id)}
                followed={followedIds.includes(report.id)}
                flagged={flaggedIds.includes(report.id)}
                comments={commentsByReport[report.id] ?? []}
                onSupport={onSupport}
                onSave={onSave}
                onFollow={onFollow}
                onFlag={onFlag}
                onAddComment={onAddComment}
                onPreview={onPreview}
                onShare={onShare}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={24} />
            <h2>{liveMode && !isAuthenticated ? 'Log in to view community reports' : 'No reports match those filters'}</h2>
            {liveMode && !isAuthenticated
              ? <p>Sign in to browse reports available to your account, then submit and follow issues in your municipality.</p>
              : <p>Try a different search or clear the selected filters.</p>}
            {liveMode && !isAuthenticated
              ? (
                <div className="empty-state-actions">
                  <Link to="/login" className="primary-button">Log in</Link>
                  <Link to="/signup" className="secondary-button">Create an account</Link>
                </div>
              )
              : <button type="button" onClick={clearFilters}>Clear filters</button>}
          </div>
        )}
        {filteredReports.length > visibleCount ? (
          <button className="load-more-button" type="button" onClick={() => setVisibleCount((count) => count + 5)}>
            Load more reports <ArrowRight size={16} />
          </button>
        ) : null}
      </section>

      <aside className="feed-sidebar right-sidebar" aria-label="Community activity">
        <section className="side-panel">
          <div className="side-panel-heading"><UsersRound size={17} /><h2>Community snapshot</h2></div>
          <p className="snapshot-community">{liveMode ? 'CivicFix community' : 'Johannesburg South'}</p>
          <p className="snapshot-note">{liveMode ? 'Counts reflect reports visible to your signed-in account.' : 'Counts below are derived from sample reports in this demo.'}</p>
          <div className="snapshot-stat">
            <span>Open reports</span><strong>{openCount}</strong>
          </div>
          <div className="snapshot-stat">
            <span>Awaiting review</span><strong>{reviewCount}</strong>
          </div>
          <div className="snapshot-stat">
            <span>{liveMode ? 'Resolved' : 'Resolved in sample'}</span><strong>{recentlyResolved}</strong>
          </div>
        </section>
        <section className="side-panel activity-panel">
          <div className="side-panel-heading"><Activity size={17} /><h2>Recent progress</h2></div>
          {reports.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3).map((report) => (
            <Link to={`/reports/${report.id}`} className="activity-item" key={report.id}>
              <span className="activity-mark" />
              <span><strong>{report.referenceNumber}</strong><small>{report.status} · {report.community}</small></span>
            </Link>
          ))}
        </section>
        <section className="side-panel note-panel">
          <ShieldCheck size={19} />
          <p><strong>Independent community platform</strong><br />Reports in CivicFix are not automatically sent to a municipality unless an official integration is established.</p>
        </section>
      </aside>
    </div>
  )
}
