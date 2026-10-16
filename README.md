# CivicFix

**Your Community. Your Voice. Visible Progress.**

CivicFix is an independent civic-technology MVP for the FNB App of the Year Hackathon 2026. It is intended to help South African residents report infrastructure issues and follow visible progress through a community-oriented interface.

## Current implementation

The React + TypeScript + Vite application currently provides a clearly labelled demo experience:

- Responsive community feed with search, category/status/community/urgency filters, sorting, and incremental loading.
- Report posts with sample imagery, privacy-conscious locations, status timelines, report details, support/save/follow actions, comments, and share links.
- Report submission with required-field and coordinate validation, optional geolocation, a 2 MB image limit, and a rule-based duplicate warning.
- Resident dashboard, sample notification centre, Leaflet map, and an admin demonstration view with report filters and locally applied status/team updates.
- Dashboard counts are calculated from the reports held in the current app session. Sample images and report records are illustrative, not evidence of live municipal activity.

## Important limitations

- Reports, comments, support, follows, and admin edits are held in frontend memory and are lost when the page is refreshed.
- Supabase credentials/client scaffolding and a draft schema exist, but authentication, database reads/writes, Storage uploads, Realtime, and RLS policies are not connected or verified by this interface.
- The admin view is not authenticated or protected and must not be used for real administrative data.
- CivicFix is not an official municipal reporting channel. Reports entered here are not sent to a municipality.
- Demo locations and images are illustrative. Use only appropriate, non-sensitive public locations for real submissions.

## Run locally

```powershell
npm install
npm run dev
```

Open the local Vite URL printed in the terminal.

To configure the Supabase client scaffold, copy `.env.example` to `.env` and provide a project URL and anon key. **This only configures the client scaffold; it does not make the demo screens persist data or provide authentication.** Never put a Supabase service-role key in a Vite environment variable.

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
- Supabase JS client scaffold (integration not implemented)
