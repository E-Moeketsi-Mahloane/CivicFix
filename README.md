# CivicFix

CivicFix is a civic technology MVP built for the FNB App of the Year Hackathon 2026. The app helps residents report infrastructure issues, track progress, and gives administrators a dashboard for assigning and monitoring service requests.

## Project status

This repository contains a working demo build using React, TypeScript, Vite, Tailwind CSS, and Leaflet. It includes:

- a landing page
- a report submission form
- a resident dashboard
- an admin dashboard with report status controls
- an interactive map of sample issue locations
- a clear demo-mode label so the data is not mistaken for an official municipal feed

## Tech stack

- React + TypeScript + Vite
- Tailwind CSS
- Leaflet + OpenStreetMap tiles
- react-router-dom
- Supabase client stub ready for future integration

## Local setup

```bash
npm install
npm run dev
```

Then open the local Vite URL in the browser.

## Demo environment

The app defaults to demo mode if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are missing. This is intentionally separate from any real production backend and should be treated as a presentation-only flow.

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Then fill in Supabase values when available.

## Available scripts

```bash
npm run dev
npm run build
npm run lint
```

## Notes

This demo is intentionally lightweight and is designed to be understandable for a final-year IT student while still reflecting a realistic civic reporting workflow. It does not claim to be an official municipal service channel or a production backend integration.
