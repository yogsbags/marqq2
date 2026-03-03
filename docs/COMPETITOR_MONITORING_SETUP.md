# Competitor Activity Monitoring System - Setup Guide

Complete implementation of automated competitor intelligence with n8n workflow, real-time alerts, and Groq Compound web scraping.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    COMPETITOR MONITORING FLOW                 │
└──────────────────────────────────────────────────────────────┘

n8n Workflow (Daily 9 AM)
  ↓
1. Fetch Monitoring Configs from Supabase
   (Which competitors to track?)
  ↓
2. For Each Competitor:
   → Groq Compound Web Search (last 24h news)
   → Parse JSON response
   → Generate content hash for deduplication
  ↓
3. POST to Backend Webhook
   → Check deduplication table
   → Find users monitoring this competitor
   → Filter by alert_type preferences
   → Create alerts for relevant users
  ↓
4. Supabase Real-Time Push
   → Instant notifications in frontend
   → Badge count updates
   → Alert panel populates
```

## 1. Database Setup (Supabase)

### Step 1: Run SQL Migration

Execute the SQL migration file to create required tables:

```bash
# Location: supabase-migrations/competitor-alerts.sql

# Tables created:
# - competitor_alerts: Stores all alerts
# - competitor_monitoring_config: User preferences for which competitors to monitor
# - alert_deduplication: Global deduplication tracking
```

**In Supabase Dashboard:**
1. Go to SQL Editor
2. Copy contents of `supabase-migrations/competitor-alerts.sql`
3. Click "Run" to execute migration
4. Verify tables exist in Table Editor

### Step 2: Enable Realtime for `competitor_alerts`

```sql
-- Enable realtime for alerts table
ALTER PUBLICATION supabase_realtime ADD TABLE competitor_alerts;
```

**In Supabase Dashboard:**
1. Go to Database > Replication
2. Enable realtime for `competitor_alerts` table
3. Click "Save"

### Step 3: Add Sample Monitoring Configuration

```sql
-- Replace YOUR_USER_ID with actual user ID from auth.users table
INSERT INTO competitor_monitoring_config (user_id, competitor_name, competitor_domain, industry, enabled, keywords)
VALUES
  ('YOUR_USER_ID', 'HubSpot', 'hubspot.com', 'B2B Marketing Technology', TRUE, ARRAY['Sales Hub', 'Marketing Hub']),
  ('YOUR_USER_ID', 'Salesforce', 'salesforce.com', 'CRM', TRUE, ARRAY['Sales Cloud', 'Marketing Cloud']),
  ('YOUR_USER_ID', 'Marketo', 'marketo.com', 'Marketing Automation', TRUE, ARRAY['Engagement Platform'])
ON CONFLICT (user_id, competitor_name) DO NOTHING;
```

**Get your user ID:**
```sql
SELECT id FROM auth.users WHERE email = 'your@email.com';
```

## 2. Backend API Setup

### Environment Variables

Add to `.env`:

```bash
# Supabase (already configured)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key  # For webhook authentication

# Groq API (already configured)
GROQ_API_KEY=gsk_your_groq_api_key
```

### API Endpoints Added

The following endpoints are now available in `backend-server.js`:

1. **GET `/api/competitor-alerts`** - Fetch all alerts for authenticated user
   - Requires: Authorization header with Supabase JWT
   - Returns: `{ alerts: [...], unreadCount: number }`

2. **POST `/api/competitor-alerts/mark-read`** - Mark alerts as read
   - Body: `{ alertIds: string[] }`
   - Returns: `{ success: true, markedCount: number }`

3. **POST `/api/competitor-alerts/archive`** - Archive alerts
   - Body: `{ alertIds: string[] }`
   - Returns: `{ success: true, archivedCount: number }`

4. **POST `/api/competitor-alerts/webhook`** - n8n webhook endpoint (public)
   - Body: Full alert object from n8n
   - Handles deduplication and user targeting
   - Returns: `{ success: true, alertsCreated: number }`

5. **GET `/api/competitor-monitoring/config`** - Get monitoring config
   - Returns: `{ configs: [...] }`

6. **POST `/api/competitor-monitoring/config`** - Update monitoring config
   - Body: Monitoring configuration object
   - Returns: `{ success: true, config: {...} }`

### Test Backend Webhook

```bash
# Test webhook endpoint
curl -X POST http://localhost:3006/api/competitor-alerts/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "competitor_name": "HubSpot",
    "alert_type": "funding",
    "title": "HubSpot Raises $100M Series D",
    "summary": "HubSpot announced a $100M Series D funding round led by XYZ Ventures.",
    "full_content": "Full article content here...",
    "source_url": "https://techcrunch.com/hubspot-funding",
    "source_domain": "techcrunch.com",
    "published_at": "2025-02-07T10:30:00Z",
    "sentiment": "positive",
    "priority": "high",
    "content_hash": "abc123def456"
  }'
```

## 3. n8n Workflow Setup

### Step 1: Install n8n

```bash
# Option 1: Docker (Recommended)
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=your_password \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Option 2: npm
npm install -g n8n
n8n start
```

### Step 2: Import Workflow

1. Open n8n UI at http://localhost:5678
2. Click "Import" → "From File"
3. Select `n8n-workflows/competitor-monitoring-workflow.json`
4. Click "Import"

### Step 3: Configure Environment Variables in n8n

Add environment variables in n8n Settings:

```env
BACKEND_API_URL=http://your-backend-url:3006
SUPABASE_ANON_KEY=your-supabase-anon-key
```

**For local development:**
```env
BACKEND_API_URL=http://host.docker.internal:3006  # If n8n in Docker
BACKEND_API_URL=http://localhost:3006            # If n8n via npm
```

### Step 4: Configure Groq Credentials

1. Click "Credentials" in n8n sidebar
2. Click "Create New" → "Groq API"
3. Name: "Groq API"
4. API Key: `gsk_your_groq_api_key`
5. Save

### Step 5: Activate Workflow

1. Open imported workflow
2. Click "Settings" tab
3. Enable "Active" toggle
4. Click "Save"

### Step 6: Test Workflow

```bash
# Manual execution
1. Click "Execute Workflow" button in n8n
2. Watch execution in real-time
3. Check Supabase for new alerts
4. Check frontend notifications panel
```

## 4. Frontend Integration

### Already Implemented

The NotificationsPanel component has been updated to:

- ✅ Fetch competitor alerts from Supabase
- ✅ Real-time subscription for new alerts
- ✅ Display alert type icons (funding, product launch, pricing, etc.)
- ✅ Priority badges (critical, high, medium, low)
- ✅ Sentiment indicators (positive, neutral, negative)
- ✅ Mark as read/unread functionality
- ✅ Archive alerts
- ✅ External link to source article
- ✅ Navigate to Company Intelligence config

### How to Use

1. **View Alerts**: Click bell icon in top-right navbar
2. **Filter**: Switch between "All" and "Unread" tabs
3. **Read Alert**: Click anywhere on alert card
4. **View Source**: Click external link icon (appears on hover)
5. **Mark Unread**: Click chart icon (appears on hover)
6. **Archive**: Click trash icon (appears on hover)
7. **Configure**: Click "Configure" button in footer → Goes to Company Intelligence module

## 5. Workflow Customization

### Change Schedule

Edit the "Schedule Trigger" node in n8n:

```javascript
// Default: Daily at 9 AM
"0 9 * * *"

// Every 6 hours
"0 */6 * * *"

// Twice daily (9 AM and 9 PM)
"0 9,21 * * *"

// Every Monday at 9 AM
"0 9 * * 1"
```

### Add More Competitors

Via Company Intelligence module (frontend):
1. Go to Company Intelligence → Competitor Analysis
2. Click "Add Competitor to Monitoring"
3. Fill in details:
   - Competitor name
   - Domain
   - Industry
   - Alert types to track
   - Keywords
4. Save

Via SQL (backend):
```sql
INSERT INTO competitor_monitoring_config (
  user_id,
  competitor_name,
  competitor_domain,
  industry,
  enabled,
  alert_types,
  keywords
) VALUES (
  'YOUR_USER_ID',
  'Zoho',
  'zoho.com',
  'B2B SaaS',
  TRUE,
  ARRAY['news', 'funding', 'product_launch', 'pricing_change'],
  ARRAY['Zoho CRM', 'Zoho One']
);
```

### Customize Alert Types

Edit monitoring config to filter alert types:

```typescript
// Alert types available:
- 'news'              // General news mentions
- 'funding'           // Fundraising announcements
- 'product_launch'    // New product releases
- 'pricing_change'    // Pricing updates
- 'acquisition'       // M&A activity
- 'partnership'       // Strategic partnerships
- 'leadership_change' // Executive changes
- 'other'            // Miscellaneous

// Update via frontend or SQL
UPDATE competitor_monitoring_config
SET alert_types = ARRAY['funding', 'product_launch', 'acquisition']
WHERE competitor_name = 'HubSpot' AND user_id = 'YOUR_USER_ID';
```

### Adjust Priority Thresholds

Edit n8n workflow "Parse and Transform Activities" node:

```javascript
// Customize priority logic
const priority =
  activity.alert_type === 'funding' || activity.alert_type === 'acquisition'
    ? 'critical'
    : activity.alert_type === 'product_launch' || activity.alert_type === 'pricing_change'
    ? 'high'
    : activity.alert_type === 'partnership' || activity.alert_type === 'leadership_change'
    ? 'medium'
    : 'low';
```

## 6. Cost Estimates

### Groq Compound Web Tools

- **Web Search (basic)**: $5 per 1,000 requests
- **Visit Website**: $1 per 1,000 requests

**Daily Monitoring Example:**
- 5 competitors monitored
- 1 workflow run per day
- ~3 web searches per competitor = 15 searches
- ~1 website visit per competitor = 5 visits

**Monthly Cost:**
- Searches: 15 * 30 = 450 searches = $2.25/month
- Website visits: 5 * 30 = 150 visits = $0.15/month
- **Total: ~$2.40/month for 5 competitors**

### Scaling to 50 Competitors

- 50 competitors * 3 searches = 150 searches/day
- Monthly cost: ~$22.50/month
- Still **98% cheaper** than traditional competitive intelligence tools ($500-5000/month)

## 7. Monitoring & Maintenance

### View Workflow Execution History

n8n Dashboard:
1. Click "Executions" tab
2. Filter by workflow
3. View successful/failed executions
4. Debug failed runs

### Check Alert Deduplication

```sql
-- View recent deduplications
SELECT competitor_name, title, seen_count, first_seen_at
FROM alert_deduplication
ORDER BY first_seen_at DESC
LIMIT 20;

-- Clean up old records (auto-runs via cron)
SELECT cleanup_old_deduplication_records();
```

### Monitor Alert Volume

```sql
-- Alerts created today
SELECT competitor_name, COUNT(*) as alert_count
FROM competitor_alerts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY competitor_name
ORDER BY alert_count DESC;

-- Alert types distribution
SELECT alert_type, COUNT(*) as count
FROM competitor_alerts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY alert_type
ORDER BY count DESC;
```

## 8. Troubleshooting

### No alerts appearing?

1. **Check monitoring config**
   ```sql
   SELECT * FROM competitor_monitoring_config WHERE enabled = TRUE;
   ```

2. **Run workflow manually in n8n**
   - Click "Execute Workflow"
   - Check each node's output

3. **Verify Groq Compound response**
   - Check "Search Competitor News" node output
   - Ensure JSON is valid

4. **Check deduplication**
   ```sql
   SELECT * FROM alert_deduplication ORDER BY first_seen_at DESC LIMIT 10;
   ```

### Webhook errors?

1. **Check backend logs**
   ```bash
   # If using backend-server.js
   tail -f logs/backend.log
   ```

2. **Verify Supabase connection**
   ```javascript
   // Test in browser console
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(url, key);
   const { data } = await supabase.from('competitor_alerts').select('*').limit(1);
   console.log(data);
   ```

3. **Test webhook directly**
   ```bash
   curl -X POST http://localhost:3006/api/competitor-alerts/webhook \
     -H "Content-Type: application/json" \
     -d '{"competitor_name":"Test","alert_type":"news","title":"Test","summary":"Test","source_url":"https://example.com","content_hash":"test123"}'
   ```

### Real-time not working?

1. **Check Supabase realtime enabled**
   - Database → Replication → competitor_alerts should be enabled

2. **Verify subscription in browser console**
   ```javascript
   // Should see connection logs
   [Real-time] New competitor alert: {...}
   ```

3. **Check network tab**
   - Should see WebSocket connection to Supabase

## 9. Advanced Features (Future Enhancements)

### Email Digest (Weekly)

Add n8n workflow node to send weekly email digest:
```javascript
// Filter: alert_frequency = 'weekly_digest'
// Send via SendGrid/Postmark/AWS SES
```

### Slack Integration

Add n8n webhook to Slack:
```javascript
// For critical/high priority alerts
// POST to Slack webhook URL
```

### AI Summary Generation

Add Groq LLM summarization node:
```javascript
// Aggregate weekly alerts per competitor
// Generate executive summary
// Email to user
```

### Trend Analysis

Add SQL queries for trending competitors:
```sql
-- Most active competitors this week
SELECT
  competitor_name,
  COUNT(*) as activity_count,
  JSON_AGG(alert_type) as types
FROM competitor_alerts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY competitor_name
ORDER BY activity_count DESC;
```

## 10. Support & Resources

- **Groq Compound Docs**: https://console.groq.com/docs/compound/systems/compound
- **n8n Documentation**: https://docs.n8n.io/
- **Supabase Realtime**: https://supabase.com/docs/guides/realtime
- **GitHub Issues**: Report bugs and feature requests

---

**Implementation Status**: ✅ Complete

- ✅ Database schema & RLS policies
- ✅ Backend API endpoints with webhook
- ✅ n8n workflow with Groq Compound
- ✅ Real-time frontend notifications
- ✅ Deduplication system
- ✅ User preference management

**Next Steps**:
1. Run SQL migration in Supabase
2. Configure n8n workflow
3. Add competitors to monitor
4. Start receiving alerts!
