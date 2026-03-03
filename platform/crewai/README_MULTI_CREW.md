# CrewAI Multi-Module Backend - Quick Start

## Architecture Overview

The backend now supports **multiple specialized crews** with automatic routing:

```
User Request → Orchestrator → Detect Module → Route to Crew → Execute Workflow
```

**Current Modules:**
- ✅ **Competitor Intelligence** (4 agents)
- 🚧 **Content Automation** (coming soon)
- 🚧 **Lead Intelligence** (coming soon
- 🚧 **Social Media Campaign** (coming soon)
- 🚧 **Video Generation** (coming soon)
- 🚧 **Company Intelligence** (coming soon)
- 🚧 **Unified Customer View** (coming soon)
- 🚧 **Budget Optimization** (coming soon)
- 🚧 **Performance Scorecard** (coming soon)

## New API Endpoints

### 1. Unified Execute Endpoint (Smart Routing)

```bash
POST /api/crewai/execute

# Auto-detect module from request
curl -X POST http://localhost:8002/api/crewai/execute \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Find competitors for Salesforce in CRM market",
    "region": "global",
    "enable_monitoring": true
  }'

# Explicit module specification
curl -X POST http://localhost:8002/api/crewai/execute \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Analyze HubSpot competitors",
    "module": "competitor",
    "company_name": "HubSpot",
    "region": "global"
  }'
```

### 2. Parallel Multi-Crew Execution

```bash
POST /api/crewai/execute-parallel

# Execute multiple workflows simultaneously
curl -X POST http://localhost:8002/api/crewai/execute-parallel \
  -H "Content-Type": application/json" \
  -d '{
    "requests": [
      {
        "user_request": "Analyze Salesforce competitors",
        "module": "competitor"
      },
      {
        "user_request": "Generate blog about CRM best practices",
        "module": "content"
      }
    ]
  }'
```

### 3. Get Available Modules

```bash
GET /api/crewai/modules

curl http://localhost:8002/api/crewai/modules
```

Response:
```json
{
  "modules": {
    "competitor": {
      "name": "competitor",
      "status": "available",
      "agents": [...]
    }
  },
  "count": 1
}
```

### 4. Module-Specific Endpoints

```bash
# Competitor Intelligence
POST /api/crewai/competitor/analyze?company_name=Salesforce&region=global

# Content Automation (coming soon)
POST /api/crewai/content/generate

# Lead Intelligence (coming soon)
POST /api/crewai/lead/score

# Social Media (coming soon)
POST /api/crewai/social/campaign
```

## Module Auto-Detection Examples

The orchestrator uses Groq LLM to detect the appropriate module:

| User Request | Detected Module |
|--------------|-----------------|
| "Find competitors for Salesforce" | `competitor` |
| "Generate blog about mutual funds" | `content` |
| "Score these leads" | `lead` |
| "Create LinkedIn campaign" | `social` |
| "Generate product demo video" | `video` |
| "Analyze company tech stack" | `company` |
| "Show customer journey" | `customer` |
| "Optimize marketing budget" | `budget` |
| "Create performance dashboard" | `scorecard` |

## Project Structure Changes

```
crewai-backend/
├── crews/                        # NEW: Modular crew organization
│   ├── __init__.py
│   ├── competitor_intelligence.py   # Moved from crew.py
│   ├── content_automation.py        # Coming soon
│   ├── lead_intelligence.py         # Coming soon
│   └── ...                          # 6 more crews
├── tools/
│   ├── shared/                   # NEW: Shared across all crews
│   │   ├── __init__.py
│   │   ├── groq_web_search.py
│   │   ├── supabase_tool.py
│   │   └── n8n_trigger_tool.py
│   └── specialized/              # NEW: Module-specific tools
│       ├── __init__.py
│       ├── wordpress_tool.py     # For content crew
│       ├── veo_tool.py           # For video crew
│       └── ...
├── config/
│   ├── agents/                   # NEW: Module-specific agent configs
│   │   ├── competitor.yaml
│   │   ├── content.yaml          # Coming soon
│   │   └── ...
│   └── tasks/                    # NEW: Module-specific task configs
│       ├── competitor.yaml
│       ├── content.yaml          # Coming soon
│       └── ...
├── orchestrator.py               # NEW: Multi-crew router
├── main.py                       # Updated: Uses orchestrator
└── README.md                     # Original README
```

## Migration from Old API

### Old Endpoint (Still Works)
```bash
POST /api/crewai/execute-workflow
```

### New Endpoint (Recommended)
```bash
POST /api/crewai/execute
```

**Backward Compatibility**: The old endpoint redirects to the new one, so existing integrations continue to work.

## Adding a New Crew

See `EXTENSION_ARCHITECTURE.md` for detailed instructions.

**Quick Steps:**
1. Create `crews/new_module.py`
2. Create `config/agents/new_module.yaml`
3. Create `config/tasks/new_module.yaml`
4. Add crew to `orchestrator.py` in `_initialize_crews()`
5. Update module detection prompt in orchestrator
6. Create module-specific tools in `tools/specialized/`

## Development Workflow

### 1. Start Backend
```bash
./start.sh
# or
python main.py
```

### 2. Test Module Auto-Detection
```bash
# The orchestrator will auto-detect "competitor" module
curl -X POST http://localhost:8002/api/crewai/execute \
  -H "Content-Type: application/json" \
  -d '{"user_request": "Find Slack competitors"}'
```

### 3. Check Available Modules
```bash
curl http://localhost:8002/api/crewai/modules
```

### 4. View API Docs
Open http://localhost:8002/docs

## Frontend Integration

### TypeScript Client (Updated)

```typescript
// src/services/crewAIService.ts
class CrewAIService {
  private baseUrl = 'http://localhost:8002/api/crewai';

  // New unified method with auto-detection
  async execute(userRequest: string, module?: string, options?: any) {
    return fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_request: userRequest,
        module,  // Optional: let orchestrator detect if not provided
        ...options
      })
    });
  }

  // Execute multiple workflows in parallel
  async executeParallel(requests: Array<{userRequest: string, module?: string}>) {
    return fetch(`${this.baseUrl}/execute-parallel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
  }

  // Get available modules
  async getModules() {
    const response = await fetch(`${this.baseUrl}/modules`);
    return response.json();
  }

  // Legacy method (backward compatible)
  async executeCompetitorAnalysis(companyName: string, region: string = 'global') {
    return this.execute(
      `Analyze competitors for ${companyName}`,
      'competitor',
      { company_name: companyName, region }
    );
  }
}

export const crewAI = new CrewAIService();
```

### Usage Example

```typescript
// Auto-detect module
const result = await crewAI.execute(
  "Find competitors for Salesforce in CRM market"
);

// Explicit module
const result = await crewAI.execute(
  "Analyze HubSpot",
  "competitor",
  { company_name: "HubSpot", region: "US" }
);

// Parallel execution
const results = await crewAI.executeParallel([
  { userRequest: "Analyze Salesforce competitors", module: "competitor" },
  { userRequest: "Generate blog about CRM", module: "content" }
]);
```

## Performance & Scalability

**Concurrent Workflows:**
- Up to 5 workflows in parallel via `/execute-parallel`
- Each crew runs independently
- ThreadPoolExecutor manages concurrency

**Caching:**
- Crew-level caching enabled (default TTL: varies by module)
- Competitor crew: 24 hours
- Content crew: 1 hour (when implemented)

**Rate Limiting:**
- 20 requests/minute per crew
- Shared across all agents in crew

## Monitoring

**Health Check:**
```bash
curl http://localhost:8002/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-29T18:00:00",
  "orchestrator_configured": true,
  "available_modules": ["competitor"]
}
```

**Logs:**
```bash
# Watch logs in real-time
tail -f logs/crewai-backend.log

# Filter by module
grep "competitor" logs/crewai-backend.log
```

## Next Steps

1. **Test the refactored system:**
   ```bash
   ./start.sh
   curl http://localhost:8002/health
   ```

2. **Add more crews:** See `EXTENSION_ARCHITECTURE.md`

3. **Update frontend:** Use new unified API

4. **Monitor performance:** Track workflow execution times

## Troubleshooting

**Issue: Module not detected correctly**
- Check orchestrator logs for detection prompt/response
- Specify module explicitly: `"module": "competitor"`

**Issue: Import errors**
- Ensure tools/__init__.py and crews/__init__.py exist
- Run from project root directory

**Issue: Crew initialization failed**
- Check GROQ_API_KEY environment variable
- Verify config/*.yaml files exist

For detailed architecture and implementation guides, see `EXTENSION_ARCHITECTURE.md`.
