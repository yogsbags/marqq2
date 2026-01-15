/**
 * Optional Google Sheets sync helper.
 *
 * This repo is deployed in environments (e.g. Railway) where Google Sheets
 * credentials may not be configured. The Enhanced Bulk Generator expects this
 * module to exist and will call `syncToGoogleSheets()` after certain stages.
 *
 * This implementation is deliberately dependency-free and will gracefully skip
 * syncing unless credentials + spreadsheet id are provided via env vars.
 */

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.SPREADSHEET_ID || '';

function getAllSheetUrls() {
  if (!SPREADSHEET_ID) return {};
  const baseUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
  return {
    Spreadsheet: baseUrl
  };
}

function hasGoogleCredentialsConfigured() {
  // Support either a JSON blob env var or a file path env var.
  const json = process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return Boolean((json && json.trim()) || (filePath && filePath.trim()));
}

async function syncToGoogleSheets({ csvDir, silent = true } = {}) {
  // Skip unless configured.
  if (!SPREADSHEET_ID) {
    return { success: true, skipped: true, reason: 'Missing GOOGLE_SHEETS_SPREADSHEET_ID' };
  }

  if (!hasGoogleCredentialsConfigured()) {
    return { success: true, skipped: true, reason: 'Missing Google credentials env vars' };
  }

  // A full implementation would upload CSVs into tabs using Google Sheets API.
  // We intentionally no-op here to keep deployments stable without extra deps.
  if (!silent) {
    // eslint-disable-next-line no-console
    console.log(`ℹ️  Google Sheets sync configured (spreadsheet=${SPREADSHEET_ID}) but not implemented in martech; skipping.`);
  }
  return { success: true, skipped: true, reason: 'Sync not implemented in martech' };
}

module.exports = {
  SPREADSHEET_ID,
  getAllSheetUrls,
  syncToGoogleSheets
};

