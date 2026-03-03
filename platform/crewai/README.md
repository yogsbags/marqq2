# CrewAI Multi-Agent Backend

Production-ready competitor intelligence system using CrewAI framework for automated competitor analysis and monitoring.

## Overview

This backend orchestrates 4 specialized AI agents to provide comprehensive competitor intelligence:

1. **Research Agent** - Discovers competitors using Groq Compound web search
2. **Competitor Analysis Agent** - Generates battlecards and pricing analysis
3. **Monitoring Agent** - Activates n8n workflows and manages Supabase configs
4. **Insights Agent** - Synthesizes strategic insights and recommendations

## Project Structure

```
crewai-backend/
├── config/
│   ├── agents.yaml          # Agent role definitions and configurations
│   └── tasks.yaml            # Task templates with dynamic inputs
├── agents/
│   ├── __init__.py
│   ├── research_agent.py
│   ├── competitor_analysis_agent.py
│   ├── monitoring_agent.py
│   └── insights_agent.py
├── tools/
│   ├── __init__.py
│   ├── groq_web_search.py    # Groq Compound web search tool
│   ├── supabase_tool.py      # Supabase database operations
│   └── n8n_trigger_tool.py   # n8n workflow activation
├── crew.py                   # Main Crew orchestrator class
├── main.py                   # FastAPI server entry point
├── requirements.txt          # Python dependencies
├── start.sh                  # Startup script
├── .env.example              # Environment variable template
└── README.md
```

## Installation

### 1. Prerequisites

- Python 3.10+
- Groq API key (sign up at https://console.groq.com)
- Supabase project (for monitoring features)
- n8n instance (optional, for automated workflows)

### 2. Clone and Setup

```bash
cd /Users/yogs87/Downloads/sanity/projects/martech/crewai-backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file from template
cp .env.example .env
```

### 3. Configure Environment Variables

Edit `.env` file with your credentials:

```bash
# Required
GROQ_API_KEY=gsk_your_groq_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/competitor-monitoring
PORT=8002
```

## Usage

### Start the Server

**Using the startup script (recommended):**
```bash
./start.sh
```

**Manual start:**
```bash
source venv/bin/activate
python main.py
```

Server will start on: `http://localhost:8002`

### API Endpoints

#### 1. Health Check
```bash
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2025-01-29T10:00:00",
  "crew_configured": true
}
```

#### 2. Execute Workflow
```bash
POST /api/crewai/execute-workflow

Request:
{
  "user_request": "Analyze HubSpot's competitors in the marketing automation space",
  "company_name": "HubSpot",
  "region": "global",
  "user_id": "user123",
  "enable_monitoring": true
}

Response:
{
  "workflow_id": "wf-1706524800000",
  "status": "completed",
  "result": {
    "summary": "Found 8 competitors including Marketo, Pardot, ActiveCampaign...",
    "competitors": ["Marketo", "Pardot", "ActiveCampaign", ...],
    "analysis": { ... },
    "monitoring": { "activated": true, ... },
    "insights": {
      "keyFindings": [...],
      "opportunities": [...],
      "threats": [...],
      "recommendations": [...]
    },
    "tasks_completed": 5,
    "agents_used": 4
  },
  "created_at": "2025-01-29T10:00:00",
  "completed_at": "2025-01-29T10:05:30"
}
```

#### 3. Get Agent Info
```bash
GET /api/crewai/agents

Response:
{
  "agents": [
    {
      "name": "Research Agent",
      "role": "Competitor Discovery Specialist",
      "capabilities": [...],
      "tools": ["Groq Compound Web Search"]
    },
    ...
  ]
}
```

### API Documentation

Interactive API docs available at:
- Swagger UI: http://localhost:8002/docs
- ReDoc: http://localhost:8002/redoc

## Architecture

### Agent Workflow

```
User Request
    ↓
┌─────────────────────────────────────┐
│  Research Agent                     │
│  - Discover competitors             │
│  - Gather market intelligence       │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Competitor Analysis Agent          │
│  - Generate battlecards             │
│  - Analyze pricing strategies       │
└──────────────┬──────────────────────┘
               ↓
    ┌──────────┴──────────┐
    ↓                     ↓
┌─────────────────┐  ┌────────────────────┐
│ Monitoring Agent│  │  Insights Agent    │
│ - Supabase cfg  │  │  - Key findings    │
│ - n8n trigger   │  │  - Opportunities   │
└─────────────────┘  │  - Recommendations │
                     └────────────────────┘
```

### Sequential Task Execution

Tasks are executed sequentially with dependency management:

1. **Discover Company** (if company name not provided)
2. **Research Competitors** (uses web search)
3. **Analyze Competitors** (depends on research task)
4. **Activate Monitoring** (optional, depends on research + analysis)
5. **Generate Insights** (depends on research + analysis)

### Tools Integration

- **Groq Compound Web Search**: Real-time web search for competitor discovery
- **Supabase Database**: Store monitoring configs and alerts
- **n8n Workflows**: Automated daily competitor monitoring

## Configuration

### Agents Configuration (config/agents.yaml)

Defines agent roles, goals, backstories, and capabilities. Each agent has:
- `role`: Agent's professional role
- `goal`: Primary objective
- `backstory`: Context and expertise
- `verbose`: Logging verbosity
- `allow_delegation`: Whether agent can delegate to others
- `max_iter`: Maximum reasoning iterations
- `memory`: Whether to retain context

### Tasks Configuration (config/tasks.yaml)

Defines task templates with placeholders for dynamic inputs:
- `description`: Task instructions with `{variable}` placeholders
- `expected_output`: Format and structure of task result
- `agent`: Which agent executes this task

Dynamic variables:
- `{user_request}`: Natural language request from user
- `{company_name}`: Target company for analysis
- `{region}`: Geographic region (global, US, India, UK, etc.)
- `{user_id}`: User ID for monitoring configuration

## Development

### Adding New Agents

1. **Define agent in config/agents.yaml:**
```yaml
new_agent:
  role: Agent Role
  goal: Agent goal
  backstory: >
    Agent expertise and context
  verbose: true
  allow_delegation: false
  max_iter: 10
  memory: true
```

2. **Create agent factory in agents/new_agent.py:**
```python
from crewai import Agent
from typing import List, Any

def create_new_agent(llm: Any, tools: List[Any]) -> Agent:
    return Agent(
        role="Agent Role",
        goal="Agent goal",
        backstory="...",
        tools=tools,
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=10,
        memory=True
    )
```

3. **Add agent to crew.py:**
```python
# In _create_agents() method
new_config = self.agents_config["new_agent"]
agents["new"] = Agent(
    role=new_config["role"],
    goal=new_config["goal"],
    backstory=new_config["backstory"],
    tools=[...],  # Assign appropriate tools
    llm=self.llm,
    verbose=new_config.get("verbose", True),
    allow_delegation=new_config.get("allow_delegation", False),
    max_iter=new_config.get("max_iter", 10),
    memory=new_config.get("memory", True)
)
```

### Adding New Tools

1. **Create tool in tools/new_tool.py:**
```python
from crewai_tools import BaseTool
from pydantic import BaseModel, Field
from typing import Type

class NewToolInput(BaseModel):
    param: str = Field(..., description="Parameter description")

class NewTool(BaseTool):
    name: str = "new_tool"
    description: str = "Tool description"
    args_schema: Type[BaseModel] = NewToolInput

    def _run(self, param: str) -> str:
        # Tool implementation
        return f"Result: {param}"
```

2. **Register tool in tools/__init__.py**
3. **Assign to appropriate agents in crew.py**

## Troubleshooting

### Common Issues

**1. "Crew not initialized" error**
- Check GROQ_API_KEY is set in .env
- Verify .env file is loaded (try `python -c "from dotenv import load_dotenv; load_dotenv(); import os; print(os.getenv('GROQ_API_KEY'))"`)

**2. Import errors for tools**
- Ensure virtual environment is activated
- Run `pip install -r requirements.txt`

**3. n8n webhook timeouts**
- n8n workflow triggers are fire-and-forget
- Timeouts are logged but don't fail the workflow
- Check N8N_WEBHOOK_URL is correct in .env

**4. Supabase connection errors**
- Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
- Check Supabase project is active
- Ensure database tables exist (see `../supabase-migrations/competitor-alerts.sql`)

## Integration with Frontend

### From TypeScript/React Frontend

```typescript
// Call CrewAI backend
const response = await fetch('http://localhost:8002/api/crewai/execute-workflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_request: "Find competitors for Salesforce in CRM market",
    company_name: "Salesforce",
    region: "global",
    user_id: currentUser.id,
    enable_monitoring: true
  })
});

const result = await response.json();
console.log(result);
```

## Performance

- **Average workflow execution**: 2-5 minutes (depends on number of competitors)
- **Agent iterations**: 10-15 per agent
- **Web search queries**: 5-10 queries per workflow
- **Memory usage**: ~500MB per concurrent workflow

## Cost Estimates (Groq API)

- **Per workflow**: ~$0.05 - $0.15 (using llama-3.3-70b-versatile)
- **Web search included**: Groq Compound includes web search at no extra cost
- **Monthly (100 workflows)**: ~$5 - $15

## License

Part of Torqq AI platform. Internal use only.

## Support

For issues or questions:
- Check logs: Look for detailed error messages in console output
- Verify environment: Run `./start.sh` and check initialization logs
- Review docs: See `../MULTI_AGENT_ORCHESTRATOR.md` for system architecture
