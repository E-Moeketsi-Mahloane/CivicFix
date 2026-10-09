export type ReportCategory =
  | 'Water & Sewage'
  | 'Roads & Potholes'
  | 'Electricity & Streetlights'
  | 'Waste Management'
  | 'Public Infrastructure'
  | 'Other'

export type ReportStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Rejected'

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export interface StatusHistoryEntry {
  id: string
  previousStatus: ReportStatus
  newStatus: ReportStatus
  changedBy: string
  note: string
  createdAt: string
}

export interface Report {
  id: string
  referenceNumber: string
  userId: string
  title: string
  description: string
  category: ReportCategory
  status: ReportStatus
  priority: PriorityLevel
  latitude: number
  longitude: number
  locationDescription: string
  assignedTo: string
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  statusHistory: StatusHistoryEntry[]
}

export interface ReportDraft {
  title: string
  description: string
  category: ReportCategory
  locationDescription: string
  latitude: string
  longitude: string
  priority: PriorityLevel
}
