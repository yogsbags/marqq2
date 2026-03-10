/**
 * MKGService — Marketing Knowledge Graph read/write layer.
 *
 * Disk-first: writes to platform/crewai/memory/{companyId}/mkg.json
 * Sync: mirrors to Supabase company_mkg table (fire-and-forget, never blocks disk write)
 *
 * Usage:
 *   import { MKGService } from "./mkg-service.js";
 *   const mkg = await MKGService.read(companyId);
 *   const field = await MKGService.read(companyId, "positioning");
 *   const updated = await MKGService.patch(companyId, { positioning: { value: "...", confidence: 0.9, ... } });
 *   const stale = MKGService.isStale(field);
 *   const expired = await MKGService.getExpiredFields(companyId);
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// MKG files live at: platform/crewai/memory/{companyId}/mkg.json
const MKG_ROOT = join(__dirname, "..", "crewai", "memory");

const STALE_CONFIDENCE_THRESHOLD = 0.6;
const STALE_AGE_DAYS = 30;

// All 12 top-level MKG fields — always present in every mkg.json
const TOP_LEVEL_FIELDS = [
  "positioning",
  "icp",
  "competitors",
  "offers",
  "messaging",
  "channels",
  "funnel",
  "metrics",
  "baselines",
  "content_pillars",
  "campaigns",
  "insights",
];

const FIELD_DEFAULTS = {
  value: null,
  confidence: 0,
  last_verified: null,
  source_agent: null,
  expires_at: null,
};

// ─── Internal helpers ────────────────────────────────────────────────────────

function mkgPath(companyId) {
  return join(MKG_ROOT, companyId, "mkg.json");
}

/** Returns parsed MKG or null if file doesn't exist. Never throws. */
async function readMkg(companyId) {
  try {
    const raw = await readFile(mkgPath(companyId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Writes MKG to disk. Creates directory if needed. */
async function writeMkg(companyId, data) {
  const dir = join(MKG_ROOT, companyId);
  await mkdir(dir, { recursive: true });
  await writeFile(mkgPath(companyId), JSON.stringify(data, null, 2), "utf-8");
}

/** Returns a blank MKG envelope with all 12 fields initialized to null. */
function createEmptyMkg(companyId) {
  const mkg = {
    company_id: companyId,
    updated_at: new Date().toISOString(),
  };
  for (const field of TOP_LEVEL_FIELDS) {
    mkg[field] = { ...FIELD_DEFAULTS };
  }
  return mkg;
}

/**
 * Sync to Supabase after a disk write.
 * Fire-and-forget: logs errors but never throws — disk is source of truth.
 */
async function syncToSupabase(companyId, mkg) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("company_mkg")
      .upsert(
        {
          company_id: companyId,
          mkg_data: mkg,
          updated_at: mkg.updated_at,
        },
        { onConflict: "company_id" }
      );
    if (error) {
      if (error.code === "42P01") {
        console.warn('MKGService: "company_mkg" table does not exist yet. Run database/migrations/mkg-foundation.sql in Supabase.');
      } else {
        console.error("MKGService Supabase sync error:", error);
      }
    }
  } catch (err) {
    console.error("MKGService Supabase sync failed:", err);
  }
}

// ─── Exported service ────────────────────────────────────────────────────────

export const MKGService = {
  /**
   * Read the full MKG for a company, or a single field envelope.
   * Never throws — returns empty MKG if no file exists yet.
   *
   * @param {string} companyId
   * @param {string} [field] — one of TOP_LEVEL_FIELDS; omit for full MKG
   * @returns {Promise<Object>}
   */
  async read(companyId, field) {
    const mkg = (await readMkg(companyId)) || createEmptyMkg(companyId);
    if (field === undefined) return mkg;
    return mkg[field] ?? { ...FIELD_DEFAULTS };
  },

  /**
   * Merge patch into the MKG at field level. Writes to disk. Syncs to Supabase.
   * Partial field patches are safe: only provided sub-keys are overwritten.
   *
   * @param {string} companyId
   * @param {Object} patch — { fieldName: { value?, confidence?, last_verified?, source_agent?, expires_at? } }
   * @returns {Promise<Object>} — the updated full MKG
   */
  async patch(companyId, patch) {
    // Sanitize companyId before using in file path (prevent path traversal)
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(companyId)) {
      throw new Error(`Invalid companyId: "${companyId}". Only alphanumeric, hyphens, and underscores allowed.`);
    }

    const mkg = (await readMkg(companyId)) || createEmptyMkg(companyId);

    for (const [field, fieldData] of Object.entries(patch)) {
      // Ignore unknown fields — only merge known TOP_LEVEL_FIELDS
      if (!TOP_LEVEL_FIELDS.includes(field)) {
        console.warn(`MKGService.patch: ignoring unknown field "${field}"`);
        continue;
      }
      mkg[field] = { ...(mkg[field] || { ...FIELD_DEFAULTS }), ...fieldData };
    }

    mkg.updated_at = new Date().toISOString();

    // Disk write first — always succeeds or throws
    await writeMkg(companyId, mkg);

    // Supabase sync second — fire-and-forget, never blocks
    syncToSupabase(companyId, mkg).catch(() => {});

    return mkg;
  },

  /**
   * Returns true if a field is stale (confidence < 0.6, or age > 30 days, or past expires_at).
   * Returns false if the field was never set (value === null, confidence === 0).
   * Takes a field envelope object — caller must read the field first.
   *
   * @param {Object|null} fieldData — e.g. { value, confidence, last_verified, expires_at }
   * @returns {boolean}
   */
  isStale(fieldData) {
    // Never-set guard: empty is not stale
    if (!fieldData || fieldData.value === null || fieldData.confidence === 0) {
      return false;
    }

    // Low confidence = stale
    if (fieldData.confidence < STALE_CONFIDENCE_THRESHOLD) return true;

    // Past explicit expiry = stale
    if (fieldData.expires_at && new Date(fieldData.expires_at) < new Date()) return true;

    // Too old (last_verified > 30 days ago) = stale
    if (fieldData.last_verified) {
      const ageDays = (Date.now() - new Date(fieldData.last_verified).getTime()) / 86400000;
      if (ageDays > STALE_AGE_DAYS) return true;
    }

    return false;
  },

  /**
   * Returns array of field names that are stale for a company.
   * Empty array if all fields are fresh or unset.
   *
   * @param {string} companyId
   * @returns {Promise<string[]>}
   */
  async getExpiredFields(companyId) {
    const mkg = (await readMkg(companyId)) || createEmptyMkg(companyId);
    return TOP_LEVEL_FIELDS.filter((f) => this.isStale(mkg[f]));
  },
};
