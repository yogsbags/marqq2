# Marketing screenshots

These PNGs should be **captured from the real Marqq app** (not committed placeholders).

## Generate (Playwright — recommended)

From the **`marqq/`** repo root:

1. In **`marqq/`**, copy `.env.screenshots.example` to **`.env.screenshots`** and set `MARQQ_SCREENSHOT_EMAIL` / `MARQQ_SCREENSHOT_PASSWORD` (gitignored).

2. Run (starts `npm run dev` automatically if nothing is listening on port 3007):

   ```bash
   npm run screenshots:marketing
   ```

   This runs `playwright test -c app/playwright.config.ts marketing-screenshots`.

3. Outputs:

   - `hero-dashboard.png` — Home + full shell  
   - `modules-rail.png` — Content Studio module (sidebar + main)  
   - `ai-chat.png` — **Ask AI** drawer open  

Use a **workspace account that has finished onboarding**. Optional env: `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3007`).

## Alternative (Node script + manual dev server)

```bash
npm run dev   # terminal 1
export MARQQ_SCREENSHOT_EMAIL="..."
export MARQQ_SCREENSHOT_PASSWORD="..."
npm run screenshots:marketing:node
```

The marketing site uses **PNG first** and falls back to the SVG previews if a PNG is missing.

## Social / OG

After capture, point Open Graph `og:image` at your deployed `…/screenshots/hero-dashboard.png` (1200×630 crops are ideal for some networks; these are full-width app shots).
