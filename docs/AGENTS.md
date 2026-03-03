# AGENTS.md (projects/martech)

## Scope
- These instructions apply to everything under `projects/martech/`.
- Only modify code within `projects/martech/` unless explicitly requested.

## Repo / Remote
- This folder is deployed from: `https://github.com/yogsbags/martech`
- Do not commit or push changes to any other repository.

## Dev / Build
- Install deps: `npm ci`
- Dev server (frontend): `npm run dev`
- Full dev (backend + frontend): `npm run dev:full`
- Production build: `npm run build`
- Start (Railway/Prod): `npm start` (runs `server.js` on `$PORT`)

## Deployment Notes
- Railway serves everything from the single Node server in `server.js` on `$PORT`.
- API routes are proxied to the internal backend on `localhost:3006`.

## Coding Conventions
- TypeScript/React: functional components, PascalCase component names, camelCase variables.
- Prefer defensive parsing of AI/LLM JSON outputs; never render raw objects directly in JSX.
- Keep UI output structured (cards/tables/widgets) and avoid showing raw JSON in the main UX.

## Safety
- Never add secrets/tokens to the repo. Use environment variables.
