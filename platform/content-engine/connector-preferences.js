/**
 * Per-workspace connector resource preferences
 * (Meta ad account, GA4 property, Google Ads customer, GSC site, etc.)
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREFS_DIR = join(__dirname, 'data/connector-preferences');

function prefsPath(companyId) {
  const safe = String(companyId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(PREFS_DIR, `${safe}.json`);
}

export function getConnectorPreferences(companyId) {
  if (!companyId) return {};
  try {
    const p = prefsPath(companyId);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch {
    return {};
  }
}

export function setConnectorPreferences(companyId, patch = {}) {
  if (!companyId) throw new Error('companyId required');
  if (!fs.existsSync(PREFS_DIR)) fs.mkdirSync(PREFS_DIR, { recursive: true });
  const current = getConnectorPreferences(companyId);
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    ),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(prefsPath(companyId), JSON.stringify(next, null, 2));
  return next;
}

export function getPreferredMetaAdAccountId(companyId) {
  const prefs = getConnectorPreferences(companyId);
  return prefs.meta_ads_account_id || null;
}

export function getPreferredGoogleAdsCustomerId(companyId) {
  const prefs = getConnectorPreferences(companyId);
  return prefs.google_ads_customer_id || null;
}

export function getPreferredGa4PropertyId(companyId) {
  const prefs = getConnectorPreferences(companyId);
  return prefs.ga4_property_id || null;
}

export function getPreferredGscSiteUrl(companyId) {
  const prefs = getConnectorPreferences(companyId);
  return prefs.gsc_site_url || null;
}

/** Preferred B2B lead-data provider: apollo | hunter | … */
export function getPreferredLeadDataProvider(companyId) {
  const prefs = getConnectorPreferences(companyId);
  return prefs.lead_data_provider || null;
}
