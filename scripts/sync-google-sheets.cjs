#!/usr/bin/env node

/**
 * Sync Enhanced Bulk Generator CSVs to a Google Spreadsheet.
 *
 * Usage (OAuth - Recommended for Railway):
 *   GOOGLE_CLIENT_ID="your-client-id" \
 *   GOOGLE_CLIENT_SECRET="your-client-secret" \
 *   GOOGLE_REFRESH_TOKEN="your-refresh-token" \
 *   node scripts/sync-google-sheets.cjs
 *
 * Usage (Service Account - Legacy):
 *   GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}' \
 *   node scripts/sync-google-sheets.cjs
 *
 * Requirements:
 *   - OAuth credentials OR service account with Sheets API access
 *   - The spreadsheet must be shared with your Google account or service account email
 *
 * The script reads every *.csv file under the specified csvDir
 * and uploads each as a sheet in the target spreadsheet, using the CSV
 * filename (without extension) as the sheet title.
 *
 * Existing sheets with the same name are cleared and replaced in full.
 * Sheets not present in the spreadsheet are created automatically.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { GoogleAuth } = require('google-auth-library');

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.SPREADSHEET_ID || '104GA_1AMKFgMEbEaU8oJHiP0hBX0fe8EmmQNt_ZnSC4';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Hardcoded credentials path (fallback if env var not set)
const HARDCODED_CREDENTIALS_PATH = '/Users/yogs87/Downloads/PL/website-project-473310-2de85d4e7a7c.json';

/**
 * Sync all CSV files to Google Sheets
 * @param {Object} options - Configuration options
 * @param {string} options.csvDir - Directory containing CSV files
 * @param {string} options.spreadsheetId - Google Sheets spreadsheet ID
 * @param {boolean} options.silent - Suppress console output (default: false)
 * @returns {Promise<Object>} Sync results with status
 */
async function syncToGoogleSheets(options = {}) {
  const csvDir = options.csvDir;
  const spreadsheetId = options.spreadsheetId || SPREADSHEET_ID;
  const silent = options.silent || false;

  if (!csvDir) {
    return { success: false, error: 'csvDir is required' };
  }

  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  try {
    let auth;

    log('🔍 Checking for credentials...');
    // Support both GOOGLE_REFRESH_TOKEN (new, with Docs+Sheets) and GOOGLE_SHEETS_REFRESH_TOKEN (legacy, Sheets-only)
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SHEETS_REFRESH_TOKEN;
    log(`   - OAuth tokens: ${refreshToken ? 'SET' : 'NOT SET'}`);
    log(`   - Service account JSON: ${process.env.GOOGLE_CREDENTIALS_JSON ? 'SET (length: ' + process.env.GOOGLE_CREDENTIALS_JSON.length + ')' : 'NOT SET'}`);
    log(`   - Service account file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'NOT SET'}`);
    log(`   - Hardcoded path exists: ${fs.existsSync(HARDCODED_CREDENTIALS_PATH)}`);

    // Priority 1: OAuth tokens (Recommended for Railway)
    if (refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      log('📝 Using OAuth refresh token (recommended for Railway)');
      auth = new GoogleAuth({
        credentials: {
          type: 'authorized_user',
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken
        },
        scopes: SCOPES
      });
      log('   ✓ OAuth credentials configured');
    }
    // Priority 2: Service account JSON (Legacy Railway support)
    else if (process.env.GOOGLE_CREDENTIALS_JSON) {
      log('📝 Using GOOGLE_CREDENTIALS_JSON environment variable');
      try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        log(`   ✓ Parsed JSON successfully`);
        log(`   ✓ Service account: ${credentials.client_email || 'unknown'}`);
        log(`   ✓ Project ID: ${credentials.project_id || 'unknown'}`);
        auth = new GoogleAuth({
          credentials,
          scopes: SCOPES
        });
        log('   ✓ GoogleAuth initialized');
      } catch (parseError) {
        log(`   ✗ Failed to parse GOOGLE_CREDENTIALS_JSON: ${parseError.message}`);
        throw new Error(`Invalid GOOGLE_CREDENTIALS_JSON: ${parseError.message}`);
      }
    }
    // Priority 3: Service account file path
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      log('📝 Using GOOGLE_APPLICATION_CREDENTIALS file path');
      auth = new GoogleAuth({ scopes: SCOPES });
    }
    // Priority 4: Hardcoded local path
    else if (fs.existsSync(HARDCODED_CREDENTIALS_PATH)) {
      log('📝 Using hardcoded credentials path (local dev)');
      process.env.GOOGLE_APPLICATION_CREDENTIALS = HARDCODED_CREDENTIALS_PATH;
      auth = new GoogleAuth({ scopes: SCOPES });
    }
    // No credentials available - fail gracefully
    else {
      log('⚠️  No Google credentials found. Sync skipped.');
      log('💡 For Railway: Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
      log('💡 Or set GOOGLE_CREDENTIALS_JSON for service account');
      return { success: true, skipped: true, reason: 'No credentials configured' };
    }

    log('🔗 Connecting to Google Sheets API...');
    const client = await auth.getClient();
    log('   ✓ Client authenticated successfully');

    log('📋 Fetching spreadsheet metadata...');
    log(`   - Spreadsheet ID: ${spreadsheetId}`);
    const spreadsheet = await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      method: 'GET'
    });
    log(`   ✓ Spreadsheet found: "${spreadsheet.data.properties?.title || 'Unknown'}"`);

    const existingSheets = new Map(
      (spreadsheet.data.sheets || []).map(sheet => [sheet.properties.title, sheet.properties.sheetId])
    );
    log(`   ✓ Found ${existingSheets.size} existing sheets`);

    log('📂 Scanning for CSV files...');
    log(`   - CSV directory: ${csvDir}`);
    
    if (!fs.existsSync(csvDir)) {
      log(`   ⚠️  CSV directory does not exist: ${csvDir}`);
      return { success: true, skipped: true, reason: 'CSV directory does not exist' };
    }

    const csvFiles = fs
      .readdirSync(csvDir)
      .filter(file => file.endsWith('.csv') && !file.endsWith('.bak') && !file.includes('.backup'));
    log(`   ✓ Found ${csvFiles.length} CSV files to sync`);

    if (csvFiles.length === 0) {
      log('⚠️  No CSV files found to sync.');
      return { success: true, syncedSheets: 0 };
    }

    let syncedCount = 0;
    const errors = [];

    for (const file of csvFiles) {
      const sheetName = path.basename(file, '.csv');
      const csvPath = path.join(csvDir, file);

      try {
        log(`\n📊 Processing "${file}"...`);
        const raw = fs.readFileSync(csvPath, 'utf8');
        log(`   ✓ Read CSV file (${raw.length} bytes)`);

        const rows = parse(raw, {
          columns: false,
          skip_empty_lines: false
        });
        log(`   ✓ Parsed ${rows.length} rows`);

        const values = rows.length > 0 ? rows : [[]];

        if (!existingSheets.has(sheetName)) {
          log(`   📄 Creating new sheet "${sheetName}"...`);
          await client.request({
            url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            method: 'POST',
            data: {
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: sheetName
                    }
                  }
                }
              ]
            }
          });
          log(`   ✓ Sheet created`);
        }

        const encodedSheetName = encodeURIComponent(sheetName);

        // Append mode: do NOT clear existing data. If the sheet already exists,
        // assume the header row is already present and append only data rows
        // to avoid duplicating headers. For a new sheet, append everything.
        const valuesToAppend = existingSheets.has(sheetName) ? values.slice(1) : values;

        if (valuesToAppend.length === 0) {
          log('   ℹ️  No new rows to append (header only). Skipping.');
          continue;
        }

        log(`   ➕ Appending ${valuesToAppend.length} rows...`);
        await client.request({
          url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheetName}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          method: 'POST',
          data: {
            values: valuesToAppend
          }
        });
        log(`   ✅ Synced successfully (append mode)!`);

        syncedCount++;
      } catch (fileError) {
        log(`   ❌ Error syncing "${sheetName}": ${fileError.message}`);
        errors.push({ file: sheetName, error: fileError.message });
      }
    }

    log(`\n✅ CSV sync completed successfully. Synced ${syncedCount}/${csvFiles.length} sheet(s).`);
    if (errors.length > 0) {
      log(`⚠️  ${errors.length} error(s) occurred:`);
      errors.forEach(e => log(`   - ${e.file}: ${e.error}`));
    }
    return { success: true, syncedSheets: syncedCount, errors: errors.length > 0 ? errors : undefined };

  } catch (error) {
    if (!silent) {
      console.error('❌ Sync failed:', error.message);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Get Google Sheets URL for a specific sheet
 * @param {string} sheetName - Name of the sheet (CSV filename without extension)
 * @param {string} spreadsheetId - Optional spreadsheet ID (defaults to SPREADSHEET_ID)
 * @returns {string} Direct URL to the sheet
 */
function getSheetUrl(sheetName, spreadsheetId = SPREADSHEET_ID) {
  // Get the sheet ID by encoding the sheet name
  const gid = 0; // Default to first sheet, could be enhanced to track actual sheet IDs
  const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  if (sheetName) {
    // URL with sheet name for better UX
    return `${baseUrl}/edit#gid=${gid}&range=A1`;
  }

  return `${baseUrl}/edit`;
}

/**
 * Get all sheet URLs mapped by CSV filename
 * @param {string} spreadsheetId - Optional spreadsheet ID (defaults to SPREADSHEET_ID)
 * @returns {Object} Map of sheet names to URLs
 */
function getAllSheetUrls(spreadsheetId = SPREADSHEET_ID) {
  if (!spreadsheetId) return {};
  
  const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return {
    'research-gaps': `${baseUrl}#gid=0`,
    'quick-wins': `${baseUrl}#gid=1`,
    'generated-topics': `${baseUrl}#gid=2`,
    'topic-research': `${baseUrl}#gid=3`,
    'created-content': `${baseUrl}#gid=4`,
    'published-content': `${baseUrl}#gid=5`,
    'workflow-status': `${baseUrl}#gid=6`,
    'master-research': `${baseUrl}#gid=7`,
    // Generic fallback
    'Spreadsheet': baseUrl,
    '_default': baseUrl
  };
}

// Export for module usage
module.exports = {
  syncToGoogleSheets,
  getSheetUrl,
  getAllSheetUrls,
  SPREADSHEET_ID
};

// CLI usage
async function main() {
  const csvDir = path.join(__dirname, '..', 'enhanced-bulk-generator-frontend', 'backend', 'data');
  const result = await syncToGoogleSheets({ csvDir });
  if (!result.success) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Sync failed:', err.message);
    process.exit(1);
  });
}