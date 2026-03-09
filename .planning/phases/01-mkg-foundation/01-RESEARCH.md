# Phase 1: MKG Foundation - Research

**Researched:** 2026-03-10
**Domain:** Node.js JSON persistence, Supabase upsert, Express REST, agent skill-loading
**Confidence:** HIGH (all findings from direct codebase inspection + established Node.js patterns)

---

## Summary

This phase adds a per-company Marketing Knowledge Graph (MKG) — a structured JSON file on disk with field-level metadata (confidence, expiry, source) — plus a Supabase sync table and REST endpoints. The implementation slots into an existing Express backend (`platform/content-engine/backend-server.js`) that is plain JavaScript ESM, not TypeScript. The MKGService will be a `.js` module following the same patterns already used for company-intel KB files.

The codebase already has established patterns for:
- Per-company directory structures under `platform/content-engine/data/`
- Supabase upsert with `onConflict` (used in `saveArtifact`, `saveCompany`)
- `readFile`/`writeFile`/`mkdir` from `node:fs/promises` (already imported)
- `readdir().sort()` skill loading (the exact code that needs the priority fix)

**Primary recommendation:** Model MKGService after the existing `companyKbDir` / `readKnowledgeBaseManifest` / `writeKnowledgeBaseManifest` pattern. Use `0-product-marketing-context.md` filename prefix to guarantee first-sort position. Supabase sync mirrors the `saveArtifact` pattern with `onConflict: 'company_id'`.

---

## Standard Stack

The backend is already established — no new libraries needed.

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs/promises` | Node 20 built-in | `readFile`, `writeFile`, `mkdir`, `readdir` | Already imported in backend-server.js line 23 |
| `@supabase/supabase-js` | existing | DB sync, RLS | Already configured in supabase.js, client exported as `supabase` |
| `express` | existing | REST endpoints | Backend is Express on port 3008 |
| `node:path` `join` | Node 20 built-in | Path construction | Already imported line 24 |

### No New Dependencies Required
All required capabilities are available in the existing stack. MKGService is a plain JS module.

---

## Architecture Patterns

### Recommended Directory Structure

```
platform/
└── crewai/
    └── memory/
        └── {companyId}/
            └── mkg.json          # Per-company MKG file
```

**Rationale:** `platform/crewai/memory/` is the natural location — it parallels `platform/crewai/agents/{name}/memory/MEMORY.md` (agent memory) and `platform/crewai/client_context/` (client context). The `CTX_DIR` constant already shows this `platform/crewai/` convention. Company-level memory vs agent-level memory are clearly separated by path depth.

The alternative location `platform/content-engine/data/company-intel-kb/` is already used for Company Intelligence KB files (knowledge base documents, assets). MKG is a different concern — shared context state — so it belongs in `crewai/memory/` not `content-engine/data/`.

**Path constant to add in backend-server.js:**
```javascript
const MKG_ROOT = join(CREWAI_DIR, "memory");
// → platform/content-engine/../crewai/memory/{companyId}/mkg.json
```

### MKG JSON Schema

```json
{
  "company_id": "uuid-or-slug",
  "updated_at": "2026-03-10T12:00:00Z",
  "positioning": {
    "value": "AI marketing OS for SMBs",
    "confidence": 0.87,
    "last_verified": "2026-03-08",
    "source_agent": "isha",
    "expires_at": "2026-04-08"
  },
  "icp": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "competitors": {
    "value": [{"name": "HubSpot", "last_checked": "2026-03-01"}],
    "confidence": 0.75,
    "last_verified": "2026-03-01",
    "source_agent": "priya",
    "expires_at": "2026-04-01"
  },
  "offers": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "messaging": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "channels": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "funnel": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "metrics": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "baselines": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "content_pillars": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "campaigns": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null },
  "insights": { "value": null, "confidence": 0, "last_verified": null, "source_agent": null, "expires_at": null }
}
```

**Key design decision:** All 12 top-level fields are always present in the JSON, initialized with `null` values and `confidence: 0`. This prevents "field not found" errors on `read()` calls before an agent has populated a field. The `isStale()` method treats `confidence: 0` and `value: null` as "never set" — a distinct state from "set but stale."

### Pattern 1: MKGService Module (Singleton Module Pattern)

**What:** A plain JS ESM module that exports a singleton service object. Not a class instantiated with `new` — Node module caching provides singleton semantics automatically.

**When to use:** This backend uses the module-singleton pattern throughout (e.g., `supabase.js` exports a pre-constructed `supabase` client). MKGService follows the same pattern.

```javascript
// Source: codebase pattern from platform/content-engine/supabase.js
// platform/content-engine/mkg-service.js

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MKG_ROOT = join(__dirname, "..", "crewai", "memory");

const STALE_CONFIDENCE_THRESHOLD = 0.6;
const STALE_AGE_DAYS = 30;

const FIELD_DEFAULTS = {
  value: null, confidence: 0, last_verified: null, source_agent: null, expires_at: null
};

const TOP_LEVEL_FIELDS = [
  "positioning", "icp", "competitors", "offers", "messaging",
  "channels", "funnel", "metrics", "baselines", "content_pillars",
  "campaigns", "insights"
];

function mkgPath(companyId) {
  return join(MKG_ROOT, companyId, "mkg.json");
}

async function readMkg(companyId) {
  try {
    const raw = await readFile(mkgPath(companyId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeMkg(companyId, data) {
  const dir = join(MKG_ROOT, companyId);
  await mkdir(dir, { recursive: true });
  await writeFile(mkgPath(companyId), JSON.stringify(data, null, 2), "utf-8");
}

function createEmptyMkg(companyId) {
  const mkg = { company_id: companyId, updated_at: new Date().toISOString() };
  for (const field of TOP_LEVEL_FIELDS) {
    mkg[field] = { ...FIELD_DEFAULTS };
  }
  return mkg;
}

export const MKGService = {
  async read(companyId, field) {
    const mkg = (await readMkg(companyId)) || createEmptyMkg(companyId);
    if (field === undefined) return mkg;
    return mkg[field] ?? { ...FIELD_DEFAULTS };
  },

  async patch(companyId, patch) {
    const mkg = (await readMkg(companyId)) || createEmptyMkg(companyId);
    for (const [field, fieldData] of Object.entries(patch)) {
      mkg[field] = { ...(mkg[field] || FIELD_DEFAULTS), ...fieldData };
    }
    mkg.updated_at = new Date().toISOString();
    await writeMkg(companyId, mkg);
    await syncToSupabase(companyId, mkg);
    return mkg;
  },

  isStale(fieldData) {
    if (!fieldData || fieldData.value === null || fieldData.confidence === 0) {
      return false; // Never set — not stale, just empty
    }
    if (fieldData.confidence < STALE_CONFIDENCE_THRESHOLD) return true;
    if (fieldData.expires_at && new Date(fieldData.expires_at) < new Date()) return true;
    if (fieldData.last_verified) {
      const ageDays = (Date.now() - new Date(fieldData.last_verified)) / 86400000;
      if (ageDays > STALE_AGE_DAYS) return true;
    }
    return false;
  },

  async getExpiredFields(companyId) {
    const mkg = (await readMkg(companyId)) || createEmptyMkg(companyId);
    return TOP_LEVEL_FIELDS.filter((f) => this.isStale(mkg[f]));
  },
};

async function syncToSupabase(companyId, mkg) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("company_mkg")
      .upsert({ company_id: companyId, mkg_data: mkg, updated_at: mkg.updated_at },
               { onConflict: "company_id" });
    if (error) console.error("MKG Supabase sync error:", error);
  } catch (err) {
    console.error("MKG Supabase sync failed:", err);
  }
}
```

### Pattern 2: Skill Loading Order Fix

**Current code (lines 2974–2976 in backend-server.js):**
```javascript
const files = (await readdir(skillsDir))
  .filter((f) => f.endsWith(".md"))
  .sort();
```

The `.sort()` uses lexicographic order. Files sort as: `ads-plan.md`, `blog-strategy.md`, `email-plan.md`, `seo-plan.md`. The `product-marketing-context` skill must come first.

**Solution:** Name the file `00-product-marketing-context.md`. Lexicographic sort places `0` before any lowercase letter, so `00-product-marketing-context.md` will always sort before `ads-plan.md`, `blog-strategy.md`, etc.

This requires **zero changes to the skill-loading code** in backend-server.js. The existing `.sort()` already handles it correctly with the naming convention.

**Verification:** `["ads-plan.md", "00-product-marketing-context.md", "blog-strategy.md"].sort()` → `["00-product-marketing-context.md", "ads-plan.md", "blog-strategy.md"]`

Each agent's `skills/` directory gets a `00-product-marketing-context.md` file. Its content is loaded once into the system prompt preamble before all other skills.

### Pattern 3: REST Endpoints

**How to add to backend-server.js** — follows same pattern as existing company-intel routes:

```javascript
// Source: pattern from lines 3922-3930 in backend-server.js
import { MKGService } from "./mkg-service.js";

app.get("/api/mkg/:companyId", async (req, res) => {
  const { companyId } = req.params;
  if (!companyId?.trim()) return res.status(400).json({ error: "companyId required" });
  try {
    const mkg = await MKGService.read(companyId);
    res.json({ mkg });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/mkg/:companyId", async (req, res) => {
  const { companyId } = req.params;
  const patch = req.body;
  if (!companyId?.trim()) return res.status(400).json({ error: "companyId required" });
  if (!patch || typeof patch !== "object") return res.status(400).json({ error: "body must be a patch object" });
  try {
    const updated = await MKGService.patch(companyId, patch);
    res.json({ mkg: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

### Anti-Patterns to Avoid

- **Full replace on PATCH:** Never replace the entire MKG document. Only merge at the field level. A `PATCH /api/mkg/:companyId` with `{ "positioning": { "value": "..." } }` should update `positioning` only, leaving all other fields intact.
- **Storing raw LLM output as MKG value:** `value` should always be a structured type (string, number, array, object) — not raw Markdown or prose output.
- **Sync failures blocking writes:** The Supabase sync in `patch()` should be fire-and-update — write to disk first, then sync. Never let Supabase being down block the local write.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file write | Custom lock file or temp-file swap | `writeFile` direct (single-process backend) | Backend is single-process Express; Node's `fs` writes are non-concurrent per file in practice. If multi-process needed later, use Supabase as source of truth. |
| Conflict resolution | Custom merge logic | Simple `Object.assign` merge at field level | MKG fields are owned by one agent at a time; last-write-wins is correct. |
| Schema validation | Joi, Zod, ajv | Manual field check in `patch()` | Overhead is not justified; just check that `patch` keys are in `TOP_LEVEL_FIELDS` and values have the expected shape |
| JSON diffing | deep-diff, jsondiffpatch | Before/after comparison by key | Only 12 top-level keys; no library needed |

---

## Common Pitfalls

### Pitfall 1: isStale() called on a never-set field
**What goes wrong:** `mkg["icp"].confidence === 0` and `value === null` — calling `isStale()` should NOT return `true`. A never-set field is "empty", not "stale". Callers treat stale differently from empty: stale triggers re-fetch, empty triggers initial population.
**How to avoid:** First check `if (!fieldData || fieldData.value === null || fieldData.confidence === 0) return false` — this is the "never set" guard, documented in the MKGService above.
**Warning signs:** getExpiredFields() returning all 12 fields for a new company.

### Pitfall 2: PATCH merges value sub-keys instead of replacing the field envelope
**What goes wrong:** Agent patches `{ "positioning": { "confidence": 0.9 } }` intending to update only confidence. If the merge is too shallow, `value` and other sub-keys get wiped.
**How to avoid:** Merge at the field level: `mkg[field] = { ...(mkg[field] || FIELD_DEFAULTS), ...fieldData }`. This spreads existing field data first, then overlays only the provided keys. Partial field updates work correctly.

### Pitfall 3: Supabase `company_mkg` table doesn't exist yet
**What goes wrong:** `syncToSupabase()` throws `42P01` (table does not exist). This will crash silently if uncaught, or loudly if the error propagates.
**How to avoid:** Wrap Supabase sync in try/catch (already shown above). Log the error but do NOT throw. The disk write is the source of truth; Supabase is resilience backup. Check for `error.code === '42P01'` and emit a warning on first occurrence, same pattern as line 68 in supabase.js.

### Pitfall 4: companyId as user-controlled path segment
**What goes wrong:** `companyId` comes from `req.params.companyId`. If a user passes `../../etc/passwd`, the `join(MKG_ROOT, companyId, "mkg.json")` would resolve outside the `MKG_ROOT`.
**How to avoid:** Sanitize companyId before using in a path. Only allow UUID format or alphanumeric slugs:
```javascript
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(companyId)) {
  return res.status(400).json({ error: "invalid companyId" });
}
```
The existing `companyKbDir()` function has this same vulnerability — it's not validated in the current codebase. MKGService should fix it.

### Pitfall 5: skills/ directory doesn't exist on some agents
**What goes wrong:** Agents added without a `skills/` directory (e.g., `isha` has `skills/` but it's empty per `ls` output). The `product-marketing-context` skill must exist in every agent's `skills/` directory. If the directory is missing, the `readdir` catch swallows the error silently.
**How to avoid:** Create `skills/` + `00-product-marketing-context.md` for every agent in the same task. The catch block at line 2987 already handles missing dirs gracefully — no code change needed, just ensure the file exists.

### Pitfall 6: `expires_at` is in the past when initially generated
**What goes wrong:** If MKG is populated with `expires_at` set to 30 days from `last_verified`, but `last_verified` is from a prior run, the field can appear immediately stale. This is actually correct behavior, but surprises on first read.
**How to avoid:** `isStale()` returns `true` when `expires_at < now()`. That's intended — stale fields need refresh. Document this clearly: "fresh MKG data may show stale fields; that's the staleness detector working."

---

## Supabase Schema

```sql
-- database/migrations/mkg-foundation.sql
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS company_mkg (
  company_id   TEXT        PRIMARY KEY,
  mkg_data     JSONB       NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by update time (e.g., find companies with stale MKG)
CREATE INDEX IF NOT EXISTS idx_company_mkg_updated
  ON company_mkg (updated_at DESC);

-- Row Level Security
ALTER TABLE company_mkg ENABLE ROW LEVEL SECURITY;

-- Service role (used by backend Express server) bypasses RLS.
-- Frontend reads via authenticated user: restrict to their workspace companies.
-- For now, service-role-only access (backend writes, no direct frontend reads).
CREATE POLICY "company_mkg_service_only" ON company_mkg
  FOR ALL USING (auth.role() = 'service_role');

-- Note: If frontend needs to read MKG directly, add:
-- CREATE POLICY "company_mkg_workspace_read" ON company_mkg
--   FOR SELECT USING (
--     company_id IN (
--       SELECT c.id FROM companies c
--       INNER JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
--       WHERE wm.user_id = auth.uid()
--     )
--   );
```

**Column design decisions:**
- `company_id TEXT PRIMARY KEY` — not UUID FK. The existing `companies` table uses UUID PKs, but MKG should work even before a company is in Supabase (disk-first architecture). Use TEXT to allow both UUIDs and slug-style IDs. Add a FK constraint later if needed.
- `mkg_data JSONB` — store the entire MKG envelope as JSONB for query flexibility (can filter by `mkg_data->'positioning'->>'confidence'` if needed).
- No `workspace_id` column initially — the MKG is per-company, not per-workspace. Add workspace FK in a later migration if multi-workspace company ownership is needed.

---

## MKGService API Surface

Complete method signatures (JavaScript, not TypeScript — per decision):

```javascript
// platform/content-engine/mkg-service.js

export const MKGService = {
  // Returns full MKG object for a company, or a single field envelope.
  // Never throws — returns empty MKG structure if file doesn't exist.
  // field: one of the 12 TOP_LEVEL_FIELDS, or undefined for full MKG
  async read(companyId, field = undefined) → Promise<Object>,

  // Merges patch into MKG at field level. Writes to disk. Syncs to Supabase.
  // patch: { fieldName: { value, confidence, last_verified, source_agent, expires_at } }
  // Partial field patches OK: { "positioning": { "confidence": 0.9 } } updates only confidence.
  async patch(companyId, patch) → Promise<Object>,  // returns updated full MKG

  // Returns true if a field is stale (confidence < 0.6 OR age > 30 days OR past expires_at).
  // Returns false if field was never set (value === null, confidence === 0).
  // Takes a field envelope object (not companyId + fieldName) — caller reads field first.
  isStale(fieldData) → Boolean,

  // Returns array of field names that are stale for a company.
  // Empty array if all fields are fresh or unset.
  async getExpiredFields(companyId) → Promise<String[]>,
};
```

---

## Code Examples

### Reading a single field

```javascript
// Source: MKGService.read pattern — disk-first, never throws
const positioningField = await MKGService.read(companyId, "positioning");
if (positioningField.value === null) {
  // Field never set — trigger initial population
} else if (MKGService.isStale(positioningField)) {
  // Field is set but stale — trigger refresh
} else {
  // Fresh data — use positioningField.value
}
```

### Patching after an agent run

```javascript
// Source: MKGService.patch — field-level merge
await MKGService.patch(companyId, {
  positioning: {
    value: "AI-native marketing OS for B2B SMBs in India",
    confidence: 0.9,
    last_verified: new Date().toISOString().split("T")[0],
    source_agent: "isha",
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  },
  icp: {
    value: { company_size: "10-200", industry: "SaaS", geography: "India" },
    confidence: 0.75,
    last_verified: new Date().toISOString().split("T")[0],
    source_agent: "isha",
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  }
});
```

### Skill loading order (no code change needed)

```
agents/zara/skills/
├── 00-product-marketing-context.md   ← loads first (lexicographic sort)
├── ads-plan.md
├── blog-strategy.md
├── email-plan.md
└── seo-plan.md
```

The existing sort at line 2976 produces: `["00-product-marketing-context.md", "ads-plan.md", "blog-strategy.md", "email-plan.md", "seo-plan.md"]` — correct order, no code change.

### Handling competitors as an array of objects

```javascript
// Nested/array fields are stored as the `value` — MKG envelope wraps any JSON-serializable type
await MKGService.patch(companyId, {
  competitors: {
    value: [
      { name: "HubSpot", positioning: "All-in-one", last_checked: "2026-03-10" },
      { name: "ActiveCampaign", positioning: "Email-first", last_checked: "2026-03-10" },
    ],
    confidence: 0.85,
    last_verified: "2026-03-10",
    source_agent: "priya",
    expires_at: "2026-04-10",
  }
});

// Reading back:
const competitorsField = await MKGService.read(companyId, "competitors");
const competitors = competitorsField.value; // Array of objects
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| Context passed per-run in chat message | MKG persisted on disk, loaded into every agent system prompt via skill | No context rot; agents always have current company knowledge |
| Agent memory is append-only MEMORY.md logs | Field-level metadata (confidence, expiry, source) | Staleness is detectable; agents know which knowledge to trust |
| Single global confidence | Per-field confidence scores | Agents can trust `positioning` (0.9) while treating `metrics` (0.2) as unverified |

---

## Open Questions

1. **Multi-company per workspace**
   - What we know: `companies` table exists in Supabase; workspaces have one `website_url` per workspace, not a company FK
   - What's unclear: Is `companyId` the same as the UUID from the `companies` table, or is it a separate concept?
   - Recommendation: Use the existing company UUID from `companies` table as `companyId` in MKG. The REST endpoints receive `companyId` from the caller — the caller (agent run) should pass the company UUID from the existing companies table.

2. **product-marketing-context skill content**
   - What we know: The file must exist as `00-product-marketing-context.md` in every agent's `skills/` directory
   - What's unclear: Does each agent get the same generic skill, or a per-agent specialized version?
   - Recommendation: One shared skill template that agents inject their company's current MKG state into at runtime. The skill content is the instruction format; the MKG values are loaded dynamically via a separate context injection step (Phase 2 concern, not Phase 1). For Phase 1, the skill file is static content describing the MKG schema and how to read/write it.

3. **Supabase anon key vs service key for MKG writes**
   - What we know: `supabase.js` uses `VITE_SUPABASE_ANON_KEY` (line 28) — the anon key, not a service role key
   - What's unclear: With RLS enabled on `company_mkg`, the anon key cannot bypass RLS. The backend calls Supabase as "unauthenticated" (no JWT in the anon client)
   - Recommendation: For Phase 1, use `USING (true)` RLS policy (allow all) on `company_mkg` since it's backend-only. Add proper RLS when frontend reads are needed. OR: Add `SUPABASE_SERVICE_KEY` to the backend's env — the Python scheduler already uses it per `agent-employees.sql` comment line 78. This is the cleanest solution for backend-to-Supabase writes.

---

## What to Watch Out for in the Existing Codebase

1. **`VALID_AGENTS` set (line 59):** Does not currently include `veena`. MKG endpoints don't use VALID_AGENTS, but if agents run MKG patches through agent runs, `veena` must be added.

2. **`ensureCompanyEntry()` (line 3801):** This function fetches from the `_companies` in-memory Map + Supabase. The MKGService is independent of this — MKG uses a separate disk path and table. Do NOT tie MKGService to `_companies` or `ensureCompanyEntry`. They serve different concerns.

3. **The `supabase` import in `mkg-service.js`:** Import `supabase` from `./supabase.js` (the shared client). Do not create a second Supabase client. The null guard `if (!supabase)` is already handled in `supabase.js` — always check before using.

4. **`COMPANY_INTEL_KB_ROOT` is at `data/company-intel-kb/`:** This is under `platform/content-engine/data/`. MKG goes under `platform/crewai/memory/` — keep them separate. The company-intel KB stores uploaded documents and generated artifacts. MKG stores the extracted knowledge graph.

5. **Skill loading `catch` at line 2987:** The existing code silently ignores missing `skills/` directories. This means if `00-product-marketing-context.md` is missing from an agent, the agent runs without it — no error. For Phase 1, ensure the file exists in all agents. Consider adding a warning log in the catch block.

6. **`fullSystem` construction (lines 2991–2995):** The current order is: SOUL.md → MEMORY.md → skills block. The `product-marketing-context` skill will appear inside the `skillsBlock` at the top (due to `00-` prefix). This is slightly suboptimal — the skill could be injected directly before the skills block for higher priority. For Phase 1, the `00-` prefix approach is sufficient and requires no code changes.

7. **Backend is ESM (`"type": "module"` in package.json implied by `import` usage):** `mkg-service.js` must use ESM syntax — `import`/`export`, not `require`/`module.exports`. All existing files in `platform/content-engine/` already use ESM.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `/Users/yogs87/Downloads/sanity/projects/martech/platform/content-engine/backend-server.js` (lines 23-70, 375-402, 2938-2995, 3831-3880)
- Direct inspection of `/Users/yogs87/Downloads/sanity/projects/martech/platform/content-engine/supabase.js`
- Direct inspection of `/Users/yogs87/Downloads/sanity/projects/martech/database/migrations/agent-employees.sql`
- Direct inspection of `/Users/yogs87/Downloads/sanity/projects/martech/database/migrations/workspace.sql`
- Direct inspection of `/Users/yogs87/Downloads/sanity/projects/martech/.planning/REQUIREMENTS.md`
- Direct inspection of `platform/crewai/agents/zara/skills/*.md` (skill file format)

### Secondary (MEDIUM confidence)
- Node.js `Array.prototype.sort()` lexicographic behavior — language specification, stable across all Node 20 versions
- Supabase `upsert` with `onConflict` — follows exact pattern used in `saveArtifact()` (line 82-94 of supabase.js)

---

## Metadata

**Confidence breakdown:**
- Directory structure: HIGH — follows existing `platform/crewai/` conventions exactly
- Supabase schema: HIGH — modeled on existing migration files in same repo
- MKGService API: HIGH — modeled on existing singleton module patterns in codebase
- Skill loading order fix: HIGH — lexicographic sort behavior is deterministic; `00-` prefix verified
- Pitfalls: HIGH — all from direct codebase inspection, not speculation

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable — Express/Supabase/Node.js patterns don't shift on 30-day timescales)
