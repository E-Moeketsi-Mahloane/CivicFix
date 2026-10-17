import { Check } from 'lucide-react'
import type { ReportStatus } from '../types'

const stages: Exclude<ReportStatus, 'Rejected'>[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Awaiting Action',
  'Pending Completion Review',
  'Resolved',
]

export function ReportTimeline({ status }: { status: ReportStatus }) {
  if (status === 'Rejected') {
    return (
      <div className="timeline-rejected">
        <span className="timeline-dot" aria-hidden="true" />
        <span>Report rejected</span>
      </div>
    )
  }

  const currentIndex = stages.indexOf(status)

  return (
    <ol className="report-timeline" aria-label={`Report progress: ${status}`}>
      {stages.map((stage, index) => {
        const isComplete = index < currentIndex
        const isCurrent = index === currentIndex

        return (
          <li
            key={stage}
            className={`timeline-stage${isComplete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="timeline-marker" aria-hidden="true">
              {isComplete ? <Check size={11} strokeWidth={3} /> : null}
            </span>
            <span className="timeline-label">{stage}</span>
          </li>
        )
      })}
    </ol>
  )
}
