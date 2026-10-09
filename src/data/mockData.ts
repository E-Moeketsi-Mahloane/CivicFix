import type { Report, ReportCategory, ReportStatus } from '../types'

export const reportCategories: ReportCategory[] = [
  'Water & Sewage',
  'Roads & Potholes',
  'Electricity & Streetlights',
  'Waste Management',
  'Public Infrastructure',
  'Other',
]

export const statusOptions: ReportStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected',
]

export const featureCards = [
  {
    title: 'Fast reporting',
    description: 'Residents can submit issues with a photo, category, and exact location in under two minutes.',
  },
  {
    title: 'Progress visibility',
    description: 'Every status change is logged with who changed it and why, so residents can understand next steps.',
  },
  {
    title: 'Admin oversight',
    description: 'Municipal teams can triage, assign, and track service requests from one management view.',
  },
]

export const initialReports: Report[] = [
  {
    id: 'report-1',
    referenceNumber: 'CF-2026-1024',
    userId: 'resident-a',
    title: 'Pothole near the traffic lights',
    description: 'Large pothole has formed near the intersection and is causing damage to vehicles after rainfall.',
    category: 'Roads & Potholes',
    status: 'Assigned',
    priority: 'High',
    latitude: -26.1719,
    longitude: 28.0107,
    locationDescription: 'Main Road and Long Street, Johannesburg South',
    assignedTo: 'Road Maintenance Unit',
    createdAt: '2026-10-04T09:20:00.000Z',
    updatedAt: '2026-10-05T08:00:00.000Z',
    statusHistory: [
      {
        id: 'history-1',
        previousStatus: 'Submitted',
        newStatus: 'Assigned',
        changedBy: 'Municipal admin',
        note: 'Escalated to road maintenance for repair scheduling.',
        createdAt: '2026-10-05T08:00:00.000Z',
      },
    ],
  },
  {
    id: 'report-2',
    referenceNumber: 'CF-2026-1018',
    userId: 'resident-b',
    title: 'Broken streetlight on public walk path',
    description: 'Streetlight remains dark outside the community hall and residents report safety concerns after sunset.',
    category: 'Electricity & Streetlights',
    status: 'In Progress',
    priority: 'Medium',
    latitude: -26.1507,
    longitude: 28.0315,
    locationDescription: 'Corner of Oak Avenue and Community Road',
    assignedTo: 'Electrical Services',
    createdAt: '2026-10-02T18:10:00.000Z',
    updatedAt: '2026-10-07T10:30:00.000Z',
    statusHistory: [
      {
        id: 'history-2',
        previousStatus: 'Submitted',
        newStatus: 'Under Review',
        changedBy: 'Municipal admin',
        note: 'Reviewed by electrical operations team.',
        createdAt: '2026-10-03T08:40:00.000Z',
      },
      {
        id: 'history-3',
        previousStatus: 'Under Review',
        newStatus: 'In Progress',
        changedBy: 'Municipal admin',
        note: 'Replacement parts allocated and contractor notified.',
        createdAt: '2026-10-07T10:30:00.000Z',
      },
    ],
  },
  {
    id: 'report-3',
    referenceNumber: 'CF-2026-0961',
    userId: 'resident-c',
    title: 'Sewage overflow near residential gate',
    description: 'Black water is pooling near the gate and posing a health hazard to nearby residents.',
    category: 'Water & Sewage',
    status: 'Resolved',
    priority: 'Critical',
    latitude: -26.1939,
    longitude: 28.0246,
    locationDescription: 'Mamelodi West, Gate 2 entrance',
    assignedTo: 'Wastewater Operations',
    createdAt: '2026-09-21T13:00:00.000Z',
    updatedAt: '2026-09-23T12:00:00.000Z',
    resolvedAt: '2026-09-23T12:00:00.000Z',
    statusHistory: [
      {
        id: 'history-4',
        previousStatus: 'Submitted',
        newStatus: 'Assigned',
        changedBy: 'Municipal admin',
        note: 'Assigned to the wastewater response field crew.',
        createdAt: '2026-09-22T07:05:00.000Z',
      },
      {
        id: 'history-5',
        previousStatus: 'Assigned',
        newStatus: 'Resolved',
        changedBy: 'Municipal admin',
        note: 'Overflow contained and the affected trench was cleaned. Completion evidence added.',
        createdAt: '2026-09-23T12:00:00.000Z',
      },
    ],
  },
]

export const dashboardStats = [
  { label: 'Total reports', value: '1,284', tone: 'slate' },
  { label: 'Open reports', value: '218', tone: 'amber' },
  { label: 'Under review', value: '46', tone: 'sky' },
  { label: 'Resolved', value: '928', tone: 'emerald' },
]

export const demoNote = 'Demo mode is active. This sample data is for presentation purposes only and is not a live municipal reporting feed.'
