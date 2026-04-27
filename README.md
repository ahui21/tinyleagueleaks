# Tiny League Leaks

A single-page tabloid website surfacing the Tiny League's net winnings and losses across 13 nights of play.
Vol. I, No. 1 — published April 26, 2026.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS 3
- Recharts
- Static — no backend, no env vars

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` automatically regenerates `src/data.ts` from the CSVs in `data/` before starting Vite.

## Build

```bash
npm run build        # outputs dist/
npm run preview      # serves the production build locally
```

## Updating the data

The site reads from `src/data.ts`, which is generated from three CSVs in `data/`:

- `data/player_totals.csv`
- `data/games.csv`
- `data/cumulative_by_date.csv`

After editing any of those, regenerate:

```bash
npm run build:data
```

## Before deploying

Open `src/App.tsx` and replace the placeholder `SHEET_URL` constant near the top of the file with the real Google Sheets URL for the league's ledger.

```ts
const SHEET_URL = "https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit";
```

Make sure the sheet's share setting is "Anyone with the link can view."

## Deployment

The site is a fully static SPA — `dist/` can be served by Vercel, Netlify, GitHub Pages, Cloudflare Pages, etc.
See `DEPLOY.md` for the recommended Vercel + Namecheap DNS path.
