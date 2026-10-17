-- Create these Auth users first in Supabase Dashboard > Authentication > Users.
-- Use email addresses you control and set/confirm their passwords in the dashboard.
-- Replace the two example addresses below with the exact worker and supervisor emails.
--
-- This script provisions existing Auth-backed profiles for the Emfuleni test setup.
-- "Supervisor" is represented by the application's municipal_admin role.
-- Do not use these demo staff accounts with production data.

begin;

do $$
declare
  v_worker_id uuid;
  v_supervisor_id uuid;
  v_municipality_id uuid;
  v_team_id uuid;
begin
  select id into v_worker_id
  from auth.users
  where lower(email) = lower('demo-worker@example.com');
  if v_worker_id is null then
    raise exception 'No Auth user found for demo-worker@example.com. Create the worker user in Supabase Authentication > Users, then replace the example email in this script.';
  end if;

  select id into v_supervisor_id
  from auth.users
  where lower(email) = lower('demo-supervisor@example.com');
  if v_supervisor_id is null then
    raise exception 'No Auth user found for demo-supervisor@example.com. Create the supervisor user in Supabase Authentication > Users, then replace the example email in this script.';
  end if;

  select id into v_municipality_id
  from public.municipalities
  where code = 'ZA-GP-EMFULENI'
    and is_active;
  if v_municipality_id is null then
    raise exception 'Active Emfuleni municipality ZA-GP-EMFULENI was not found. Check the municipality seed.';
  end if;

  select id into v_team_id
  from public.municipal_teams
  where municipality_id = v_municipality_id
    and name = 'Water and Sanitation'
    and is_active;
  if v_team_id is null then
    raise exception 'Active Water and Sanitation team was not found for Emfuleni. Check the team seed.';
  end if;

  perform public.provision_municipal_account(
    v_worker_id,
    'municipal_worker',
    v_municipality_id,
    v_team_id
  );

  perform public.provision_municipal_account(
    v_supervisor_id,
    'municipal_admin',
    v_municipality_id,
    null
  );
end;
$$;

commit;
