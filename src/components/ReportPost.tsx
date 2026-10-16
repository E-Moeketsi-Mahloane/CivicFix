import { useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Droplets,
  Heart,
  Lightbulb,
  MapPin,
  MessageCircle,
  Road,
  Share2,
  ShieldCheck,
  Bookmark,
  Flag,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ReportTimeline } from './ReportTimeline'
import { StatusBadge } from './StatusBadge'
import type { Report } from '../types'

type ReportPostProps = {
  report: Report
  supported: boolean
  saved: boolean
  followed: boolean
  flagged: boolean
  comments: string[]
  onSupport: (reportId: string) => void
  onSave: (reportId: string) => void
  onFollow: (reportId: string) => void
  onFlag: (reportId: string) => void
  onAddComment: (reportId: string, comment: string) => void
  onPreview: (imageUrl: string) => void
  onShare: (report: Report) => void
}

function categoryIcon(category: Report['category']) {
  if (category === 'Water & Sewage') return <Droplets size={15} />
  if (category === 'Roads & Potholes') return <Road size={15} />
  if (category === 'Electricity & Streetlights') return <Lightbulb size={15} />
  if (category === 'Waste Management') return <Trash2 size={15} />
  return <Camera size={15} />
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function ReportPost({
  report,
  supported,
  saved,
  followed,
  flagged,
  comments,
  onSupport,
  onSave,
  onFollow,
  onFlag,
  onAddComment,
  onPreview,
  onShare,
}: ReportPostProps) {
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const lastUpdate = report.statusHistory[0]
  const date = new Date(report.createdAt)
  const formattedDate = new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const comment = commentDraft.trim()
    if (!comment) return
    onAddComment(report.id, comment)
    setCommentDraft('')
  }

  return (
    <article className="feed-post">
      <header className="post-header">
        <div className="avatar avatar-small" aria-hidden="true">
          {(report.reporterDisplayName ?? 'Community').slice(0, 1)}
        </div>
        <div className="post-byline">
          <div className="post-author-line">
            <span className="post-author">{report.reporterDisplayName ?? 'Community member'}</span>
            <span className="post-dot">·</span>
            <span>{report.community ?? 'Local community'}</span>
          </div>
          <div className="post-meta-line">
            <time dateTime={report.createdAt} title={date.toLocaleString('en-ZA')}>
              {timeAgo(report.createdAt)}
            </time>
            <span className="post-dot">·</span>
            <span>{formattedDate}</span>
            <span className="post-dot">·</span>
            <span className="category-chip">{categoryIcon(report.category)}{report.category}</span>
          </div>
        </div>
        <button
          className={`icon-button${flagged ? ' is-selected' : ''}`}
          type="button"
          aria-label={flagged ? 'Report flagged for demo review' : 'Flag report for demo review'}
          title={flagged ? 'Flagged in this demo' : 'Flag for review'}
          onClick={() => onFlag(report.id)}
          disabled={flagged}
        >
          <Flag size={16} />
        </button>
      </header>

      <div className="post-title-row">
        <h2>{report.title}</h2>
        <StatusBadge status={report.status} />
      </div>
      <p className="post-description">{report.description}</p>

      {report.imageUrl ? (
        <button
          type="button"
          className="post-image-button"
          onClick={() => onPreview(report.imageUrl!)}
          aria-label={`View larger image for ${report.title}`}
        >
          <img src={report.imageUrl} alt={`Illustrative demo image for ${report.title}`} loading="lazy" />
          <span className="image-caption"><Camera size={14} /> Illustrative demo image</span>
        </button>
      ) : null}

      <div className="post-location-row">
        <MapPin size={15} aria-hidden="true" />
        <span>{report.community ?? report.locationDescription}</span>
        <span className="location-separator">·</span>
        <span className="reference-number">{report.referenceNumber}</span>
        <span className={`priority-label priority-${report.priority.toLowerCase()}`}>
          {report.priority === 'Critical' ? <AlertTriangle size={13} /> : null}
          {report.priority} priority
        </span>
      </div>

      <div className="post-progress">
        <div className="progress-heading">
          <span><ShieldCheck size={14} /> Progress</span>
          <div className="progress-links">
            <button type="button" onClick={() => onFollow(report.id)}>{followed ? 'Following' : 'Follow updates'}</button>
            <Link to={`/reports/${report.id}`}>Full history</Link>
          </div>
        </div>
        <ReportTimeline status={report.status} />
        {lastUpdate ? (
          <p className="latest-update">
            <Clock3 size={13} />
            {lastUpdate.note}
            <span title={new Date(lastUpdate.createdAt).toLocaleString('en-ZA')}>Updated {timeAgo(lastUpdate.createdAt)}</span>
          </p>
        ) : null}
        {report.resolutionImageUrl ? (
          <button
            type="button"
            className="resolution-evidence"
            onClick={() => onPreview(report.resolutionImageUrl!)}
          >
            <CheckCircle2 size={15} />
            Demo resolution image
            <img src={report.resolutionImageUrl} alt="" loading="lazy" />
          </button>
        ) : null}
      </div>

      <div className="post-engagement">
        <span><Heart size={14} /> {Math.max(0, (report.supportCount ?? 0) + (supported ? 1 : 0))} supports</span>
        <span><MessageCircle size={14} /> {(report.commentCount ?? 0) + comments.length} comments</span>
      </div>

      <div className="post-actions">
        <button
          type="button"
          className={`post-action${supported ? ' is-selected' : ''}`}
          onClick={() => onSupport(report.id)}
          aria-pressed={supported}
        >
          <Heart size={17} fill={supported ? 'currentColor' : 'none'} />
          <span>{supported ? 'Supported' : 'Support'}</span>
        </button>
        <button type="button" className="post-action" onClick={() => setCommentOpen((open) => !open)} aria-expanded={commentOpen}>
          <MessageCircle size={17} />
          <span>Comment</span>
        </button>
        <button type="button" className={`post-action${saved ? ' is-selected' : ''}`} onClick={() => onSave(report.id)} aria-pressed={saved}>
          <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
          <span>{saved ? 'Saved' : 'Save'}</span>
        </button>
        <button type="button" className="post-action post-action-share" onClick={() => onShare(report)}>
          <Share2 size={17} />
          <span>Share</span>
        </button>
      </div>

      {commentOpen ? (
        <div className="comments-area">
          {comments.length > 0 ? (
            <ul className="comment-list">
              {comments.map((comment, index) => (
                <li key={`${report.id}-comment-${index}`}>
                  <span className="comment-avatar" aria-hidden="true">Y</span>
                  <p><strong>You</strong>{comment}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="comments-empty">Add a useful landmark, observation or supporting detail.</p>
          )}
          <form className="comment-form" onSubmit={submitComment}>
            <label className="visually-hidden" htmlFor={`comment-${report.id}`}>Add a comment</label>
            <input
              id={`comment-${report.id}`}
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Share a helpful update…"
              maxLength={500}
            />
            <button type="submit" disabled={!commentDraft.trim()}>Post</button>
          </form>
          <p className="privacy-hint">Please don’t include personal contact details.</p>
        </div>
      ) : null}
    </article>
  )
}
