import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Report, ReportCategory, ReportDraft, ReportStatus, StatusHistoryEntry } from '../types'
import { generateReferenceNumber } from './reportService'

type DatabaseReport = {
  id: string
  reference_number: string
  user_id: string
  title: string
  description: string
  category: ReportCategory
  status: ReportStatus
  priority: Report['priority']
  latitude: number | null
  longitude: number | null
  location_description: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  public_update: string | null
}

type EngagementCount = { report_id: string; support_count: number | string; comment_count: number | string }

export type CivicComment = {
  id: string
  body: string
  author: string
  createdAt: string
}

export type CivicNotification = {
  id: string
  reportId: string | null
  message: string
  createdAt: string
  readAt: string | null
}

export type CommunityData = {
  reports: Report[]
  supportedIds: string[]
  savedIds: string[]
  followedIds: string[]
  flaggedIds: string[]
  commentsByReport: Record<string, CivicComment[]>
}

export async function loadCommunityData(client: SupabaseClient, user: User): Promise<CommunityData> {
  const { data: dbReports, error: reportError } = await client
    .from('reports')
    .select('id,reference_number,user_id,title,description,category,status,priority,latitude,longitude,location_description,assigned_to,created_at,updated_at,resolved_at,public_update')
    .order('created_at', { ascending: false })
    .limit(500)
  if (reportError) throw reportError

  const rows = (dbReports ?? []) as DatabaseReport[]
  const ids = rows.map((report) => report.id)
  if (!ids.length) {
    const [supportResult, bookmarkResult, followResult, flagResult] = await Promise.all([
      client.from('report_supports').select('report_id').eq('user_id', user.id),
      client.from('report_bookmarks').select('report_id').eq('user_id', user.id),
      client.from('report_follows').select('report_id').eq('user_id', user.id),
      client.from('report_flags').select('report_id').eq('user_id', user.id),
    ])
    for (const result of [supportResult, bookmarkResult, followResult, flagResult]) {
      if (result.error) throw result.error
    }
    return {
      reports: [],
      supportedIds: (supportResult.data ?? []).map((row) => row.report_id),
      savedIds: (bookmarkResult.data ?? []).map((row) => row.report_id),
      followedIds: (followResult.data ?? []).map((row) => row.report_id),
      flaggedIds: (flagResult.data ?? []).map((row) => row.report_id),
      commentsByReport: {},
    }
  }

  const reportIdBatches = Array.from({ length: Math.ceil(ids.length / 75) }, (_, index) =>
    ids.slice(index * 75, (index + 1) * 75))
  const [countsResult, supportResult, bookmarkResult, followResult, flagResult, relatedBatches] = await Promise.all([
    client.rpc('get_report_engagement_counts', { p_report_ids: ids }),
    client.from('report_supports').select('report_id').eq('user_id', user.id),
    client.from('report_bookmarks').select('report_id').eq('user_id', user.id),
    client.from('report_follows').select('report_id').eq('user_id', user.id),
    client.from('report_flags').select('report_id').eq('user_id', user.id),
    Promise.all(reportIdBatches.map((batch) => Promise.all([
      client.from('report_status_history')
        .select('id,report_id,previous_status,new_status,public_update,created_at')
        .in('report_id', batch)
        .order('created_at', { ascending: false }),
      client.from('report_attachments')
        .select('report_id,storage_path')
        .in('report_id', batch),
      client.from('report_comments')
        .select('id,report_id,body,created_at')
        .in('report_id', batch)
        .order('created_at', { ascending: true })
        .limit(5000),
    ]))),
  ])
  const historyResults = relatedBatches.map(([result]) => result)
  const attachmentsResults = relatedBatches.map(([, result]) => result)
  const commentsResults = relatedBatches.map(([, , result]) => result)
  for (const result of [countsResult, supportResult, bookmarkResult, followResult, flagResult, ...historyResults, ...attachmentsResults, ...commentsResults]) {
    if (result.error) throw result.error
  }

  const historyRows = historyResults.flatMap((result) => result.data ?? [])
  const attachmentRows = attachmentsResults.flatMap((result) => result.data ?? []) as { report_id: string; storage_path: string }[]
  const commentRows = commentsResults.flatMap((result) => result.data ?? [])
  const paths = attachmentRows.map((row) => row.storage_path)
  const signedUrlByPath = new Map<string, string>()
  if (paths.length) {
    const { data, error } = await client.storage.from('report-attachments').createSignedUrls(paths, 3600)
    if (error) throw error
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) signedUrlByPath.set(entry.path, entry.signedUrl)
    }
  }

  const historiesByReport = new Map<string, StatusHistoryEntry[]>()
  for (const row of historyRows) {
    const entries = historiesByReport.get(row.report_id) ?? []
    entries.push({
      id: row.id,
      previousStatus: row.previous_status ?? row.new_status,
      newStatus: row.new_status,
      changedBy: 'CivicFix status update',
      note: row.public_update ?? `Report status updated to ${row.new_status}.`,
      createdAt: row.created_at,
    })
    historiesByReport.set(row.report_id, entries)
  }

  const attachmentByReport = new Map<string, string>()
  for (const row of attachmentRows) {
    const signedUrl = signedUrlByPath.get(row.storage_path)
    if (signedUrl && !attachmentByReport.has(row.report_id)) attachmentByReport.set(row.report_id, signedUrl)
  }
  const countsByReport = new Map(
    ((countsResult.data ?? []) as EngagementCount[]).map((row) => [row.report_id, row]),
  )
  const reports: Report[] = rows.map((row) => {
    const history = historiesByReport.get(row.id) ?? []
    const latestUpdate = row.public_update
    const count = countsByReport.get(row.id)
    return {
      id: row.id,
      referenceNumber: row.reference_number,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      category: row.category,
      status: row.status,
      priority: row.priority,
      latitude: row.latitude,
      longitude: row.longitude,
      locationDescription: row.location_description ?? '',
      community: row.location_description ?? 'Local community',
      assignedTo: row.assigned_to ?? 'Unassigned',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at ?? undefined,
      statusHistory: history,
      reporterDisplayName: row.user_id === user.id ? 'You' : 'Community member',
      supportCount: Number(count?.support_count ?? 0),
      commentCount: Number(count?.comment_count ?? 0),
      engagementCountsIncludeViewer: true,
      imageUrl: attachmentByReport.get(row.id),
      resolutionNotes: row.status === 'Resolved' ? latestUpdate ?? undefined : undefined,
    }
  })

  const commentsByReport: Record<string, CivicComment[]> = {}
  for (const row of commentRows) {
    const comments = commentsByReport[row.report_id] ?? []
    comments.push({
      id: row.id,
      body: row.body,
      author: 'Community member',
      createdAt: row.created_at,
    })
    commentsByReport[row.report_id] = comments
  }

  return {
    reports,
    supportedIds: (supportResult.data ?? []).map((row) => row.report_id),
    savedIds: (bookmarkResult.data ?? []).map((row) => row.report_id),
    followedIds: (followResult.data ?? []).map((row) => row.report_id),
    flaggedIds: (flagResult.data ?? []).map((row) => row.report_id),
    commentsByReport,
  }
}

export async function submitReport(
  client: SupabaseClient,
  user: User,
  draft: ReportDraft,
  imageFile?: File,
): Promise<{ report: Report; attachmentWarning?: string }> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('app_role,municipality_id,is_active')
    .eq('id', user.id)
    .single()
  if (profileError) throw profileError
  if (!profile.is_active || profile.app_role !== 'citizen' || !profile.municipality_id) {
    throw new Error('An active citizen profile with a municipality is required to submit reports.')
  }

  const { data: inserted, error: insertError } = await client
    .from('reports')
    .insert({
      reference_number: generateReferenceNumber(),
      user_id: user.id,
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      priority: draft.priority,
      latitude: draft.latitude.trim() ? Number(draft.latitude) : null,
      longitude: draft.longitude.trim() ? Number(draft.longitude) : null,
      location_description: draft.locationDescription.trim(),
      municipality_id: profile.municipality_id,
    })
    .select('id,reference_number,user_id,title,description,category,status,priority,latitude,longitude,location_description,assigned_to,created_at,updated_at,resolved_at')
    .single()
  if (insertError) throw insertError

  let imageUrl: string | undefined
  let attachmentWarning: string | undefined
  if (imageFile) {
    const extension = imageFile.type === 'image/jpeg' ? 'jpg' : imageFile.type.slice('image/'.length)
    const path = `${user.id}/${inserted.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await client.storage.from('report-attachments').upload(path, imageFile, {
      contentType: imageFile.type,
      upsert: false,
    })
    if (uploadError) {
      attachmentWarning = `Your report was saved, but its photo could not be uploaded: ${uploadError.message}`
    } else {
      const { error: attachmentError } = await client.from('report_attachments').insert({
        report_id: inserted.id,
        uploaded_by: user.id,
        storage_path: path,
        file_type: imageFile.type,
      })
      if (attachmentError) {
        const { error: cleanupError } = await client.storage.from('report-attachments').remove([path])
        attachmentWarning = cleanupError
          ? `Your report was saved, but its photo could not be linked or removed: ${attachmentError.message}; ${cleanupError.message}`
          : `Your report was saved, but its photo could not be linked: ${attachmentError.message}`
      } else {
        const { data: signedUrl, error: signedUrlError } = await client.storage.from('report-attachments').createSignedUrl(path, 3600)
        if (signedUrlError) {
          attachmentWarning = `Your report and photo were saved, but the preview could not be loaded: ${signedUrlError.message}`
        } else {
          imageUrl = signedUrl.signedUrl
        }
      }
    }
  }

  const report: Report = {
    id: inserted.id,
    referenceNumber: inserted.reference_number,
    userId: inserted.user_id,
    title: inserted.title,
    description: inserted.description,
    category: inserted.category,
    status: inserted.status,
    priority: inserted.priority,
    latitude: inserted.latitude,
    longitude: inserted.longitude,
    locationDescription: inserted.location_description ?? '',
    community: inserted.location_description ?? 'Local community',
    assignedTo: inserted.assigned_to ?? 'Unassigned',
    createdAt: inserted.created_at,
    updatedAt: inserted.updated_at,
    resolvedAt: inserted.resolved_at ?? undefined,
    reporterDisplayName: 'You',
    statusHistory: [{
      id: `initial-${inserted.id}`,
      previousStatus: inserted.status,
      newStatus: inserted.status,
      changedBy: 'You',
      note: 'Report submitted.',
      createdAt: inserted.created_at,
    }],
    supportCount: 0,
    commentCount: 0,
    imageUrl,
  }
  return { report, attachmentWarning }
}

export async function loadNotifications(client: SupabaseClient): Promise<CivicNotification[]> {
  const { data, error } = await client.from('user_notifications')
    .select('id,report_id,message,created_at,read_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    reportId: row.report_id,
    message: row.message,
    createdAt: row.created_at,
    readAt: row.read_at,
  }))
}

export type CommunityAction = 'support' | 'bookmark' | 'follow' | 'flag'

export async function toggleCommunityAction(
  client: SupabaseClient,
  action: CommunityAction,
  userId: string,
  reportId: string,
  enabled: boolean,
) {
  const table = {
    support: 'report_supports',
    bookmark: 'report_bookmarks',
    follow: 'report_follows',
    flag: 'report_flags',
  }[action]
  if (action === 'flag') {
    const { error } = await client.from(table).insert({ report_id: reportId, user_id: userId })
    if (error) throw error
    return
  }
  if (enabled) {
    const { error } = await client.from(table).insert({ report_id: reportId, user_id: userId })
    if (error) throw error
    return
  }
  const { error } = await client.from(table).delete().eq('report_id', reportId).eq('user_id', userId)
  if (error) throw error
}

export async function addReportComment(client: SupabaseClient, userId: string, reportId: string, body: string) {
  const { error } = await client.from('report_comments').insert({
    report_id: reportId,
    user_id: userId,
    body: body.trim(),
  })
  if (error) throw error
}

export async function markNotificationRead(client: SupabaseClient, notificationId: string) {
  const { error } = await client.from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
  if (error) throw error
}
