import type { ReportStatus } from '../types'

const statusClass: Record<ReportStatus, string> = {
  Submitted: 'status-submitted',
  'Under Review': 'status-review',
  Assigned: 'status-assigned',
  'In Progress': 'status-progress',
  'Awaiting Action': 'status-awaiting',
  'Pending Completion Review': 'status-review',
  Resolved: 'status-resolved',
  Rejected: 'status-rejected',
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`status-badge ${statusClass[status]}`}>{status}</span>
}
