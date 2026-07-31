/**
 * MKGService — Marketing Knowledge Graph read/write layer.
 *
 * Disk-first: writes to platform/agent-runtime/memory/{companyId}/mkg.json
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
import { getSupabaseReadClient, getSupabaseWriteClient } from "./supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// MKG files live at: platform/agent-runtime/memory/{companyId}/mkg.json
const MKG_ROOT = join(__dirname, "..", "agent-runtime", "memory");

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

const workspaceCompanyIdCache = new Map();

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

async function resolveCompanyIdForRead(companyId) {
  const client = getSupabaseReadClient();
  if (!companyId || !client) return null;
  if (workspaceCompanyIdCache.has(companyId)) {
    return workspaceCompanyIdCache.get(companyId);
  }

  try {
    const { data, error } = await client
      .from("companies")
      .select("id")
      .eq("workspace_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      workspaceCompanyIdCache.set(companyId, null);
      return null;
    }

    const resolvedId = data?.id || null;
    workspaceCompanyIdCache.set(companyId, resolvedId);
    return resolvedId;
  } catch {
    workspaceCompanyIdCache.set(companyId, null);
    return null;
  }
}

async function readMkgWithWorkspaceFallback(companyId) {
  const direct = await readMkg(companyId);
  const normalizedDirect = direct ? normalizeMkgDocument(companyId, direct) : null;
  if (normalizedDirect && hasMeaningfulMkgData(normalizedDirect)) return normalizedDirect;

  // The database copy is the durable fallback when the runtime filesystem has
  // been replaced or the service is running on a fresh instance.
  const client = getSupabaseReadClient();
  if (client) {
    try {
      const { data, error } = await client
        .from("company_mkg")
        .select("company_id, mkg_data, updated_at")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!error && data?.mkg_data) {
        const remote = normalizeMkgDocument(companyId, data.mkg_data);
        if (hasMeaningfulMkgData(remote)) return remote;
      }
    } catch { /* filesystem/workspace fallback below */ }
  }

  const resolvedCompanyId = await resolveCompanyIdForRead(companyId);
  if (!resolvedCompanyId || resolvedCompanyId === companyId) return normalizedDirect;

  const resolved = await readMkg(resolvedCompanyId);
  const normalizedResolved = resolved ? normalizeMkgDocument(resolvedCompanyId, resolved) : null;
  if (normalizedResolved && hasMeaningfulMkgData(normalizedResolved)) return normalizedResolved;
  if (client && resolvedCompanyId) {
    try {
      const { data } = await client
        .from("company_mkg")
        .select("mkg_data")
        .eq("company_id", resolvedCompanyId)
        .maybeSingle();
      if (data?.mkg_data) return normalizeMkgDocument(companyId, data.mkg_data);
    } catch { /* return local envelope */ }
  }
  return normalizedDirect || normalizedResolved;
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

function hasMeaningfulMkgData(mkg) {
  if (!mkg || typeof mkg !== "object") return false;
  return TOP_LEVEL_FIELDS.some((field) => {
    const entry = mkg[field];
    return entry && typeof entry === "object" && entry.value != null;
  });
}

function isEnvelopeFieldKey(key) {
  return ["value", "confidence", "last_verified", "source_agent", "expires_at"].includes(key);
}

function normalizeStructuredValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => normalizeStructuredValue(item));
  if (typeof value !== "object") return value;

  const entries = Object.entries(value);
  const numericEntries = entries.filter(([key]) => /^\d+$/.test(key));
  const namedEntries = entries.filter(([key]) => !/^\d+$/.test(key));

  const normalizeNumericEntries = () => {
    const sortedValues = numericEntries
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, entryValue]) => normalizeStructuredValue(entryValue));
    const allScalar = sortedValues.every((entryValue) => entryValue == null || typeof entryValue !== "object");
    return allScalar ? sortedValues.join("") : sortedValues;
  };

  if (numericEntries.length && namedEntries.length) {
    const collapsed = normalizeNumericEntries();
    const namedObject = Object.fromEntries(
      namedEntries.map(([key, entryValue]) => [key, normalizeStructuredValue(entryValue)])
    );
    if (typeof collapsed === "string" && collapsed.trim()) {
      return { summary: collapsed, ...namedObject };
    }
    return { items: collapsed, ...namedObject };
  }

  if (numericEntries.length) {
    return normalizeNumericEntries();
  }

  return Object.fromEntries(
    namedEntries.map(([key, entryValue]) => [key, normalizeStructuredValue(entryValue)])
  );
}

function normalizeFieldEnvelope(fieldData) {
  if (fieldData == null) {
    return { ...FIELD_DEFAULTS };
  }

  if (Array.isArray(fieldData)) {
    return { ...FIELD_DEFAULTS, value: fieldData };
  }

  if (typeof fieldData !== "object") {
    return { ...FIELD_DEFAULTS, value: fieldData };
  }

  const next = {
    ...FIELD_DEFAULTS,
    ...fieldData,
  };

  const extraEntries = Object.entries(fieldData).filter(([key]) => !isEnvelopeFieldKey(key));
  if (next.value == null && extraEntries.length > 0) {
    const numericOnly = extraEntries.every(([key]) => /^\d+$/.test(key));
    if (numericOnly) {
      const sortedValues = extraEntries
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, entryValue]) => normalizeStructuredValue(entryValue));
      const allScalar = sortedValues.every((entryValue) => entryValue == null || typeof entryValue !== "object");
      next.value = allScalar ? sortedValues.join("") : sortedValues;
    } else {
      next.value = Object.fromEntries(extraEntries);
    }
  }

  next.confidence = Number.isFinite(Number(next.confidence))
    ? Math.min(1, Math.max(0, Number(next.confidence)))
    : 0;

  return {
    value: normalizeStructuredValue(next.value),
    confidence: next.confidence,
    last_verified: next.last_verified ?? null,
    source_agent: next.source_agent ?? null,
    expires_at: next.expires_at ?? null,
  };
}

function normalizeMkgDocument(companyId, rawMkg) {
  const base = createEmptyMkg(companyId);
  if (!rawMkg || typeof rawMkg !== "object") return base;

  const normalized = {
    ...base,
    company_id: typeof rawMkg.company_id === "string" ? rawMkg.company_id : companyId,
    updated_at: typeof rawMkg.updated_at === "string" ? rawMkg.updated_at : base.updated_at,
  };

  for (const field of TOP_LEVEL_FIELDS) {
    normalized[field] = normalizeFieldEnvelope(rawMkg[field]);
  }

  return normalized;
}

/**
 * Sync to Supabase after a disk write.
 * Fire-and-forget: logs errors but never throws — disk is source of truth.
 */
async function syncToSupabase(companyId, mkg) {
  const client = getSupabaseWriteClient();
  if (!client) return;
  try {
    const { error } = await client
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
    const mkg = normalizeMkgDocument(
      companyId,
      (await readMkgWithWorkspaceFallback(companyId)) || createEmptyMkg(companyId)
    );
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

    const mkg = normalizeMkgDocument(companyId, (await readMkg(companyId)) || createEmptyMkg(companyId));

    for (const [field, fieldData] of Object.entries(patch)) {
      // Ignore unknown fields — only merge known TOP_LEVEL_FIELDS
      if (!TOP_LEVEL_FIELDS.includes(field)) {
        console.warn(`MKGService.patch: ignoring unknown field "${field}"`);
        continue;
      }
      mkg[field] = normalizeFieldEnvelope({
        ...(mkg[field] || { ...FIELD_DEFAULTS }),
        ...normalizeFieldEnvelope(fieldData),
      });
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
    const mkg = (await readMkgWithWorkspaceFallback(companyId)) || createEmptyMkg(companyId);
    return TOP_LEVEL_FIELDS.filter((f) => this.isStale(mkg[f]));
  },
};
