# CrewAI Multi-Module Extension Architecture

This document outlines how to extend the CrewAI framework across all Torqq AI platform modules.

## Architecture Overview

### Current State
- **Single Crew**: Competitor Intelligence (4 agents, 5 tasks)
- **Single Endpoint**: `/api/crewai/execute-workflow`
- **Port**: 8002

### Target State
- **9 Specialized Crews**: One per platform module
- **Unified API Gateway**: Route requests to appropriate crew
- **Shared Tools**: Common tools used across crews
- **Module-Specific Tools**: Specialized tools per crew

## Multi-Crew Architecture

```
┌─────────────────────────────────────────────────────────┐
│              CrewAI Backend (Port 8002)                 │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │         Crew Orchestrator (Router)                │ │
│  │  - Parse user intent                              │ │
│  │  - Route to appropriate crew                      │ │
│  │  - Aggregate multi-crew results                   │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    │                                   │
│  ┌─────────────────┼─────────────────────────────────┐ │
│  │                 │         9 Specialized Crews     │ │
│  │  ┌──────────────▼───────────────┐                 │ │
│  │  │ 1. Competitor Intelligence   │  (Existing)     │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 2. Content Automation        │                 │ │
│  │  │    - SEO Research Agent      │                 │ │
│  │  │    - Topic Generator Agent   │                 │ │
│  │  │    - Content Creator Agent   │                 │ │
│  │  │    - Publisher Agent         │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 3. Lead Intelligence         │                 │ │
│  │  │    - Lead Scorer Agent       │                 │ │
│  │  │    - Enrichment Agent        │                 │ │
│  │  │    - ICP Matcher Agent       │                 │ │
│  │  │    - Segmentation Agent      │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 4. Social Media Campaign     │                 │ │
│  │  │    - Campaign Planner Agent  │                 │ │
│  │  │    - Script Writer Agent     │                 │ │
│  │  │    - Video Producer Agent    │                 │ │
│  │  │    - Publisher Agent         │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 5. Video Generation          │                 │ │
│  │  │    - Storyboard Agent        │                 │ │
│  │  │    - Veo Generator Agent     │                 │ │
│  │  │    - HeyGen Avatar Agent     │                 │ │
│  │  │    - Editor Agent            │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 6. Company Intelligence      │                 │ │
│  │  │    - Firmographic Agent      │                 │ │
│  │  │    - Tech Stack Agent        │                 │ │
│  │  │    - Org Chart Agent         │                 │ │
│  │  │    - Decision Maker Agent    │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 7. Unified Customer View     │                 │ │
│  │  │    - Profile Aggregator      │                 │ │
│  │  │    - Journey Mapper Agent    │                 │ │
│  │  │    - Prediction Agent        │                 │ │
│  │  │    - Insights Agent          │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 8. Budget Optimization       │                 │ │
│  │  │    - Performance Analyzer    │                 │ │
│  │  │    - Budget Allocator Agent  │                 │ │
│  │  │    - ROI Predictor Agent     │                 │ │
│  │  │    - Recommendation Agent    │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  │  ┌──────────────────────────────┐                 │ │
│  │  │ 9. Performance Scorecard     │                 │ │
│  │  │    - Metrics Collector Agent │                 │ │
│  │  │    - Anomaly Detector Agent  │                 │ │
│  │  │    - Dashboard Builder Agent │                 │ │
│  │  │    - Alert Generator Agent   │                 │ │
│  │  └──────────────────────────────┘                 │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │               Shared Tools Layer                  │ │
│  │  - Groq Web Search                                │ │
│  │  - Groq LLM (reasoning)                           │ │
│  │  - Supabase (database)                            │ │
│  │  - n8n (workflows)                                │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │           Module-Specific Tools Layer             │ │
│  │  - WordPress Tool (content publishing)            │ │
│  │  - Sanity Tool (CMS operations)                   │ │
│  │  - Veo Tool (video generation)                    │ │
│  │  - HeyGen Tool (avatar videos)                    │ │
│  │  - Shotstack Tool (video editing)                 │ │
│  │  - Apollo Tool (lead data)                        │ │
│  │  - Apify Tool (web scraping)                      │ │
│  │  - LiveKit Tool (voice sessions)                  │ │
│  │  - Zapier Tool (multi-platform publishing)        │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
crewai-backend/
├── config/
│   ├── agents/                     # Agent configs by module
│   │   ├── competitor.yaml
│   │   ├── content.yaml
│   │   ├── lead.yaml
│   │   ├── social.yaml
│   │   ├── video.yaml
│   │   ├── company.yaml
│   │   ├── customer.yaml
│   │   ├── budget.yaml
│   │   └── scorecard.yaml
│   └── tasks/                      # Task configs by module
│       ├── competitor.yaml
│       ├── content.yaml
│       ├── lead.yaml
│       ├── social.yaml
│       ├── video.yaml
│       ├── company.yaml
│       ├── customer.yaml
│       ├── budget.yaml
│       └── scorecard.yaml
├── crews/
│   ├── __init__.py
│   ├── competitor_intelligence.py  # Existing crew (refactored)
│   ├── content_automation.py       # Content crew
│   ├── lead_intelligence.py        # Lead crew
│   ├── social_campaign.py          # Social crew
│   ├── video_generation.py         # Video crew
│   ├── company_intelligence.py     # Company crew
│   ├── customer_view.py            # Customer crew
│   ├── budget_optimization.py      # Budget crew
│   └── performance_scorecard.py    # Scorecard crew
├── tools/
│   ├── shared/                     # Shared across all crews
│   │   ├── __init__.py
│   │   ├── groq_web_search.py
│   │   ├── supabase_tool.py
│   │   └── n8n_trigger_tool.py
│   └── specialized/                # Module-specific tools
│       ├── __init__.py
│       ├── wordpress_tool.py
│       ├── sanity_tool.py
│       ├── veo_tool.py
│       ├── heygen_tool.py
│       ├── shotstack_tool.py
│       ├── apollo_tool.py
│       ├── apify_tool.py
│       ├── livekit_tool.py
│       └── zapier_tool.py
├── orchestrator.py                 # Main crew router
├── main.py                         # FastAPI server
├── requirements.txt
├── .env.example
└── README.md
```

## Implementation Steps

### Phase 1: Refactor Existing Crew (Week 1)

**Step 1.1**: Move existing crew to modular structure
```bash
# Rename crew.py → crews/competitor_intelligence.py
# Move config/agents.yaml → config/agents/competitor.yaml
# Move config/tasks.yaml → config/tasks/competitor.yaml
# Move tools/*.py → tools/shared/
```

**Step 1.2**: Create crew orchestrator
```python
# orchestrator.py
class CrewOrchestrator:
    def __init__(self):
        self.crews = {
            'competitor': CompetitorIntelligenceCrew(),
            'content': ContentAutomationCrew(),
            'lead': LeadIntelligenceCrew(),
            # ... other crews
        }

    def route_request(self, user_request: str, module: str = None):
        """Route request to appropriate crew"""
        if module:
            return self.crews[module].execute_workflow(user_request)

        # Auto-detect module from user request
        detected_module = self._detect_module(user_request)
        return self.crews[detected_module].execute_workflow(user_request)

    def _detect_module(self, user_request: str):
        """Use LLM to detect which module handles this request"""
        # Groq LLM classifies request into one of 9 modules
        pass
```

### Phase 2: Add Content Automation Crew (Week 2)

**Step 2.1**: Create content automation agents
```yaml
# config/agents/content.yaml
seo_researcher:
  role: SEO Research Specialist
  goal: Discover high-value content opportunities using SEO data and competitor analysis
  tools: [groq_web_search, google_cse]

topic_generator:
  role: Content Topic Strategist
  goal: Generate strategic content topics that balance quick wins and authority building
  tools: [groq_llm]

content_creator:
  role: E-E-A-T Content Writer
  goal: Create comprehensive, SEO-optimized content meeting Google's quality guidelines
  tools: [groq_llm, wordpress, sanity]

publisher:
  role: Multi-Platform Publisher
  goal: Publish optimized content to WordPress, Sanity, and Next.js with proper metadata
  tools: [wordpress, sanity, supabase]
```

**Step 2.2**: Create content automation crew
```python
# crews/content_automation.py
from crewai import Agent, Task, Crew, Process
from tools.shared.groq_web_search import GroqWebSearchTool
from tools.specialized.wordpress_tool import WordPressTool
from tools.specialized.sanity_tool import SanityTool

class ContentAutomationCrew:
    def __init__(self):
        self.llm = ChatGroq(...)
        self.agents = self._create_agents()

    def execute_workflow(self, topic: str, platforms: list):
        """
        Execute 7-stage content automation workflow
        Research → Topics → Deep Research → Create → Validate → SEO → Publish
        """
        tasks = [
            Task(description=f"Research SEO opportunities for {topic}", ...),
            Task(description=f"Generate topic ideas based on research", ...),
            Task(description=f"Create E-E-A-T compliant content", ...),
            Task(description=f"Publish to {platforms}", ...)
        ]

        crew = Crew(agents=self.agents, tasks=tasks, process=Process.sequential)
        return crew.kickoff()
```

### Phase 3: Add Lead Intelligence Crew (Week 3)

**Step 3.1**: Create lead intelligence agents
```yaml
# config/agents/lead.yaml
lead_scorer:
  role: Lead Scoring Specialist
  goal: Score leads based on ICP criteria and engagement signals
  tools: [supabase, apollo]

enrichment_agent:
  role: Data Enrichment Specialist
  goal: Enrich lead data with firmographic, technographic, and contact information
  tools: [apollo, clearbit, linkedin_scraper]

icp_matcher:
  role: ICP Matching Specialist
  goal: Match leads against Ideal Customer Profile criteria
  tools: [supabase, groq_llm]

segmentation_agent:
  role: Lead Segmentation Specialist
  goal: Segment leads into actionable groups for targeted outreach
  tools: [supabase, groq_llm]
```

**Step 3.2**: Create lead intelligence crew
```python
# crews/lead_intelligence.py
class LeadIntelligenceCrew:
    def execute_workflow(self, leads: list):
        """
        Execute lead intelligence workflow
        Score → Enrich → Match ICP → Segment → Route
        """
        tasks = [
            Task(description="Score leads using ICP model", ...),
            Task(description="Enrich with Apollo/Clearbit", ...),
            Task(description="Match against ICP criteria", ...),
            Task(description="Segment into Hot/Warm/Cold", ...)
        ]

        crew = Crew(agents=self.agents, tasks=tasks, process=Process.sequential)
        return crew.kickoff()
```

### Phase 4: Add Social Media Campaign Crew (Week 4)

**Step 4.1**: Create social media agents
```yaml
# config/agents/social.yaml
campaign_planner:
  role: Social Media Campaign Strategist
  goal: Design multi-platform social media campaigns with clear objectives and KPIs
  tools: [groq_llm, supabase]

script_writer:
  role: Social Media Script Writer
  goal: Write engaging scripts optimized for each platform's audience
  tools: [groq_llm]

video_producer:
  role: Video Production Coordinator
  goal: Orchestrate Veo 3.1 scene extension and HeyGen avatar integration
  tools: [veo, heygen, shotstack]

publisher:
  role: Multi-Platform Social Publisher
  goal: Publish videos to LinkedIn, Instagram, YouTube with platform-specific optimizations
  tools: [zapier, cloudinary]
```

**Step 4.2**: Create social media crew
```python
# crews/social_campaign.py
class SocialCampaignCrew:
    def execute_workflow(self, campaign_brief: str, platforms: list):
        """
        Execute social media campaign workflow
        Plan → Script → Video → Optimize → Publish → Track
        """
        tasks = [
            Task(description="Create campaign plan", ...),
            Task(description="Write platform-specific scripts", ...),
            Task(description="Generate videos with Veo 3.1", ...),
            Task(description="Publish to platforms", ...)
        ]

        crew = Crew(agents=self.agents, tasks=tasks, process=Process.sequential)
        return crew.kickoff()
```

### Phase 5: Add Remaining Crews (Weeks 5-8)

Repeat pattern for:
- Video Generation Crew
- Company Intelligence Crew
- Unified Customer View Crew
- Budget Optimization Crew
- Performance Scorecard Crew

## API Design

### Unified Endpoint (Option 1: Module-Specific Routes)

```python
# main.py
@app.post("/api/crewai/competitor/analyze")
async def competitor_analysis(request: CompetitorRequest):
    return orchestrator.crews['competitor'].execute_workflow(request)

@app.post("/api/crewai/content/generate")
async def content_generation(request: ContentRequest):
    return orchestrator.crews['content'].execute_workflow(request)

@app.post("/api/crewai/lead/score")
async def lead_scoring(request: LeadRequest):
    return orchestrator.crews['lead'].execute_workflow(request)

@app.post("/api/crewai/social/campaign")
async def social_campaign(request: SocialRequest):
    return orchestrator.crews['social'].execute_workflow(request)

# ... 5 more module endpoints
```

### Unified Endpoint (Option 2: Single Smart Router)

```python
# main.py
@app.post("/api/crewai/execute")
async def execute_workflow(request: UnifiedRequest):
    """
    Smart router that detects module from user request
    """
    result = orchestrator.route_request(
        user_request=request.user_request,
        module=request.module  # Optional, auto-detected if not provided
    )
    return result

# Request format
{
  "user_request": "Generate 10 blog topics about mutual funds",
  "module": "content",  # Optional: competitor, content, lead, social, etc.
  "context": {...}
}
```

## Frontend Integration

### React Component Pattern

```typescript
// src/services/crewAIService.ts
class CrewAIService {
  private baseUrl = 'http://localhost:8002/api/crewai';

  async executeCompetitorAnalysis(companyName: string, region: string) {
    return fetch(`${this.baseUrl}/competitor/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, region })
    });
  }

  async generateContent(topic: string, platforms: string[]) {
    return fetch(`${this.baseUrl}/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, platforms })
    });
  }

  async scoreLead(leadData: object) {
    return fetch(`${this.baseUrl}/lead/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });
  }

  async createSocialCampaign(brief: string, platforms: string[]) {
    return fetch(`${this.baseUrl}/social/campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief, platforms })
    });
  }
}

export const crewAI = new CrewAIService();
```

### Module Component Integration

```typescript
// src/components/modules/ContentCreationFlow.tsx
import { crewAI } from '@/services/crewAIService';

function ContentCreationFlow() {
  const [topic, setTopic] = useState('');
  const [platforms, setPlatforms] = useState(['wordpress', 'sanity']);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await crewAI.generateContent(topic, platforms);
      const data = await result.json();

      // Display results
      console.log('Content created:', data.result);
    } catch (error) {
      console.error('Content generation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Content topic..."
      />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Content'}
      </button>
    </div>
  );
}
```

## Tool Development Pattern

### Creating Specialized Tools

```python
# tools/specialized/wordpress_tool.py
from crewai_tools import BaseTool
from pydantic import BaseModel, Field
import requests

class WordPressToolInput(BaseModel):
    operation: str = Field(..., description="create_post, update_post, publish_post")
    data: dict = Field(..., description="Post data")

class WordPressTool(BaseTool):
    name: str = "wordpress_publisher"
    description: str = "Publish content to WordPress REST API"
    args_schema: type[BaseModel] = WordPressToolInput

    def _run(self, operation: str, data: dict) -> str:
        wp_url = os.getenv("WORDPRESS_URL")
        wp_auth = (os.getenv("WP_USERNAME"), os.getenv("WP_PASSWORD"))

        if operation == "create_post":
            response = requests.post(
                f"{wp_url}/wp-json/wp/v2/posts",
                json=data,
                auth=wp_auth
            )
            return json.dumps(response.json())

        # ... other operations
```

## Scalability Considerations

### 1. Concurrent Workflow Execution

```python
# orchestrator.py
from concurrent.futures import ThreadPoolExecutor

class CrewOrchestrator:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=5)

    async def execute_multi_crew_workflow(self, requests: list):
        """
        Execute multiple crew workflows in parallel
        Example: Generate content + Create social campaign + Score leads
        """
        futures = [
            self.executor.submit(self.crews[req.module].execute_workflow, req)
            for req in requests
        ]

        results = [f.result() for f in futures]
        return results
```

### 2. Background Task Processing

```python
# main.py
from fastapi import BackgroundTasks

@app.post("/api/crewai/content/generate-async")
async def generate_content_async(
    request: ContentRequest,
    background_tasks: BackgroundTasks
):
    """
    Start content generation in background
    Poll /api/crewai/workflows/{workflow_id} for status
    """
    workflow_id = f"wf-{int(datetime.now().timestamp())}"

    background_tasks.add_task(
        execute_content_workflow,
        workflow_id,
        request
    )

    return {
        "workflow_id": workflow_id,
        "status": "processing",
        "poll_url": f"/api/crewai/workflows/{workflow_id}"
    }
```

### 3. Workflow State Tracking

```python
# Store workflow state in Supabase
workflow_state = {
    "workflow_id": "wf-123",
    "module": "content",
    "status": "in_progress",
    "current_task": "seo_research",
    "completed_tasks": ["topic_generation"],
    "results": {},
    "created_at": "2025-01-29T10:00:00Z"
}

supabase.table("crewai_workflows").insert(workflow_state).execute()
```

## Cost Optimization

### 1. Crew-Level Caching Strategy

```python
# Per-crew cache configuration
content_crew = Crew(
    agents=agents,
    tasks=tasks,
    cache=True,
    cache_ttl=3600,  # 1 hour cache for content topics
)

competitor_crew = Crew(
    agents=agents,
    tasks=tasks,
    cache=True,
    cache_ttl=86400,  # 24 hour cache for competitor data
)
```

### 2. Shared Tool Instance Pooling

```python
# Share tool instances across crews to reduce initialization overhead
class ToolPool:
    def __init__(self):
        self.web_search = GroqWebSearchTool()  # Shared across all crews
        self.supabase = SupabaseTool()
        self.n8n = N8NTriggerTool()

    def get_tools_for_crew(self, crew_type: str):
        shared = [self.web_search, self.supabase, self.n8n]
        specialized = self._get_specialized_tools(crew_type)
        return shared + specialized
```

## Migration Path (Existing Code)

### Step 1: Preserve Existing Workflows

```python
# Keep current backend-server.js running on port 3006
# CrewAI backend runs on port 8002
# Frontend can call either based on feature flag

# src/api/workflowAdapter.ts
const USE_CREWAI = import.meta.env.VITE_USE_CREWAI === 'true';

async function executeWorkflow(request) {
  if (USE_CREWAI) {
    return fetch('http://localhost:8002/api/crewai/execute', ...);
  } else {
    return fetch('http://localhost:3006/api/workflow/execute', ...);
  }
}
```

### Step 2: Gradual Module Migration

Week 1-2: Competitor Intelligence (CrewAI) ✅
Week 3-4: Content Automation (CrewAI)
Week 5-6: Lead Intelligence (CrewAI)
Week 7-8: Social Media (CrewAI)
Week 9-12: Remaining modules

### Step 3: Deprecate Old Backend

Once all modules migrated:
- Remove backend-server.js
- Remove enhanced-bulk-generator-frontend/backend
- Single CrewAI backend on port 8002

## Testing Strategy

### Unit Tests (Per Crew)

```python
# tests/test_content_crew.py
def test_content_generation():
    crew = ContentAutomationCrew()
    result = crew.execute_workflow(
        topic="Mutual Funds for Beginners",
        platforms=["wordpress"]
    )

    assert result.status == "completed"
    assert "wordpress_url" in result.data
    assert len(result.data["content"]) > 2000  # E-E-A-T standard
```

### Integration Tests (Multi-Crew)

```python
# tests/test_orchestrator.py
def test_multi_crew_workflow():
    orchestrator = CrewOrchestrator()

    # Generate content + Create social campaign in parallel
    results = orchestrator.execute_multi_crew_workflow([
        {"module": "content", "request": {...}},
        {"module": "social", "request": {...}}
    ])

    assert len(results) == 2
    assert results[0].module == "content"
    assert results[1].module == "social"
```

## Monitoring & Observability

### 1. Workflow Metrics

```python
# Track crew performance
metrics = {
    "crew": "content_automation",
    "avg_execution_time": 180,  # seconds
    "success_rate": 0.95,
    "cost_per_workflow": 0.12,  # USD
    "cache_hit_rate": 0.65
}
```

### 2. Agent Performance Tracking

```python
# Track individual agent performance
agent_metrics = {
    "agent": "seo_researcher",
    "crew": "content_automation",
    "avg_iterations": 8,
    "avg_token_usage": 15000,
    "failure_rate": 0.02
}
```

## Summary

### Extension Benefits

✅ **Modularity**: Each module has dedicated crew
✅ **Scalability**: Parallel crew execution
✅ **Maintainability**: YAML-driven configuration
✅ **Reusability**: Shared tools across crews
✅ **Observability**: Per-crew metrics tracking
✅ **Cost Efficiency**: Crew-level caching
✅ **Developer Experience**: Clear structure, easy to extend

### Next Steps

1. **Week 1**: Refactor existing crew to modular structure
2. **Week 2**: Create crew orchestrator with routing
3. **Week 3**: Add Content Automation crew
4. **Week 4**: Add Lead Intelligence crew
5. **Week 5-8**: Add remaining 5 crews
6. **Week 9**: Frontend integration and migration
7. **Week 10**: Testing and optimization
8. **Week 11**: Production deployment
9. **Week 12**: Deprecate old backend

### Key Architectural Decisions

- **Single backend process**: All crews in one FastAPI app (simpler deployment)
- **YAML-driven**: All agent/task configs in YAML (easy to modify)
- **Shared + Specialized tools**: Common tools reused, specialized tools isolated
- **Sequential process**: Tasks run sequentially for predictable results
- **Crew-level caching**: Per-crew cache TTL based on data freshness needs
- **Module-specific endpoints**: Clear API boundaries, easier to version
