-- Migration 007: fix report_completion_submissions RLS column visibility
-- and raise storage size limits for report-attachments and avatars.
--
-- Root cause: the RLS SELECT policy on report_completion_submissions references
-- the `worker_id` column to enforce row-level access, but the GRANT statement
-- in migration 004 omitted `worker_id` from the permitted columns for the
-- `authenticated` role. PostgreSQL evaluates RLS policies using the calling
-- role's privileges, so when any authenticated user triggers a query that
-- internally touches this table (e.g. via the engagement-counts RPC or a join),
-- the column-level privilege check fails with "permission denied", crashing
-- the entire community-data load and causing reports to appear to disappear.

begin;

-- 1. Grant visibility of worker_id so the RLS policy can evaluate correctly.
--    Citizens will still only see resolved rows for their own reports because
--    the existing RLS policy enforces that; the column grant alone does not
--    expose any extra data, it just allows the policy check to run.
grant select (worker_id)
  on public.report_completion_submissions to authenticated;

-- 2. Raise the report-attachments bucket limit from 2 MB to 10 MB so that
--    typical smartphone photos can be uploaded without rejection.
update storage.buckets
set file_size_limit = 10485760           -- 10 MiB
where id = 'report-attachments';

-- 3. Raise the avatars bucket limit from 2 MB to 10 MB for the same reason.
update storage.buckets
set file_size_limit = 10485760           -- 10 MiB
where id = 'avatars';

commit;
