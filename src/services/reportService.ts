import type { Report, ReportDraft, ReportStatus } from '../types'

type DuplicateCandidate =
  | Pick<Report, 'category' | 'description' | 'locationDescription' | 'latitude' | 'longitude'>
  | Pick<ReportDraft, 'category' | 'description' | 'locationDescription' | 'latitude' | 'longitude'>

export function generateReferenceNumber(): string {
  const randomSuffix = crypto.getRandomValues(new Uint32Array(1))[0]
    .toString(36)
    .toUpperCase()
    .padStart(7, '0')
    .slice(-7)
  return `CF-${new Date().getFullYear()}-${randomSuffix}`
}

export function buildDashboardMetrics(reports: Report[]) {
  const counts = {
    total: reports.length,
    open: reports.filter((report) => report.status !== 'Resolved' && report.status !== 'Rejected').length,
    inReview: reports.filter((report) => report.status === 'Under Review').length,
    assigned: reports.filter((report) => report.status === 'Assigned').length,
    inProgress: reports.filter((report) => report.status === 'In Progress').length,
    resolved: reports.filter((report) => report.status === 'Resolved').length,
  }

  return [
    { label: 'Total reports', value: counts.total.toLocaleString('en-ZA'), tone: 'slate' },
    { label: 'Open reports', value: counts.open.toLocaleString('en-ZA'), tone: 'amber' },
    { label: 'Under review', value: counts.inReview.toLocaleString('en-ZA'), tone: 'sky' },
    { label: 'Assigned', value: counts.assigned.toLocaleString('en-ZA'), tone: 'blue' },
    { label: 'In progress', value: counts.inProgress.toLocaleString('en-ZA'), tone: 'teal' },
    { label: 'Resolved', value: counts.resolved.toLocaleString('en-ZA'), tone: 'emerald' },
  ]
}

export function findDuplicateReports(reports: Report[], draft: DuplicateCandidate) {
  const normalizedDescription = draft.description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const hasDraftCoordinates =
    draft.latitude !== null &&
    draft.longitude !== null &&
    String(draft.latitude).trim() !== '' &&
    String(draft.longitude).trim() !== ''
  const trialLatitude = Number(draft.latitude)
  const trialLongitude = Number(draft.longitude)

  return reports.filter((report) => {
    if (report.category !== draft.category) {
      return false
    }

    const reportDescription = report.description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const keywordSimilarity =
      normalizedDescription.length > 12 &&
      (reportDescription.includes(normalizedDescription.slice(0, 18)) ||
        normalizedDescription.includes(reportDescription.slice(0, 18)))

    const locationDistanceKm =
      report.latitude !== null &&
      report.longitude !== null &&
      hasDraftCoordinates &&
      Number.isFinite(trialLatitude) &&
      Number.isFinite(trialLongitude)
        ? Math.hypot(report.latitude - trialLatitude, report.longitude - trialLongitude) * 111
        : Number.POSITIVE_INFINITY

    const descriptionLocationMatch =
      report.locationDescription.length > 0 &&
      draft.locationDescription.toLowerCase().includes(report.locationDescription.toLowerCase().slice(0, 10))
    const sameLocationZone = descriptionLocationMatch || locationDistanceKm < 1.5

    return keywordSimilarity || sameLocationZone
  })
}

export function nextStatusMessage(currentStatus: ReportStatus, nextStatus: ReportStatus): string {
  if (nextStatus === 'Rejected') {
    return 'Reason required for rejection before an administrator can close this report.'
  }

  if (nextStatus === 'Resolved') {
    return 'Support evidence and completion notes should be added before closing the issue.'
  }

  return `Status moved from ${currentStatus} to ${nextStatus}. Ensure the resident can see the update with the relevant notes.`
}
