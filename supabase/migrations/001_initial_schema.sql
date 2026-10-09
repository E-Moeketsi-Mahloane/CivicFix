create extension if not exists pgcrypto;

create type report_category as enum (
  'Water & Sewage',
  'Roads & Potholes',
  'Electricity & Streetlights',
  'Waste Management',
  'Public Infrastructure',
  'Other'
);

create type report_status as enum (
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected'
);

create type priority_level as enum ('Low', 'Medium', 'High', 'Critical');
create type user_role as enum ('resident', 'admin');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'resident',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category report_category not null,
  status report_status not null default 'Submitted',
  priority priority_level not null default 'Medium',
  latitude double precision,
  longitude double precision,
  location_description text,
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  uploaded_by uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  file_type text not null,
  created_at timestamptz not null default now()
);

create table report_status_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  previous_status report_status,
  new_status report_status not null,
  changed_by uuid not null references profiles(id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);

create table report_assignments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  assigned_to text not null,
  assigned_by uuid not null references profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table report_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index idx_reports_status on reports(status);
create index idx_reports_category on reports(category);
create index idx_reports_user on reports(user_id);
create index idx_reports_location on reports(latitude, longitude);
create index idx_history_report on report_status_history(report_id);

alter table profiles enable row level security;
alter table reports enable row level security;
alter table report_attachments enable row level security;
alter table report_status_history enable row level security;
alter table report_assignments enable row level security;
alter table report_feedback enable row level security;

create policy "Residents can read their own profile"
  on profiles for select using (auth.uid() = id);

create policy "Residents can update their own profile"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Residents can create their own reports"
  on reports for insert with check (auth.uid() = user_id);

create policy "Residents can update their own reports"
  on reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Residents can view their own reports"
  on reports for select using (auth.uid() = user_id);

create policy "Public report visibility"
  on reports for select using (
    auth.uid() is not null and status in ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved')
  );

create policy "Only admins can modify admin-only fields"
  on reports for update using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Residents can manage their own attachments"
  on report_attachments for select using (
    auth.uid() = uploaded_by or exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Residents can add their own attachments"
  on report_attachments for insert with check (auth.uid() = uploaded_by);

create policy "Admins can manage status history"
  on report_status_history for all using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  ) with check (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can manage assignments"
  on report_assignments for all using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  ) with check (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Residents can submit feedback for resolved issues"
  on report_feedback for insert with check (auth.uid() = user_id);

create policy "Residents can view feedback for their reports"
  on report_feedback for select using (
    auth.uid() = user_id or exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Resident User'), new.email, 'resident')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
