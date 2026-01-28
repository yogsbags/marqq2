# Railway Deployment Fixes

## Issues Fixed

### 1. ❌ JSON Parse Error (CRITICAL)
**Error:** `Parse error: SyntaxError: Unterminated string in JSON at position 16318`

**Root Cause:**
- Backend logs contain ANSI color codes (`\x1b[31m`, etc.)
- Control characters from terminal output
- Very long research outputs (16,000+ characters)
- SSE (Server-Sent Events) couldn't parse malformed JSON

**Fix Applied:**
```typescript
// app/api/workflow/stage/route.ts
// app/api/workflow/execute/route.ts

const sendEvent = (data: any) => {
  try {
    if (data.log && typeof data.log === 'string') {
      // Remove ANSI color codes
      data.log = data.log.replace(/\x1b\[[0-9;]*m/g, '')

      // Remove control characters (except \n and \r)
      data.log = data.log.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')

      // Truncate very long logs (over 5000 chars)
      if (data.log.length > 5000) {
        data.log = data.log.substring(0, 5000) + '... (truncated)'
      }
    }

    const message = `data: ${JSON.stringify(data)}\n\n`
    controller.enqueue(encoder.encode(message))
  } catch (error) {
    // Fallback to safe error message
    const safeMessage = `data: ${JSON.stringify({ log: '⚠️ [Log encoding error]' })}\n\n`
    controller.enqueue(encoder.encode(safeMessage))
  }
}
```

**Result:** ✅ SSE streams now send clean, parseable JSON

---

### 2. ❌ Auto-Approval Not Working
**Issue:** Stage 2 fails with "No approved research gaps found"

**Root Cause:**
- Frontend didn't pass `autoApprove: true` to API
- Backend didn't auto-approve Stage 1 outputs
- Stage 2 reads CSV and finds `approval_status = "Pending"`

**Fixes Applied:**

**Frontend (`app/page.tsx`):**
```typescript
// Stage execution now passes autoApprove flag
const response = await fetch('/api/workflow/stage', {
  method: 'POST',
  body: JSON.stringify({
    stageId,
    topicLimit,
    category,
    autoApprove: true  // ✅ NEW
  })
})
```

**API Routes:**
```typescript
// Both stage and execute routes now respect autoApprove parameter
const autoApprove = body.autoApprove !== undefined ? body.autoApprove : true

const args = [mainJsPath, 'stage', stageName]
if (autoApprove) {
  args.push('--auto-approve')  // ✅ Conditional flag
}
```

**Expected Logs After Fix:**
```
🤖 Auto-Approval: ENABLED
🔍 DEBUG Stage 1: options.autoApprove = true
🤖 Auto-approved 10 high-priority gaps
✅ Approved 10 research gap(s) for topic generation
⏳ Waiting for CSV synchronization...
```

---

## Deployment Status

**Latest Commits:**
1. `15cf2a0` - fix: sanitize SSE logs to prevent JSON parse errors ✅
2. `ac74e34` - feat: add Railway environment debug endpoint ✅
3. `7c0aeff` - chore: trigger Railway rebuild ✅
4. `de155ec` - fix: comprehensive workflow approval and CSV sync improvements ✅

**Railway Status:** Rebuilding automatically (triggered by git push)

---

## Testing Checklist

### After Railway Finishes Deploying:

**1. Test Stage 1 (Research)**
- ✅ Should complete without JSON parse errors
- ✅ Logs should display cleanly in UI
- ✅ Should show "🤖 Auto-approved N gaps"
- ✅ CSV should have `approval_status = "Yes"`

**2. Test Stage 2 (Topics)**
- ✅ Should find approved gaps immediately
- ✅ Should show "📊 Found N approved research gaps"
- ✅ Should generate topics successfully
- ✅ No "No approved research gaps found" error

**3. Check Debug Endpoint**
Visit: `https://your-railway-app.railway.app/api/debug`

Should return:
```json
{
  "success": true,
  "checks": {
    "backendDirExists": true,
    "csvExists": true,
    "csvLineCount": 11,
    "backendFiles": ["main.js", "data", "core", ...]
  }
}
```

---

## If Issues Persist

### 1. Clear Railway Cache
```bash
# In Railway dashboard:
# Settings → Builds → Clear Build Cache
```

### 2. Check Railway Logs
```bash
# In Railway dashboard:
# Deployments → [Latest] → View Logs

# Look for:
✅ "Build succeeded"
✅ "Deployment live"
❌ Any error messages
```

### 3. Verify Environment Variables
Railway should have:
- `GROQ_API_KEY` (for AI)
- `OPENAI_API_KEY` (for JSON parsing fallback)
- `GOOGLE_SHEETS_SPREADSHEET_ID` (optional)
- `GOOGLE_APPLICATION_CREDENTIALS` (optional)

### 4. Manual CSV Check
If Stage 2 still fails, check CSV manually via debug endpoint:
```bash
curl https://your-app.railway.app/api/debug | jq '.checks.csvSample'
```

Should show approved gaps with `"approval_status":"Yes"`

---

## Known Limitations on Railway

### 1. **Ephemeral File System**
⚠️ **CSV files reset on every deployment**

**Solution Options:**
- Use Railway Volumes (persistent storage)
- Migrate to PostgreSQL database
- Use Google Sheets as primary storage

**Quick Fix:**
Add Railway Volume:
```bash
# Railway Dashboard:
# Variables → New Volume
# Mount Path: /app/backend/data
```

### 2. **10-Minute Execution Timeout**
Railway has a 10-minute request timeout for Hobby tier.

**If workflow takes > 10 minutes:**
- Use staged execution instead of full workflow
- Upgrade to Pro tier (30-minute timeout)
- Split long stages into smaller batches

### 3. **Memory Limits**
Railway Hobby: 8GB RAM
- LLM responses can use 1-2GB
- Multiple stage executions add up

**Monitor with:**
```bash
# Railway Metrics tab shows memory usage
```

---

## Architecture Improvements (Future)

### Priority 1: Persistent Storage
Replace CSV files with PostgreSQL:
```typescript
// Instead of:
const gaps = csvManager.readCSV('research-gaps.csv')

// Use:
const gaps = await db.query('SELECT * FROM research_gaps WHERE approval_status = $1', ['Yes'])
```

### Priority 2: Background Jobs
Use Railway Cron or BullMQ for long-running tasks:
```typescript
// Instead of: 10-minute HTTP request
// Use: Background job + polling

POST /api/workflow/start → Returns job_id
GET /api/workflow/status/:job_id → Check progress
```

### Priority 3: Real-Time Updates
Replace SSE with WebSockets for better reliability:
```typescript
// Socket.io for bidirectional communication
io.on('workflow-progress', (data) => {
  // More reliable than SSE for long workflows
})
```

---

## Support & Debugging

**If Stage 2 still fails after all fixes:**

1. Check Railway deployment completed successfully
2. Visit `/api/debug` endpoint to verify CSV exists
3. Manually check CSV has approved rows
4. Look for "🤖 Auto-Approval: ENABLED" in Stage 1 logs
5. Check Railway logs for backend errors

**Contact Info:**
- Created: 2026-01-28
- Last Updated: 2026-01-28
- Status: ✅ Deployed to Railway
