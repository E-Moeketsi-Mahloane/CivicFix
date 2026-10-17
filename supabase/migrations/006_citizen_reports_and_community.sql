begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-attachments', 'report-attachments', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.report_supports (
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table public.report_bookmarks (
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table public.report_follows (
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.report_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (reason is null or length(trim(reason)) <= 500),
  created_at timestamptz not null default now(),
  unique (report_id, user_id)
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.reports(id) on delete cascade,
  notification_type text not null check (notification_type in ('report_status')),
  message text not null check (length(trim(message)) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_report_comments_report_created
  on public.report_comments (report_id, created_at);
create index idx_report_supports_report
  on public.report_supports (report_id);
create index idx_report_bookmarks_user_created
  on public.report_bookmarks (user_id, created_at desc);
create index idx_report_follows_user_created
  on public.report_follows (user_id, created_at desc);
create index idx_report_flags_moderation
  on public.report_flags (report_id, created_at desc);
create index idx_user_notifications_recipient_created
  on public.user_notifications (recipient_id, created_at desc);

alter table public.report_supports enable row level security;
alter table public.report_bookmarks enable row level security;
alter table public.report_follows enable row level security;
alter table public.report_comments enable row level security;
alter table public.report_flags enable row level security;
alter table public.user_notifications enable row level security;

revoke all on public.report_attachments, public.report_supports, public.report_bookmarks,
  public.report_follows, public.report_comments, public.report_flags, public.user_notifications
  from anon, authenticated;

create policy "Report parties can read report attachments"
  on public.report_attachments for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
        and (
          r.user_id = (select auth.uid())
          or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved')
          or (
            (select public.current_app_role()) = 'municipal_admin'
            and r.municipality_id = (select public.current_municipality_id())
          )
          or (
            (select public.current_app_role()) = 'municipal_worker'
            and (
              r.assigned_worker_id = (select auth.uid())
              or r.assigned_team_id = (select public.current_team_id())
            )
          )
        )
    )
  );

create policy "Citizens can attach images to their own reports"
  on public.report_attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (select public.current_app_role()) = 'citizen'
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and r.user_id = (select auth.uid())
        and r.status = 'Submitted'
    )
    and storage_path like (select auth.uid())::text || '/' || report_id::text || '/%'
    and file_type in ('image/jpeg', 'image/png', 'image/webp')
  );

grant select (report_id, storage_path)
  on public.report_attachments to authenticated;
grant insert (report_id, uploaded_by, storage_path, file_type)
  on public.report_attachments to authenticated;

create policy "Users can read their own report supports"
  on public.report_supports for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.current_app_role()) is not null
  );
create policy "Citizens can support visible reports"
  on public.report_supports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_app_role()) = 'citizen'
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and (r.user_id = (select auth.uid()) or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved'))
    )
  );
create policy "Citizens can remove their own report support"
  on public.report_supports for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'citizen');
grant select (report_id, user_id, created_at) on public.report_supports to authenticated;
grant insert (report_id, user_id) on public.report_supports to authenticated;
grant delete on public.report_supports to authenticated;

create policy "Users can read their own report bookmarks"
  on public.report_bookmarks for select to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'citizen');
create policy "Citizens can bookmark visible reports"
  on public.report_bookmarks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_app_role()) = 'citizen'
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and (r.user_id = (select auth.uid()) or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved'))
    )
  );
create policy "Users can remove their own report bookmarks"
  on public.report_bookmarks for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'citizen');
grant select (report_id, user_id, created_at) on public.report_bookmarks to authenticated;
grant insert (report_id, user_id) on public.report_bookmarks to authenticated;
grant delete on public.report_bookmarks to authenticated;

create policy "Users can read their own report follows"
  on public.report_follows for select to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'citizen');
create policy "Citizens can follow visible reports"
  on public.report_follows for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_app_role()) = 'citizen'
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and (r.user_id = (select auth.uid()) or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved'))
    )
  );
create policy "Users can unfollow their own reports"
  on public.report_follows for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'citizen');
grant select (report_id, user_id, created_at) on public.report_follows to authenticated;
grant insert (report_id, user_id) on public.report_follows to authenticated;
grant delete on public.report_follows to authenticated;

create policy "Users can read comments on visible reports"
  on public.report_comments for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
        and (
          r.user_id = (select auth.uid())
          or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved')
          or (
            (select public.current_app_role()) = 'municipal_admin'
            and r.municipality_id = (select public.current_municipality_id())
          )
          or (
            (select public.current_app_role()) = 'municipal_worker'
            and (
              r.assigned_worker_id = (select auth.uid())
              or r.assigned_team_id = (select public.current_team_id())
            )
          )
        )
    )
  );
create policy "Citizens can comment on visible reports"
  on public.report_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_app_role()) = 'citizen'
    and length(trim(body)) between 1 and 500
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and (r.user_id = (select auth.uid()) or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved'))
    )
  );
grant select (id, report_id, body, created_at) on public.report_comments to authenticated;
grant insert (report_id, user_id, body) on public.report_comments to authenticated;

create policy "Citizens can flag visible reports once"
  on public.report_flags for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_app_role()) = 'citizen'
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and (r.user_id = (select auth.uid()) or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved'))
    )
  );
create policy "Users can read their own report flags"
  on public.report_flags for select to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'citizen');
create policy "Municipal admins can read flags for their municipality"
  on public.report_flags for select to authenticated
  using (
    (select public.current_app_role()) = 'municipal_admin'
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and r.municipality_id = (select public.current_municipality_id())
    )
  );
grant select (id, report_id, user_id, reason, created_at) on public.report_flags to authenticated;
grant insert (report_id, user_id, reason) on public.report_flags to authenticated;

create policy "Users can read their own notifications"
  on public.user_notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and (select public.current_app_role()) is not null
  );
create policy "Users can mark their own notifications read"
  on public.user_notifications for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and (select public.current_app_role()) is not null
  )
  with check (
    recipient_id = (select auth.uid())
    and (select public.current_app_role()) is not null
  );
grant select (id, recipient_id, report_id, notification_type, message, created_at, read_at)
  on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;

create or replace function public.record_initial_report_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.report_status_history (
    report_id, previous_status, new_status, changed_by, public_update, created_at
  )
  values (
    new.id, null, new.status, new.user_id, 'Report submitted.', new.created_at
  );
  return new;
end;
$$;

revoke all on function public.record_initial_report_status() from public, anon, authenticated;

drop trigger if exists civicfix_record_initial_report_status on public.reports;

create trigger civicfix_record_initial_report_status
  after insert on public.reports
  for each row execute function public.record_initial_report_status();

insert into public.report_status_history (
  report_id, previous_status, new_status, changed_by, public_update, created_at
)
select r.id, null, 'Submitted', r.user_id, 'Report submitted.', r.created_at
from public.reports r
where not exists (
  select 1 from public.report_status_history h where h.report_id = r.id
);

create or replace function public.notify_report_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_message text;
begin
  if new.previous_status is null or new.previous_status = new.new_status then
    return new;
  end if;

  select * into v_report
  from public.reports r
  where r.id = new.report_id;
  if not found then
    return new;
  end if;

  v_message := coalesce(
    nullif(trim(new.public_update), ''),
    'Report ' || v_report.reference_number || ' moved to ' || new.new_status::text || '.'
  );

  insert into public.user_notifications (recipient_id, report_id, notification_type, message)
  select recipients.user_id, new.report_id, 'report_status', v_message
  from (
    select v_report.user_id as user_id
    union
    select f.user_id
    from public.report_follows f
    where f.report_id = new.report_id
  ) recipients
  where recipients.user_id is not null
    and recipients.user_id is distinct from new.changed_by;

  return new;
end;
$$;

drop trigger if exists civicfix_notify_report_status_change on public.report_status_history;

create trigger civicfix_notify_report_status_change
  after insert on public.report_status_history
  for each row execute function public.notify_report_status_change();

revoke all on function public.notify_report_status_change() from public, anon, authenticated;

create policy "Citizens can upload images for their own reports"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.user_id = (select auth.uid())
        and r.status = 'Submitted'
        and (select public.current_app_role()) = 'citizen'
    )
  );

create policy "Users can view images for visible reports"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-attachments'
    and exists (
      select 1
      from public.report_attachments a
      join public.reports r on r.id = a.report_id
      where a.storage_path = name
        and (
          r.user_id = (select auth.uid())
          or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved')
          or (
            (select public.current_app_role()) = 'municipal_admin'
            and r.municipality_id = (select public.current_municipality_id())
          )
          or (
            (select public.current_app_role()) = 'municipal_worker'
            and (
              r.assigned_worker_id = (select auth.uid())
              or r.assigned_team_id = (select public.current_team_id())
            )
          )
        )
    )
  );

create policy "Users can remove unattached images from their own reports"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.report_attachments a
      where a.storage_path = name
    )
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.user_id = (select auth.uid())
        and r.status = 'Submitted'
    )
  );

create or replace function public.get_report_engagement_counts(p_report_ids uuid[])
returns table (report_id uuid, support_count bigint, comment_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
    (select count(*) from public.report_supports s where s.report_id = r.id),
    (select count(*) from public.report_comments c where c.report_id = r.id)
  from public.reports r
  where r.id = any(coalesce(p_report_ids, '{}'))
    and (select public.current_app_role()) is not null
    and (
      r.user_id = (select auth.uid())
      or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved')
      or (
        (select public.current_app_role()) = 'municipal_admin'
        and r.municipality_id = (select public.current_municipality_id())
      )
      or (
        (select public.current_app_role()) = 'municipal_worker'
        and (
          r.assigned_worker_id = (select auth.uid())
          or r.assigned_team_id = (select public.current_team_id())
        )
      )
    );
$$;

revoke all on function public.get_report_engagement_counts(uuid[]) from public, anon;
grant execute on function public.get_report_engagement_counts(uuid[]) to authenticated;

revoke select (changed_by) on public.report_status_history from authenticated;

commit;
