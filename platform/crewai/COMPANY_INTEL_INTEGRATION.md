# Company Intelligence CrewAI Integration

## Overview

Company Intelligence module now uses **CrewAI Multi-Agent Backend** for artifact generation instead of the legacy backend-server.js. This integration leverages 9 specialized crews to generate 16 different marketing intelligence artifacts.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: CompanyIntelligenceFlow.tsx                      │
│  - User selects company + artifact type                     │
│  - Clicks "Generate" button                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  API ADAPTER: crewai-company-intel-adapter.ts               │
│  - Routes request to CrewAI backend (port 8002)             │
│  - Handles responses and errors                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  CREWAI BACKEND: main.py (port 8002)                        │
│  - Endpoint: POST /api/crewai/company-intel/generate        │
│  - Routes artifact type to appropriate crew                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
    ┌──────────────────┴──────────────────┐
    │                                     │
    ▼                                     ▼
┌─────────────────┐              ┌─────────────────┐
│ ORCHESTRATOR    │              │ SPECIALIZED     │
│ - Module        │─────────────▶│ CREWS (9)       │
│   detection     │              │ - 37 agents     │
│ - Crew routing  │              │ - 40+ tasks     │
└─────────────────┘              └─────────────────┘
                                         │
                                         ▼
                                 ┌─────────────────┐
                                 │ LLM EXECUTION   │
                                 │ - Groq          │
                                 │ - Web search    │
                                 │ - Structured    │
                                 │   output        │
                                 └─────────────────┘
```

## Artifact → Crew Mapping

The integration routes 16 artifact types to 5 specialized crews:

### CompanyIntelligenceCrew (4 agents)
**Artifacts**:
- `company_profile` - Firmographic data collection
- `client_profiling` - Client analysis and segmentation
- `partner_profiling` - Partner evaluation
- `sales_enablement` - Sales materials and battlecards

**Agents**:
1. **Firmographic Analyst** - Company basics, size, revenue, industry
2. **Tech Stack Analyst** - Technology infrastructure and tools
3. **Org Chart Mapper** - Organizational structure and hierarchy
4. **Decision Maker Identifier** - Contact information and stakeholders

### CompetitorIntelligenceCrew (4 agents)
**Artifacts**:
- `competitor_intelligence` - Competitor analysis and monitoring
- `opportunities` - Market opportunities and gaps
- `website_audit` - Website performance and SEO analysis
- `pricing_intelligence` - Pricing strategies and competitor pricing

**Agents**:
1. **Market Researcher** - Industry trends and market analysis
2. **Competitor Analyst** - Competitive landscape and positioning
3. **SWOT Analyst** - Strengths, weaknesses, opportunities, threats
4. **Battlecard Creator** - Competitive battlecards and sales materials

### ContentAutomationCrew (5 agents)
**Artifacts**:
- `content_strategy` - Content planning and editorial calendar
- `social_calendar` - Social media content calendar
- `lead_magnets` - Lead magnet design and creation
- `marketing_strategy` - Overall marketing strategy and tactics
- `positioning_messaging` - Brand positioning and messaging framework
- `channel_strategy` - Multi-channel marketing strategy

**Agents**:
1. **SEO Researcher** - Keyword research and content opportunities
2. **Topic Generator** - Content topic ideation
3. **Content Creator** - Blog posts, articles, social content
4. **SEO Optimizer** - On-page optimization and metadata
5. **Publisher** - Multi-platform content publishing

### LeadIntelligenceCrew (4 agents)
**Artifacts**:
- `icps` - Ideal customer profile definitions
- `lookalike_audiences` - Lookalike audience identification

**Agents**:
1. **Lead Scorer** - Lead scoring and qualification
2. **Enrichment Agent** - Data enrichment and enhancement
3. **ICP Matcher** - ICP matching and segmentation
4. **Segmentation Agent** - Audience segmentation and targeting

## API Endpoints

### CrewAI Backend (port 8002)

**Generate Artifact**:
```http
POST http://localhost:8002/api/crewai/company-intel/generate
Content-Type: application/json

{
  "company_name": "Salesforce",
  "company_url": "https://salesforce.com",
  "artifact_type": "competitor_intelligence",
  "inputs": {
    "goal": "Increase market share",
    "geo": "North America",
    "timeframe": "90 days",
    "channels": ["linkedin", "youtube"]
  }
}
```

**Response**:
```json
{
  "artifact_type": "competitor_intelligence",
  "status": "completed",
  "data": {
    "competitors": [...],
    "market_position": {...},
    "opportunities": [...]
  },
  "generated_at": "2025-01-29T12:00:00Z"
}
```

**Check Backend Health**:
```http
GET http://localhost:8002/health
```

**Get Available Modules**:
```http
GET http://localhost:8002/api/crewai/modules
```

### Legacy Backend (port 3006)

**Save CrewAI Artifact** (for persistence):
```http
POST http://localhost:3006/api/company-intel/companies/{id}/artifacts
Content-Type: application/json

{
  "type": "competitor_intelligence",
  "data": {...},
  "updatedAt": "2025-01-29T12:00:00Z"
}
```

## Frontend Integration

### Feature Toggle

The frontend includes a **backend toggle** in the UI:

```
┌─────────────────────────────────────────┐
│  Company Intelligence                   │
│  Salesforce                             │
│                       Backend: [🤖 CrewAI] ●  │
└─────────────────────────────────────────┘
```

- **🤖 CrewAI** - Uses multi-agent backend (default)
- **🔧 Legacy** - Uses backend-server.js (fallback)
- **Green dot (●)** - CrewAI backend is available

### Automatic Fallback

If CrewAI backend is not available (port 8002):
- Frontend automatically falls back to legacy backend
- Toggle is disabled
- Console warning: `⚠️ CrewAI backend not available, using legacy backend`

### Generation Flow

1. User clicks "Generate" on artifact page
2. Frontend checks `useCrewAI` flag
3. If CrewAI enabled:
   - Call `generateArtifactWithCrewAI()`
   - Save result to local backend for persistence
   - Refresh company details
4. If legacy mode:
   - Call `/api/company-intel/companies/:id/generate`
   - Backend generates with Groq LLM directly

## Testing the Integration

### 1. Start CrewAI Backend

```bash
cd /Users/yogs87/Downloads/sanity/projects/martech/crewai-backend
./start.sh
```

**Expected output**:
```
🚀 Starting CrewAI Multi-Module Backend...
✅ Orchestrator initialized with 9 modules
   📦 competitor: available
   📦 content: available
   📦 lead: available
   📦 company: available
   📦 social: available
   📦 video: available
   📦 customer: available
   📦 budget: available
   📦 scorecard: available
✅ CrewAI backend initialized successfully
🚀 Starting CrewAI multi-module backend on port 8002
```

### 2. Start Frontend & Backend Server

```bash
cd /Users/yogs87/Downloads/sanity/projects/martech

# Terminal 1: Frontend (port 5173)
npm run dev

# Terminal 2: Backend server (port 3006)
npm run dev:backend
```

### 3. Test Artifact Generation

1. Open frontend: `http://localhost:5173`
2. Navigate to **Company Intelligence** module
3. Create/select a company (e.g., "Salesforce")
4. Verify backend toggle shows **🤖 CrewAI** with green dot
5. Click on any artifact type (e.g., "Competitor Intelligence")
6. Click **Generate** button
7. Monitor console logs for CrewAI execution:
   ```
   🤖 Generating competitor_intelligence using CrewAI backend...
   ✅ competitor_intelligence generated successfully with CrewAI
   ```

### 4. Test Crew Routing

**Competitor Intelligence**:
```bash
curl -X POST http://localhost:8002/api/crewai/company-intel/generate \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Salesforce",
    "artifact_type": "competitor_intelligence",
    "inputs": {"geo": "global"}
  }'
```

**Content Strategy**:
```bash
curl -X POST http://localhost:8002/api/crewai/company-intel/generate \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "HubSpot",
    "artifact_type": "content_strategy",
    "inputs": {"goal": "Increase leads", "timeframe": "90 days"}
  }'
```

**ICPs**:
```bash
curl -X POST http://localhost:8002/api/crewai/company-intel/generate \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Stripe",
    "artifact_type": "icps"
  }'
```

### 5. Verify Backend Logs

**CrewAI Backend** (port 8002):
```
[wf-1738166400000] Starting workflow execution
[wf-1738166400000] Request: Analyze competitors of Salesforce
[wf-1738166400000] Auto-detected module: competitor
🚀 Executing competitor crew workflow
✅ Workflow completed
```

**Frontend Console**:
```
✅ CrewAI backend is available
🤖 Generating competitor_intelligence using CrewAI backend...
Routing to crew: competitor
✅ competitor_intelligence generated successfully with CrewAI
```

## Environment Variables

### CrewAI Backend

```bash
# Required
GROQ_API_KEY=gsk_...                # Groq LLM API key

# Optional
PORT=8002                           # Backend port (default: 8002)
RELOAD=true                         # Auto-reload on code changes
LOG_LEVEL=info                      # Logging level
```

### Frontend

```bash
# Optional (defaults to localhost:8002)
VITE_CREWAI_URL=http://localhost:8002
```

## Benefits of CrewAI Integration

### 1. Multi-Agent Specialization
- **37 specialized agents** across 9 crews
- Each artifact type uses agents optimized for that task
- Better quality and accuracy vs single LLM calls

### 2. Scalability
- Parallel multi-crew execution
- Crew-level caching (90% cost reduction on cache hits)
- Rate limiting per crew (15-25 RPM)

### 3. Extensibility
- Easy to add new artifact types
- New crews can be integrated seamlessly
- YAML-driven configuration for agents/tasks

### 4. Cost Optimization
- Agent-level caching reduces API costs
- Groq LLM (cheap, fast) as primary model
- Structured output reduces token usage

### 5. Reliability
- Automatic fallback to legacy backend
- Error handling and recovery
- Execution timeouts prevent hanging

## Troubleshooting

### Issue: CrewAI backend not available

**Symptom**: Frontend shows `⚠️ CrewAI backend not available, using legacy backend`

**Solutions**:
1. Check if backend is running: `curl http://localhost:8002/health`
2. Verify GROQ_API_KEY is set: `echo $GROQ_API_KEY`
3. Check logs: `tail -f logs/crewai-backend.log`
4. Restart backend: `./start.sh`

### Issue: Artifact generation fails

**Symptom**: Error message in frontend after clicking Generate

**Solutions**:
1. Check backend logs for errors
2. Verify artifact type is supported: `curl http://localhost:8002/api/crewai/modules`
3. Test with curl command (see Testing section)
4. Check company data is valid (name, URL)

### Issue: Wrong crew handles artifact

**Symptom**: Unexpected results or irrelevant output

**Solutions**:
1. Check `ARTIFACT_CREW_MAPPING` in `main.py`
2. Update mapping if needed
3. Restart backend to reload mapping

## Future Enhancements

### Planned Features

1. **Real-time Streaming**
   - Stream agent execution logs to frontend
   - Show progress for long-running tasks

2. **Artifact History**
   - Version control for artifacts
   - Compare versions side-by-side

3. **Custom Crew Configuration**
   - User-defined agent configurations
   - Custom prompts and tasks

4. **Batch Generation**
   - Generate multiple artifacts in parallel
   - Bulk company processing

5. **Quality Metrics**
   - Track generation quality scores
   - A/B testing different agent configurations

## Support

**Documentation**:
- CrewAI Backend: `/Users/yogs87/Downloads/sanity/projects/martech/crewai-backend/README_MULTI_CREW.md`
- Architecture: `/Users/yogs87/Downloads/sanity/projects/martech/crewai-backend/EXTENSION_ARCHITECTURE.md`
- Refactoring Summary: `/Users/yogs87/Downloads/sanity/projects/martech/crewai-backend/REFACTORING_COMPLETE.md`

**Common Issues**:
1. Import errors → Ensure `__init__.py` files exist in crews/
2. Module detection fails → Specify module explicitly in request
3. Crew init fails → Check GROQ_API_KEY environment variable

**Logs**:
- Backend: `logs/crewai-backend.log`
- Frontend console: Browser DevTools
- Backend server: Terminal output

---

**Status**: ✅ Integration Complete

**Last Updated**: 2025-01-29
