create table public.municipalities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  province text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, province)
);

create table public.municipal_teams (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  name text not null,
  department text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (municipality_id, name)
);

alter table public.profiles
  add column app_role text not null default 'citizen'
    check (app_role in ('citizen', 'municipal_worker', 'municipal_admin')),
  add column municipality_id uuid references public.municipalities(id) on delete restrict,
  add column team_id uuid references public.municipal_teams(id) on delete set null,
  add column phone_number text,
  add column province text,
  add column ward text,
  add column suburb_or_township text,
  add column is_active boolean not null default true;

alter table public.profiles
  add constraint profiles_phone_number_length
    check (phone_number is null or length(trim(phone_number)) <= 30),
  add constraint profiles_province_allowed
    check (province is null or province in (
      'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
      'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
    )),
  add constraint profiles_ward_length
    check (ward is null or length(trim(ward)) <= 50),
  add constraint profiles_suburb_length
    check (suburb_or_township is null or length(trim(suburb_or_township)) <= 120);

alter table public.reports
  add column municipality_id uuid references public.municipalities(id) on delete restrict,
  add column assigned_worker_id uuid references public.profiles(id) on delete set null,
  add column assigned_team_id uuid references public.municipal_teams(id) on delete set null,
  add column public_update text
    check (public_update is null or length(trim(public_update)) <= 500);

alter table public.report_assignments
  add column assigned_worker_id uuid references public.profiles(id) on delete set null,
  add column team_id uuid references public.municipal_teams(id) on delete set null,
  add column ended_at timestamptz,
  add column assignment_status text not null default 'assigned'
    check (assignment_status in ('assigned', 'acknowledged', 'completed', 'cancelled'));

alter table public.report_status_history
  add column public_update text
    check (public_update is null or length(trim(public_update)) <= 500);

create table public.report_internal_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.report_completion_submissions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete restrict,
  completion_notes text not null check (length(trim(completion_notes)) between 1 and 3000),
  evidence_storage_paths text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text
);

create table public.report_audit_events (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  report_id uuid references public.reports(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_profiles_role_municipality
  on public.profiles (app_role, municipality_id, team_id)
  where is_active;
create index idx_teams_municipality
  on public.municipal_teams (municipality_id, is_active);
create index idx_reports_municipality_status
  on public.reports (municipality_id, status, created_at desc);
create index idx_assignments_worker_current
  on public.report_assignments (assigned_worker_id, report_id)
  where ended_at is null;
create index idx_assignments_team_current
  on public.report_assignments (team_id, report_id)
  where ended_at is null;
create index idx_internal_notes_report
  on public.report_internal_notes (report_id, created_at desc);
create index idx_completion_submissions_report
  on public.report_completion_submissions (report_id, submitted_at desc);
create index idx_audit_municipality_created
  on public.report_audit_events (municipality_id, created_at desc);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.app_role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
$$;

create or replace function public.current_municipality_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.municipality_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
$$;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.team_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
$$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.current_municipality_id() from public, anon;
revoke all on function public.current_team_id() from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_municipality_id() to authenticated;
grant execute on function public.current_team_id() to authenticated;

create or replace function public.protect_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.app_role is distinct from old.app_role
      or new.is_active is distinct from old.is_active
      or new.team_id is distinct from old.team_id
      or (
        old.app_role <> 'citizen'
        and new.municipality_id is distinct from old.municipality_id
      ) then
      raise exception 'Account role, activation, team and staff municipality are managed by authorised provisioning';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_authority
  before update on public.profiles
  for each row execute function public.protect_profile_authority();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, app_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Resident User'),
    new.email,
    'resident',
    'citizen'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop policy if exists "Residents can read their own profile" on public.profiles;
drop policy if exists "Residents can update their own profile" on public.profiles;
drop policy if exists "Residents can create their own reports" on public.reports;
drop policy if exists "Residents can update their own reports" on public.reports;
drop policy if exists "Residents can view their own reports" on public.reports;
drop policy if exists "Public report visibility" on public.reports;
drop policy if exists "Only admins can modify admin-only fields" on public.reports;
drop policy if exists "Residents can manage their own attachments" on public.report_attachments;
drop policy if exists "Residents can add their own attachments" on public.report_attachments;
drop policy if exists "Admins can manage status history" on public.report_status_history;
drop policy if exists "Admins can manage assignments" on public.report_assignments;
drop policy if exists "Residents can submit feedback for resolved issues" on public.report_feedback;
drop policy if exists "Residents can view feedback for their reports" on public.report_feedback;

alter table public.municipalities enable row level security;
alter table public.municipal_teams enable row level security;
alter table public.report_internal_notes enable row level security;
alter table public.report_completion_submissions enable row level security;
alter table public.report_audit_events enable row level security;

revoke all on public.profiles, public.reports, public.report_attachments,
  public.report_status_history, public.report_assignments, public.report_feedback,
  public.municipalities, public.municipal_teams, public.report_internal_notes,
  public.report_completion_submissions, public.report_audit_events
  from anon, authenticated;

create policy "Active municipalities are visible to signed-in users"
  on public.municipalities for select to authenticated
  using (is_active);

create policy "Users can read teams in their municipality"
  on public.municipal_teams for select to authenticated
  using (
    is_active
    and municipality_id = (select public.current_municipality_id())
  );

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users can update permitted profile fields"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()) and is_active);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone_number, province, municipality_id, ward, suburb_or_township, updated_at)
  on public.profiles to authenticated;
grant select on public.municipalities, public.municipal_teams to authenticated;

create policy "Users can read public or owned reports"
  on public.reports for select to authenticated
  using (
    (select public.current_app_role()) is not null
    and (
      user_id = (select auth.uid())
      or status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved')
      or (
        municipality_id = (select public.current_municipality_id())
        and (select public.current_app_role()) = 'municipal_admin'
      )
      or (
        (select public.current_app_role()) = 'municipal_worker'
        and (
          assigned_worker_id = (select auth.uid())
          or assigned_team_id = (select public.current_team_id())
        )
      )
    )
  );

create policy "Citizens can submit reports for their own municipality"
  on public.reports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_app_role()) = 'citizen'
    and municipality_id = (select public.current_municipality_id())
    and status = 'Submitted'
    and assigned_worker_id is null
    and assigned_team_id is null
    and assigned_to is null
  );

grant select on public.reports to authenticated;
grant insert (
  reference_number, user_id, title, description, category, priority,
  latitude, longitude, location_description, municipality_id
) on public.reports to authenticated;

create policy "Assigned staff and municipal admins can read assignments"
  on public.report_assignments for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
        and r.municipality_id = (select public.current_municipality_id())
        and (
          (select public.current_app_role()) = 'municipal_admin'
          or (
            (select public.current_app_role()) = 'municipal_worker'
            and (
              report_assignments.assigned_worker_id = (select auth.uid())
              or report_assignments.team_id = (select public.current_team_id())
            )
          )
        )
      )
  );

grant select on public.report_assignments to authenticated;

create policy "Report parties can read public status history"
  on public.report_status_history for select to authenticated
  using (
    (select public.current_app_role()) is not null
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and (
          r.user_id = (select auth.uid())
          or r.status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Action', 'Pending Completion Review', 'Resolved')
          or (
            (select public.current_app_role()) = 'municipal_admin'
            and r.municipality_id = (select public.current_municipality_id())
          )
          or r.assigned_worker_id = (select auth.uid())
          or r.assigned_team_id = (select public.current_team_id())
        )
    )
  );

grant select on public.report_status_history to authenticated;
revoke all on public.report_status_history from anon, authenticated;
grant select (id, report_id, previous_status, new_status, changed_by, public_update, created_at)
  on public.report_status_history to authenticated;

create policy "Assigned staff and municipal admins can read internal notes"
  on public.report_internal_notes for select to authenticated
  using (
    (select public.current_app_role()) in ('municipal_worker', 'municipal_admin')
    and exists (
      select 1 from public.reports r
      where r.id = report_id
        and r.municipality_id = (select public.current_municipality_id())
        and (
          (select public.current_app_role()) = 'municipal_admin'
          or r.assigned_worker_id = (select auth.uid())
          or r.assigned_team_id = (select public.current_team_id())
        )
    )
  );

grant select on public.report_internal_notes to authenticated;

create policy "Assigned workers and municipal admins can read completion submissions"
  on public.report_completion_submissions for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
        and (
          (
            (select public.current_app_role()) = 'citizen'
            and r.user_id = (select auth.uid())
            and r.status = 'Resolved'
          )
          or (
            r.municipality_id = (select public.current_municipality_id())
            and (
              (select public.current_app_role()) = 'municipal_admin'
              or (
                (select public.current_app_role()) = 'municipal_worker'
                and (
                  worker_id = (select auth.uid())
                  or r.assigned_worker_id = (select auth.uid())
                  or r.assigned_team_id = (select public.current_team_id())
                )
              )
            )
          )
        )
    )
  );

grant select (
  id, report_id, completion_notes, evidence_storage_paths, submitted_at, reviewed_at
) on public.report_completion_submissions to authenticated;

create policy "Municipal admins can read their municipality audit events"
  on public.report_audit_events for select to authenticated
  using (
    (select public.current_app_role()) = 'municipal_admin'
    and municipality_id = (select public.current_municipality_id())
  );

grant select on public.report_audit_events to authenticated;

create or replace function public.list_municipal_workers()
returns table (
  worker_id uuid,
  full_name text,
  team_id uuid,
  team_name text,
  department text,
  active_assignments bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) <> 'municipal_admin' then
    raise exception 'Only municipal administrators can view their worker directory';
  end if;

  return query
  select p.id, p.full_name, p.team_id, t.name, t.department,
    (
      select count(*)
      from public.report_assignments a
      where a.assigned_worker_id = p.id
        and a.ended_at is null
        and a.assignment_status in ('assigned', 'acknowledged')
    )
  from public.profiles p
  left join public.municipal_teams t on t.id = p.team_id
  where p.app_role = 'municipal_worker'
    and p.is_active
    and p.municipality_id = (select public.current_municipality_id())
  order by p.full_name;
end;
$$;

revoke all on function public.list_municipal_workers() from public, anon;
grant execute on function public.list_municipal_workers() to authenticated;

create or replace function public.record_initial_report_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.report_status_history (
    report_id, previous_status, new_status, changed_by, public_update
  )
  values (new.id, null, new.status, new.user_id, 'Report submitted.');
  return new;
end;
$$;

create trigger civicfix_record_initial_report_status
  after insert on public.reports
  for each row execute function public.record_initial_report_status();

create or replace function public.provision_municipal_account(
  p_user_id uuid,
  p_role text,
  p_municipality_id uuid,
  p_team_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Municipal account provisioning is restricted to trusted server-side operations';
  end if;
  if p_role is null or p_role not in ('municipal_worker', 'municipal_admin') then
    raise exception 'Only municipal worker or municipal administrator accounts can be provisioned here';
  end if;
  if not exists (
    select 1 from public.municipalities m
    where m.id = p_municipality_id and m.is_active
  ) then
    raise exception 'An active municipality is required';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.municipal_teams t
    where t.id = p_team_id and t.municipality_id = p_municipality_id and t.is_active
  ) then
    raise exception 'The team must be active and belong to the selected municipality';
  end if;

  update public.profiles
  set app_role = p_role,
      municipality_id = p_municipality_id,
      team_id = case when p_role = 'municipal_worker' then p_team_id else null end,
      is_active = true,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'The invited authentication user does not have a profile yet';
  end if;

  insert into public.report_audit_events (municipality_id, action, details)
  values (
    p_municipality_id,
    'municipal_account_provisioned',
    jsonb_build_object('user_id', p_user_id, 'role', p_role, 'team_id', p_team_id)
  );
end;
$$;

revoke all on function public.provision_municipal_account(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.provision_municipal_account(uuid, text, uuid, uuid) to service_role;

create or replace function public.set_municipal_account_active(
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_municipality_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Municipal account administration is restricted to trusted operations';
  end if;

  update public.profiles
  set is_active = p_is_active, updated_at = now()
  where id = p_user_id
    and app_role in ('municipal_worker', 'municipal_admin')
  returning municipality_id into v_municipality_id;
  if not found then
    raise exception 'Active municipal staff profile not found';
  end if;

  insert into public.report_audit_events (municipality_id, action, details)
  values (
    v_municipality_id,
    case when p_is_active then 'municipal_account_activated' else 'municipal_account_deactivated' end,
    jsonb_build_object('user_id', p_user_id)
  );
end;
$$;

revoke all on function public.set_municipal_account_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_municipal_account_active(uuid, boolean) to service_role;

create or replace function public.assign_civic_report(
  p_report_id uuid,
  p_worker_id uuid default null,
  p_team_id uuid default null,
  p_public_update text default null,
  p_internal_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_previous_status public.report_status;
  v_assignment_label text;
begin
  if (select public.current_app_role()) <> 'municipal_admin'
    or not exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active
        and p.municipality_id = (select public.current_municipality_id())
    ) then
    raise exception 'Only an active municipal administrator can assign reports';
  end if;
  if p_worker_id is null and p_team_id is null then
    raise exception 'Assign the report to a worker or team';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
    and r.municipality_id = (select public.current_municipality_id())
  for update;
  if not found then
    raise exception 'Report not found in your authorised municipality';
  end if;
  if v_report.status not in ('Under Review', 'Assigned', 'In Progress', 'Awaiting Action') then
    raise exception 'This report cannot be assigned in its current status';
  end if;

  if p_worker_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_worker_id
      and p.app_role = 'municipal_worker'
      and p.is_active
      and p.municipality_id = v_report.municipality_id
      and (p_team_id is null or p.team_id = p_team_id)
  ) then
    raise exception 'The worker is inactive, unauthorised, or not a member of the selected team';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.municipal_teams t
    where t.id = p_team_id and t.municipality_id = v_report.municipality_id and t.is_active
  ) then
    raise exception 'The team is inactive or belongs to another municipality';
  end if;

  v_previous_status := v_report.status;
  v_assignment_label := coalesce(
    (select p.full_name from public.profiles p where p.id = p_worker_id),
    (select t.name from public.municipal_teams t where t.id = p_team_id)
  );

  update public.report_assignments
  set ended_at = now(), assignment_status = 'cancelled', updated_at = now()
  where report_id = p_report_id and ended_at is null;

  insert into public.report_assignments (
    report_id, assigned_to, assigned_by, assigned_worker_id, team_id
  )
  values (p_report_id, v_assignment_label, (select auth.uid()), p_worker_id, p_team_id);

  update public.reports
  set status = 'Assigned',
      assigned_to = v_assignment_label,
      assigned_worker_id = p_worker_id,
      assigned_team_id = p_team_id,
      public_update = nullif(trim(p_public_update), ''),
      updated_at = now()
  where id = p_report_id;

  insert into public.report_status_history (
    report_id, previous_status, new_status, changed_by, note, public_update
  )
  values (p_report_id, v_previous_status, 'Assigned', (select auth.uid()), null, nullif(trim(p_public_update), ''));

  if nullif(trim(p_internal_note), '') is not null then
    insert into public.report_internal_notes (report_id, author_id, body)
    values (p_report_id, (select auth.uid()), trim(p_internal_note));
  end if;

  insert into public.report_audit_events (municipality_id, report_id, actor_id, action, details)
  values (
    v_report.municipality_id,
    p_report_id,
    (select auth.uid()),
    'report_assigned',
    jsonb_build_object('worker_id', p_worker_id, 'team_id', p_team_id)
  );
end;
$$;

create or replace function public.review_civic_report(
  p_report_id uuid,
  p_reject boolean,
  p_public_update text,
  p_internal_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_next_status public.report_status;
begin
  if (select public.current_app_role()) <> 'municipal_admin' then
    raise exception 'Only a municipal administrator can review reports';
  end if;
  if p_reject is null then
    raise exception 'Choose whether to approve or reject the report';
  end if;
  if p_reject and nullif(trim(p_public_update), '') is null then
    raise exception 'Provide a public explanation when rejecting a report';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
    and r.municipality_id = (select public.current_municipality_id())
  for update;
  if not found or v_report.status <> 'Submitted' then
    raise exception 'Only a submitted report in your municipality can be reviewed';
  end if;

  v_next_status := case when p_reject then 'Rejected'::public.report_status else 'Under Review'::public.report_status end;
  update public.reports
  set status = v_next_status,
      public_update = nullif(trim(p_public_update), ''),
      updated_at = now()
  where id = p_report_id;

  insert into public.report_status_history (
    report_id, previous_status, new_status, changed_by, public_update
  )
  values (p_report_id, v_report.status, v_next_status, (select auth.uid()), nullif(trim(p_public_update), ''));

  if nullif(trim(p_internal_note), '') is not null then
    insert into public.report_internal_notes (report_id, author_id, body)
    values (p_report_id, (select auth.uid()), trim(p_internal_note));
  end if;

  insert into public.report_audit_events (municipality_id, report_id, actor_id, action)
  values (v_report.municipality_id, p_report_id, (select auth.uid()), case when p_reject then 'report_rejected' else 'report_reviewed' end);
end;
$$;

create or replace function public.worker_update_civic_report(
  p_report_id uuid,
  p_new_status public.report_status,
  p_public_update text default null,
  p_internal_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
begin
  if (select public.current_app_role()) <> 'municipal_worker' then
    raise exception 'Only municipal workers can update assigned work';
  end if;
  if p_new_status not in ('In Progress', 'Awaiting Action') then
    raise exception 'Workers may record progress or blockers; completion must be submitted for review';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
    and r.municipality_id = (select public.current_municipality_id())
    and (
      r.assigned_worker_id = (select auth.uid())
      or r.assigned_team_id = (select public.current_team_id())
    )
  for update;
  if not found or v_report.status not in ('Assigned', 'In Progress', 'Awaiting Action') then
    raise exception 'This report is not assigned to you or your authorised team';
  end if;

  update public.report_assignments
  set assignment_status = 'acknowledged', updated_at = now()
  where report_id = p_report_id and ended_at is null
    and (assigned_worker_id = (select auth.uid()) or team_id = (select public.current_team_id()));

  update public.reports
  set status = p_new_status,
      public_update = nullif(trim(p_public_update), ''),
      updated_at = now()
  where id = p_report_id;

  insert into public.report_status_history (
    report_id, previous_status, new_status, changed_by, public_update
  )
  values (p_report_id, v_report.status, p_new_status, (select auth.uid()), nullif(trim(p_public_update), ''));

  if nullif(trim(p_internal_note), '') is not null then
    insert into public.report_internal_notes (report_id, author_id, body)
    values (p_report_id, (select auth.uid()), trim(p_internal_note));
  end if;

  insert into public.report_audit_events (municipality_id, report_id, actor_id, action)
  values (v_report.municipality_id, p_report_id, (select auth.uid()), case when p_new_status = 'Awaiting Action' then 'work_blocked' else 'work_progressed' end);
end;
$$;

create or replace function public.submit_civic_completion(
  p_report_id uuid,
  p_completion_notes text,
  p_evidence_storage_paths text[] default '{}',
  p_public_update text default null,
  p_internal_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_submission_id uuid;
begin
  if (select public.current_app_role()) <> 'municipal_worker'
    or nullif(trim(p_completion_notes), '') is null then
    raise exception 'An authorised worker and completion notes are required';
  end if;

  select * into v_report
  from public.reports r
  where r.id = p_report_id
    and r.municipality_id = (select public.current_municipality_id())
    and (
      r.assigned_worker_id = (select auth.uid())
      or r.assigned_team_id = (select public.current_team_id())
    )
    and r.status in ('Assigned', 'In Progress', 'Awaiting Action')
  for update;
  if not found then
    raise exception 'This report is not assigned to you or your authorised team';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_evidence_storage_paths, '{}')) as evidence_path(path)
    where split_part(evidence_path.path, '/', 1) <> (select auth.uid())::text
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'work-evidence'
          and o.name = evidence_path.path
          and split_part(o.name, '/', 2) = p_report_id::text
      )
  ) then
    raise exception 'Completion evidence must exist in your private folder for this report';
  end if;

  insert into public.report_completion_submissions (
    report_id, worker_id, completion_notes, evidence_storage_paths
  )
  values (p_report_id, (select auth.uid()), trim(p_completion_notes), coalesce(p_evidence_storage_paths, '{}'))
  returning id into v_submission_id;

  update public.report_assignments
  set assignment_status = 'completed', ended_at = now(), updated_at = now()
  where report_id = p_report_id and ended_at is null
    and (assigned_worker_id = (select auth.uid()) or team_id = (select public.current_team_id()));
  update public.reports
  set status = 'Pending Completion Review',
      public_update = nullif(trim(p_public_update), ''),
      updated_at = now()
  where id = p_report_id;

  insert into public.report_status_history (
    report_id, previous_status, new_status, changed_by, public_update
  )
  values (p_report_id, v_report.status, 'Pending Completion Review', (select auth.uid()), nullif(trim(p_public_update), ''));
  if nullif(trim(p_internal_note), '') is not null then
    insert into public.report_internal_notes (report_id, author_id, body)
    values (p_report_id, (select auth.uid()), trim(p_internal_note));
  end if;
  insert into public.report_audit_events (municipality_id, report_id, actor_id, action, details)
  values (v_report.municipality_id, p_report_id, (select auth.uid()), 'completion_submitted', jsonb_build_object('submission_id', v_submission_id));
  return v_submission_id;
end;
$$;

create or replace function public.review_civic_completion(
  p_submission_id uuid,
  p_approve boolean,
  p_public_update text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.report_completion_submissions%rowtype;
  v_report public.reports%rowtype;
  v_next_status public.report_status;
begin
  if (select public.current_app_role()) <> 'municipal_admin' then
    raise exception 'Only a municipal administrator can review completion';
  end if;
  if p_approve is null then
    raise exception 'Choose whether to approve or return the completion';
  end if;
  if not p_approve and nullif(trim(p_review_note), '') is null then
    raise exception 'Explain what further work is required';
  end if;

  select * into v_submission
  from public.report_completion_submissions s
  where s.id = p_submission_id
  for update;
  if not found then
    raise exception 'Completion submission not found';
  end if;

  select * into v_report
  from public.reports r
  where r.id = v_submission.report_id
    and r.municipality_id = (select public.current_municipality_id())
    and r.status = 'Pending Completion Review'
  for update;
  if not found or v_submission.reviewed_at is not null then
    raise exception 'No pending completion review exists in your municipality';
  end if;

  v_next_status := case when p_approve then 'Resolved'::public.report_status else 'In Progress'::public.report_status end;
  update public.report_completion_submissions
  set reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(trim(p_review_note), '')
  where id = p_submission_id;
  update public.reports
  set status = v_next_status,
      resolved_at = case when p_approve then now() else null end,
      public_update = nullif(trim(p_public_update), ''),
      updated_at = now()
  where id = v_report.id;
  if not p_approve then
    update public.report_assignments
    set assignment_status = 'acknowledged', ended_at = null, updated_at = now()
    where id = (
      select a.id
      from public.report_assignments a
      where a.report_id = v_report.id
      order by a.assigned_at desc
      limit 1
    );
  end if;

  insert into public.report_status_history (
    report_id, previous_status, new_status, changed_by, public_update
  )
  values (v_report.id, v_report.status, v_next_status, (select auth.uid()), nullif(trim(p_public_update), ''));
  if nullif(trim(p_review_note), '') is not null then
    insert into public.report_internal_notes (report_id, author_id, body)
    values (v_report.id, (select auth.uid()), trim(p_review_note));
  end if;
  insert into public.report_audit_events (municipality_id, report_id, actor_id, action, details)
  values (
    v_report.municipality_id, v_report.id, (select auth.uid()),
    case when p_approve then 'completion_approved' else 'completion_returned' end,
    jsonb_build_object('submission_id', p_submission_id)
  );
end;
$$;

revoke all on function public.assign_civic_report(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.review_civic_report(uuid, boolean, text, text) from public, anon;
revoke all on function public.worker_update_civic_report(uuid, public.report_status, text, text) from public, anon;
revoke all on function public.submit_civic_completion(uuid, text, text[], text, text) from public, anon;
revoke all on function public.review_civic_completion(uuid, boolean, text, text) from public, anon;
grant execute on function public.assign_civic_report(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.review_civic_report(uuid, boolean, text, text) to authenticated;
grant execute on function public.worker_update_civic_report(uuid, public.report_status, text, text) to authenticated;
grant execute on function public.submit_civic_completion(uuid, text, text[], text, text) to authenticated;
grant execute on function public.review_civic_completion(uuid, boolean, text, text) to authenticated;
