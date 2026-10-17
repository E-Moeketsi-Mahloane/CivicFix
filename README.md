# CivicFix

**Your Community. Your Voice. Visible Progress.**

CivicFix is an independent civic-technology MVP for the FNB App of the Year Hackathon 2026. It helps South African residents report infrastructure issues and follow visible progress through a community-oriented interface, with demo mode available when Supabase is not configured.

## Current implementation

The React + TypeScript + Vite application provides a demo experience and a Supabase-backed citizen reporting workflow when configured:

- Responsive community feed with search, category/status/community/urgency filters, sorting, and incremental loading.
- Report posts with sample imagery, privacy-conscious locations, status timelines, report details, support/save/follow actions, comments, and share links.
- Report submission with required-field and coordinate validation, optional geolocation, a 2 MB image limit, and a rule-based duplicate warning.
- Resident dashboard, sample notification centre, Leaflet map, and an admin demonstration view with report filters and locally applied status/team updates.
- Dashboard counts are calculated from the reports held in the current app session. Sample images and report records are illustrative, not evidence of live municipal activity.

## Important limitations

- In Supabase-configured mode, reports, report photos, comments, supports, bookmarks, follows, flags, and in-app status notifications use Supabase. In demo mode, interactions remain in browser memory and are lost on refresh.
- Sign-up and login use Supabase Auth. Signed-in users must complete a profile with province and an active municipality selected from the database before accessing the app; phone, ward, suburb/township, and profile picture are optional. Province, municipality ID, phone, ward, and suburb/township are saved to the user's `profiles` row. Profile completion is checked by the app, while authorization for database operations is enforced separately by RLS.
- The private `avatars` bucket is defined in migration 002. Citizen report photos, comments, support, bookmarks, follows, flags, and in-app status notifications require migration 006 in addition to migrations 001–005. Push/email notifications and Realtime refresh are not configured.
- A database-backed municipal workspace is available at `/municipal` for provisioned municipal worker/admin accounts. Its visibility and RPC actions are guarded by database roles and municipality/team scopes; it requires seeded municipality/team data and provisioned staff accounts. Staff municipality scope remains controlled by trusted provisioning.
- The legacy `/admin` view is still a demo and is not authenticated or protected. Do not use it for real administrative data.
- CivicFix is not an official municipal reporting channel. Reports entered here are not sent to a municipality.
- Demo locations and images are illustrative. Use only appropriate, non-sensitive public locations for real submissions.

## Supabase migration status

The files in `supabase/migrations/` define the schema. Their applied status is specific to your Supabase project; running files in the SQL Editor is not recorded in this repository. The user reports that migrations 001–006 have been applied to their project. If setting up another project, apply migrations in this order using the Supabase SQL Editor or a configured local Supabase database:

1. `001_initial_schema.sql` — base tables, enums, and initial policies. Migration 004 replaces its unsafe resident report-update policy; do not use this schema as a production authorization setup before applying the full sequence.
2. `002_profile_avatar_storage.sql` — private avatar storage bucket and owner policies.
3. `003_workflow_statuses.sql` — adds workflow enum values. Keep this migration separate and apply it before migration 004.
4. `004_municipal_rbac_workflow.sql` — municipal roles/scopes, report workflow, RLS, and trusted provisioning/activation RPCs.
5. `005_work_evidence_storage.sql` — private work-completion evidence bucket and policies.
6. `006_citizen_reports_and_community.sql` — citizen report attachments, supports, bookmarks, follows, comments, flags, status notifications, and engagement counts.

After applying the migrations, seed active municipality and team records before provisioning staff. `supabase/seed.sql` currently seeds Emfuleni Local Municipality and the initial teams supplied for this setup; review it before running it in the Supabase SQL Editor. It does not create user accounts or demo reports. Municipal worker/admin profiles must be provisioned through the trusted `provision_municipal_account` operation or an equivalent privileged server-side process. Staff activation/deactivation is likewise restricted to trusted operations. Do not expose a service-role key in the browser, commit it, or use it as a `VITE_` variable. There is no staff invitation/provisioning UI yet.

Configure Supabase email confirmation and redirect URLs for local and deployed CivicFix origins. Migration 006 is required for citizen report/community features. If it fails in another project, stop and share the database error; do not rerun a partially applied script until its state is checked. Migration 006 replaces its specifically named CivicFix status triggers so it can recover from an earlier attempt that left those triggers behind. Test report creation, photo upload/view, community interactions, and status notifications with separate citizen, worker, and admin accounts. Migration execution and RLS behavior must be verified in the target Supabase project; a successful frontend build does not validate them.

## Run locally

```powershell
npm install
npm run dev
```

Open the local Vite URL printed in the terminal. Supabase Auth requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`; if the local environment is not already configured, copy `.env.example` to `.env` and enter the project URL and publishable key (or legacy anon key) from Supabase **Settings → API Keys**. Never put a Supabase secret or service-role key in a Vite environment variable. The `.env` file is ignored by Git.

## Checks

```powershell
npm run build
npm run lint
```

## Stack

- React, TypeScript, Vite
- Tailwind CSS with CivicFix design tokens and custom responsive styles
- React Router
- Lucide React
- Leaflet / OpenStreetMap tiles
- Supabase Auth sign-up/login, citizen report/community persistence (after migration 006), and a role-scoped municipal workspace
