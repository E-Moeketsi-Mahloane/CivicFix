# CivicFix Handoff

**Snapshot:** 17 October 2026  
**Purpose:** Give the next agent a reliable starting point for planning and implementation. Migration 006 execution is user-confirmed; application and RLS behavior still need end-to-end verification.

## Project overview

CivicFix is a React, TypeScript, and Vite community reporting MVP for South African residents. Supabase Auth and database-backed citizen and municipal workflows are being added alongside a demo mode. CivicFix is an independent platform: reports are not automatically sent to a municipality.

## Current progress

### User accounts and profile setup

- Supabase sign-up and login pages are implemented.
- Signed-in users are routed through profile setup before using the main application.
- Profile details are saved to `profiles`. Province and an active municipality are required; phone, ward, suburb/township, and profile image are optional.
- Municipality and team reference data is seeded for Emfuleni Local Municipality. Staff accounts must be provisioned through trusted database operations; there is no staff-provisioning UI.

### Municipal workflows

- The `/municipal` workspace supports provisioned municipal worker/admin accounts, with role, municipality, and team scope enforced by database policy and RPC functions.
- The legacy `/admin` route remains an unprotected demo. It must not be used for real municipal operations.
- Work-completion evidence storage and the workflow/status migrations are present in the repository.

### Citizen reporting and community features

The application code has been connected to Supabase for:

- Report creation and display in the feed, My Reports, map, and report details.
- Optional private report-photo upload and signed photo URLs.
- Comments, support, bookmarks, follows, and flags.
- In-app notifications for report status changes, including marking notifications read.
- Demo-mode behavior when Supabase is not configured.

Migration `006_citizen_reports_and_community.sql` was added for the tables, private storage bucket, RLS policies, engagement-count RPC, initial report history, and status notification trigger that these features need. On 17 October 2026, the user confirmed that the updated migration ran successfully in Supabase after the trigger conflict was fixed.

## Supabase state and important setup constraints

- The user reported applying migrations `001` through `005` and successfully seeding Emfuleni municipality/team data.
- The first attempt at migration `006` failed because `civicfix_record_initial_report_status` already existed on `public.reports`.
- A read-only inventory after that failure showed the six community tables absent (`report_supports`, `report_bookmarks`, `report_follows`, `report_comments`, `report_flags`, `user_notifications`) and revealed that the pre-existing trigger used an older function definition.
- The repository migration was updated to drop and recreate only its two specifically named CivicFix triggers within its transaction. The user confirmed that the updated migration then ran successfully in Supabase.
- Treat migration 006 as applied based on user confirmation, not independently verified by the assistant. SQL Editor success does not prove that application writes, RLS boundaries, Storage access, or notification triggers work as intended.
- The user next tried to prepare test accounts and received `P0002: query returned no rows` at line 8 of the staff provisioning `DO` block. This indicates the provisioning query did not find the worker Auth user under the email in the script; it does not indicate that migration 006 failed. The staff SQL only assigns roles to Auth users that already exist; it does not create login credentials. The script now raises a specific message when the worker/supervisor user, municipality, or team is missing.
- The user then reported creating the accounts and successfully running the staff provisioning SQL. On logging in, they found the profile name displayed as `Resident User` and not editable, and an avatar upload was denied. The profile name field was read-only in the application despite the RLS/grant allowing the owner to update `full_name`; the app now allows editing and saves the name to both the profile and Auth metadata. Avatar denial remains unverified; collect the exact error, which role/account was used, and confirm migration 002 avatar bucket policies exist before changing storage policy.
- The migration has not been validated against a running local PostgreSQL/Supabase instance. `supabase db lint --local --schema public` could not connect to the local database; Docker was not running, and there is no `supabase/config.toml`.
- Never put a Supabase service-role key in browser code or a `VITE_` variable.

## Verification to date

- `npm run build` passed after application integration. Vite emitted a non-blocking large-bundle warning.
- `npm run lint` passed.
- `git diff --check` passed.
- The user confirmed migration 006 completed successfully in Supabase.
- The shared dev-tunnel page was inspected while logged out: the community feed displayed the unauthenticated/login prompt, and direct navigation to `/login` rendered the login form. This does not verify authenticated behavior or database access.
- No authenticated Supabase report, RLS, Storage, notification-trigger, or multi-role integration test has been performed.
- The profile full-name editor fix has been made but not yet validated in the user's browser. Avatar upload still requires diagnosis from its exact Supabase error and a read-only check of the `avatars` bucket/policies.
- Re-run the build, lint, and diff check after further code changes.

## Recommended next steps

### P0 — Run end-to-end smoke tests with the user's accounts

Migration 006 is user-confirmed applied. The user reports that all three Auth accounts were created and the worker/supervisor provisioning script succeeded. They report the profile name is shown as `Resident User` and cannot be edited, and avatar upload returns a permission-denied error. The name field was read-only in the app; a code fix now allows editing and updates the database profile and Auth metadata. First validate this after a refresh/sign-in. For the avatar issue, ask which role/account they used and for the exact UI error. If needed, request a read-only inventory of the `avatars` bucket and policies; do not alter storage permissions without confirming cause. Continue with the report smoke test after account profile setup works.

#### Create three test accounts

These accounts must be created in Supabase Auth so they can log in. Do not insert rows directly into `auth.users`, and do not put passwords in SQL files or chat.

1. In Supabase Dashboard, open **Authentication → Users**.
2. Create a citizen account with an email address you control and a strong test password. If email confirmation is required, confirm the message in that mailbox. The Auth trigger creates the default `citizen` profile. Alternatively, sign up through CivicFix at `/signup`.
3. In the same dashboard, add two more Auth users with email addresses you control: one for the worker and one for the supervisor. Set/confirm their passwords in the dashboard and keep them privately.
4. In the repository file [`supabase/provision_demo_staff.sql`](./supabase/provision_demo_staff.sql), replace `demo-worker@example.com` and `demo-supervisor@example.com` with the exact emails used in Supabase Auth. Save your local copy.
5. In Supabase Dashboard, open **SQL Editor**, paste the edited contents of `supabase/provision_demo_staff.sql`, and run it once. The SQL calls the existing trusted `provision_municipal_account` function. It assigns the worker to Emfuleni's **Water and Sanitation** team and assigns the supervisor the application's `municipal_admin` role. CivicFix has no distinct `supervisor` role.
6. Create both staff Auth users before running the staff provisioning SQL. The script will identify a missing worker/supervisor Auth email or missing municipality/team with a specific error. Do not insert directly into `profiles` or `auth.users`.
7. Log in once as each staff user. Complete the required province/municipality profile setup if prompted. The supervisor role maps to the municipal admin workspace.
8. Use these only as non-production test accounts. Do not share passwords here.

#### Before testing

1. Open the CivicFix app in the browser. The shared development URL at the time this handoff was written is `https://sxvddsh5-5173.uks1.devtunnels.ms/`; if that tunnel changes, use the current app URL instead.
2. Confirm the app is displaying the latest code. If unsure, refresh the page once.
3. Have access to the citizen account just created and completed profile setup. For the status/notification test, also have the worker and supervisor accounts provisioned above. Do not use `/admin` for these tests; that route is a local demo.
4. Use a harmless, unique test issue at a public landmark (not a home address), and do not include real names, phone numbers, private details, or sensitive images. Suggested title prefix: `CivicFix smoke test - <today's date>`.
5. Keep a note of which steps pass. If anything fails, stop that step and capture the error before retrying.

#### Test A — Sign in and create a report

1. Go to `/login` (for example, append `/login` to the app URL).
2. Enter your citizen account email and password in the browser and choose **Log in**. Do not paste your password into chat.
3. If prompted to finish profile setup, enter the required province and choose an active municipality. Save the setup. If there is no municipality option, or profile setup reports an error, stop and report the exact message.
4. Open **Report an issue** from the top navigation.
5. Enter a unique test title, factual description, choose a category and urgency, and enter a public landmark in **Suburb, township or nearby landmark**.
6. Leave latitude and longitude both blank for the first check. They are optional; the landmark itself is required. Do not use your current/home location.
7. Leave the photo blank for this first report, then choose **Submit report**.
8. A successful submission should take you to its detail page and show a reference number/status. Record the reference number, not private profile information.
9. Check the feed, **My reports**, and the report detail page. Then refresh the browser and check again. The report should still appear. Since no coordinates were entered, it need not appear on the map.

#### Test B — Check private photo upload

1. Open **Report an issue** again and create a second uniquely named test report.
2. Choose a harmless JPG, PNG, or WebP image no larger than 2 MB. Avoid faces, license plates, or private documents.
3. Submit the report. Confirm it navigates to the report detail and the photo appears.
4. Refresh the detail page and confirm the photo loads again. A temporary preview before submission is not enough; verify after refresh.
5. If upload/linking fails but the report itself is created, note that as a partial result and copy the exact warning. Do not keep retrying with the same file until the warning is recorded.

#### Test C — Check saved community interactions

1. Open a report visible to the signed-in citizen (the test report is fine).
2. Select **Support** once. Confirm the button changes to **Supported** and the total increases.
3. Select **Save** once and **Follow updates** once. Confirm both controls show their selected state.
4. Open **Comment**, enter a short test comment without contact details, and choose **Post**.
5. Choose the flag icon only on a test report. Flags are one-per-user/report and there is no normal unflag action in this UI.
6. Refresh the page. Confirm supported/saved/following state, comment, and totals remain. Confirm the flag remains selected or disabled.
7. If any action shows an error, note which button/action failed and copy the exact UI message. Do not report an action as passed just because the button reacted before refresh.

#### Test D — Optional status update and notification (requires provisioned staff)

1. If you already have a municipal admin account, sign out of the citizen account and sign in as that admin. If you only have a worker account, it must be assigned to the same municipality/team and to the test report.
2. Navigate to `/municipal`. A staff account should see the authorized municipal workspace. If access is denied, record the message; do not use the demo `/admin` route as a substitute.
3. As a municipal admin, find the test report under **Report management** and choose **Move to review**. Add or use a non-sensitive public update. If the report needs a worker update, use the worker/team assignment controls where available. As a worker, update the assigned report using **Acknowledge / in progress** and a short public progress update.
4. Sign out of the staff account and back into the citizen who submitted/follows the report.
5. Confirm the report status/history reflects the update and check the notification bell or **Notifications** page for a status notification.
6. Mark the notification read. Refresh and confirm it remains read.
7. If there is no provisioned staff account, mark this test **Not tested — no staff account**. Do not try to create staff by editing a browser profile or running ad-hoc SQL.

#### Test E — Basic account separation

Only do this if you already have a second citizen account you own:

1. Sign out of the report owner and sign in to the second citizen account.
2. Check whether reports that are intended to be public are visible in the feed.
3. If there is a test report whose status is private (for example, a rejected test report created through the authorized municipal flow), try its direct detail link while signed in as the second citizen. It should not expose report data. Do not create a rejection just for this test unless you are comfortable with that test report's final state.
4. Do not try to access another user's private Storage object by guessing paths or editing tokens. Report any unexpected visible data and stop.

#### What to paste back

Send a short result using this template; `Passed`, `Failed`, or `Not tested` is enough:

```text
Citizen report create + refresh: 
Photo upload + refresh:
Support/save/follow/comment/flag + refresh:
Status history + notification: 
Second-citizen visibility check:
Exact error text (if any):
Page/action when it happened:
```

If an error appears, copy the exact red message/toast from CivicFix and say which step caused it. If there is no UI message, say that; do not send passwords, one-time codes, access tokens, `.env` values, or browser request headers. Redact personal email/phone/address details from screenshots or logs. Share the result here and the next agent can triage the first failing step.

Migration success and a clean frontend build are not proof these checks pass. If a check fails, inspect the exact error and current database state before suggesting SQL changes.

### P1 — Close functional and user-experience gaps

1. Check live account/session transitions and ensure all routes show accurate loading, unauthenticated, empty, and error states.
2. Review report details, My Reports, feed, map, and notification states after login/logout and after report submission.
3. Verify comments and support totals refresh consistently after mutations; confirm failed writes remain visible to the user and do not show success.
4. Review attachment cleanup and retry behavior when upload, attachment metadata creation, or signed URL generation fails.
5. Replace generic author labels with profile display names only if privacy rules and database access can safely support it.
6. Decide whether community comments and other interactions need moderation/report-review workflows before inviting real residents.

### P2 — Operational readiness and product scope

1. Decide whether to implement Realtime refresh, push/email notifications, or keep the current in-app-only model.
2. Add a trusted staff onboarding/provisioning interface or document the secure operator procedure. Do not use client-side service credentials.
3. Decide whether CivicFix will integrate with an official municipal intake system. Until then, retain the independent-platform disclaimer.
4. Add automated tests for role-based access and citizen reporting behavior; consider database policy tests as part of CI.
5. Review the large production bundle warning separately if performance work is prioritized.

## Working tree and collaboration notes

- At the time of this snapshot, the working tree contains multiple uncommitted changes related to branding, authentication/profile setup, municipal workflows, seed data, citizen persistence, and migration 006. Do not reset, discard, or overwrite those changes.
- Inspect `git status` and the relevant diffs before editing. Some migration files and application pages appear as untracked files in the current worktree; preserve them.
- `README.md` contains setup and limitations and should be kept consistent with any later changes to migration requirements or feature behavior.
- Current implementation references:
  - `src/App.tsx` — application auth/data state and route wiring.
  - `src/services/civicDataService.ts` — Supabase report and community data operations.
  - `src/pages/AuthPages.tsx` — sign-up, login, and profile setup.
  - `src/pages/MunicipalWorkspacePage.tsx` — role-scoped municipal workspace.
  - `supabase/migrations/` — schema and authorization changes; apply in the documented order.
  - `supabase/seed.sql` — Emfuleni municipality/team seed data.
  - `supabase/provision_demo_staff.sql` — one-time example provisioning for Auth-created worker/supervisor test users; replace the example emails before running.
  - `README.md` — user-facing setup, status, and limitations.

## Product and safety boundaries

- CivicFix is not currently an official municipal complaint channel.
- The `/admin` route is demo-only and unprotected.
- Do not describe demo records, sample images, or UI success as evidence of live municipal action.
- Keep exact addresses and sensitive personal details out of public report content.
