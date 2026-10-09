import type { ReportStatus } from '../types'

const toneMap: Record<ReportStatus, string> = {
  Submitted: 'bg-slate-100 text-slate-700 ring-slate-200',
  'Under Review': 'bg-amber-100 text-amber-800 ring-amber-200',
  Assigned: 'bg-sky-100 text-sky-800 ring-sky-200',
  'In Progress': 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  Resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  Rejected: 'bg-rose-100 text-rose-800 ring-rose-200',
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneMap[status]}`}
    >
      {status}
    </span>
  )
}
