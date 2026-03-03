# Repository Guidelines

## Project Structure & Module Organization
`main.js` is the single entry point that loads `.env` files and dispatches commands such as `campaign`, `stage`, and `status`. Core orchestration logic lives in `core/` (`orchestrator.js` and `state-manager.js`), while reusable provider settings sit in `config/` (brand palettes, HeyGen avatars, image catalogs). Campaign presets and workflow templates belong in `campaigns/`, and `examples/` and `docs/` provide runnable demos alongside provider-specific references (Veo, Imagen). Generated or persistent state should remain inside `data/` and `output/`, and any scraping or import helpers belong in `scripts/`. Feature probes and regression suites are the `test-*.js` files in the repo root.

## Build, Test, and Development Commands
Install dependencies with `npm install`. Initialize state and verify API connectivity via `npm run init`, then inspect active jobs with `npm run status`. Use `npm start` (or `node main.js`) for interactive orchestration, e.g. `node main.js campaign instagram-reel --topic "Tax saving" --use-veo`. `npm test` runs the lightweight simulated status check; targeted suites such as `node test-image-generation.js`, `node test-fal-kontext-models.js`, or `node test-video-generation.js` validate provider integrations without needing the entire workflow.

## Coding Style & Naming Conventions
Stick to two-space indentation, CommonJS modules (`require`/`module.exports`), and `const`/`let` declarations. Keep orchestration code pure and push network-bound logic into helpers (e.g., provider modules under `integrations/`). Use camelCase for functions and variables, PascalCase for classes, and hyphenated filenames for scripts (`scrape-brand-images.js`). Update `docs/` whenever API payloads or schema expectations change, and avoid committing `.env*` files or API responses.

## Testing Guidelines
Name new suites `test-<feature>.js` so they appear alongside the existing video and image tests. Prefer `npm test` (simulate mode) before running long provider suites, then execute the relevant `node test-*.js` scripts with real keys once confident. Capture failures with reproducible prompts/topics and keep generated assets in `output/` while redacting secrets from logs. When altering orchestration flows, add assertions in the appropriate `test-*.js` file to cover the new branch.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat:`, `fix:`, `chore:`) referencing the affected subsystem (e.g., `feat: add batch reel template`). PR descriptions should list the workflows touched, commands executed (`npm run init`, `node test-image-generation.js`, etc.), linked issues, and screenshots or render links for UI/video changes. Highlight any new environment variables or required provider configuration, and ensure automation (at minimum `npm test`) passes before requesting review.

## Security & Configuration Tips
All provider tokens belong in `.env` or `.env.local`; `main.js` auto-loads both but never write them into tracked files. Enable `--simulate` to validate control flow without spending API credits. Before merging, scrub large media artifacts from `data/` and `output/`, keeping only traceable NDJSON or state snapshots needed for debugging.
