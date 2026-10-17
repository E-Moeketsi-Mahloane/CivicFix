insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-evidence', 'work-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Assigned workers can upload report evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'work-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select public.current_app_role()) = 'municipal_worker'
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.municipality_id = (select public.current_municipality_id())
        and (
          r.assigned_worker_id = (select auth.uid())
          or r.assigned_team_id = (select public.current_team_id())
        )
    )
  );

create policy "Authorised report parties can view report evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'work-evidence'
    and exists (
      select 1
      from public.report_completion_submissions s
      join public.reports r on r.id = s.report_id
      where (s.evidence_storage_paths @> array[name])
        and (
          (
            (select public.current_app_role()) = 'citizen'
            and r.status = 'Resolved'
            and r.user_id = (select auth.uid())
          )
          or (
            (select public.current_app_role()) = 'municipal_worker'
            and r.municipality_id = (select public.current_municipality_id())
            and (
              s.worker_id = (select auth.uid())
              or
              r.assigned_worker_id = (select auth.uid())
              or r.assigned_team_id = (select public.current_team_id())
            )
          )
          or (
            (select public.current_app_role()) = 'municipal_admin'
            and r.municipality_id = (select public.current_municipality_id())
          )
        )
    )
  );

create policy "Assigned workers can remove unsubmitted report evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'work-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select public.current_app_role()) = 'municipal_worker'
    and not exists (
      select 1
      from public.report_completion_submissions s
      where s.evidence_storage_paths @> array[name]
    )
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.municipality_id = (select public.current_municipality_id())
        and (
          r.assigned_worker_id = (select auth.uid())
          or r.assigned_team_id = (select public.current_team_id())
        )
    )
  );
