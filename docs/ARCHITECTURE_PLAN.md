# Martech AI Platform - Architecture Design Plan

## Executive Summary

Design a B2B Martech AI Platform with multi-agent autonomous AI for executing tasks, monitoring, and self-improvement with minimal user intervention. Architecture supports MVP monolithic deployment with clear microservices migration path.

**Budget Optimization and industry AI adtech flow**: The industry flow is Research (ad spy) → Create (creative AI) → Target → Run and Optimize → Measure → Protect (fraud/safety). The platform’s Budget Optimization module (see [CLAUDE.md](CLAUDE.md) §8) maps to **Measure + Run/Optimize**: RCA, KPIs, budget plan, and recommendations. It does not cover Research, Create, Target, or Protect. Connectors (Meta, Google Ads, GA4, TikTok, Shopify, Snowflake, manual) are planned; analysis is currently user-provided data + Groq.

---

## 1. Recommended Directory Structure

```
/martech-platform/
├── README.md
├── CLAUDE.md
├── package.json                        # Monorepo config (pnpm workspaces)
├── docker-compose.yml                  # Local development
├── docker-compose.prod.yml             # Production
│
├── config/
│   ├── default.yaml                    # Base configuration
│   ├── development.yaml
│   └── production.yaml
│
├── packages/                           # Shared packages (future microservices boundaries)
│   ├── types/                          # TypeScript interfaces
│   │   └── src/
│   │       ├── agent.ts               # Agent, Task, Memory types
│   │       ├── workflow.ts            # Workflow, Node, Execution types
│   │       ├── campaign.ts            # Campaign, Content types
│   │       ├── lead.ts                # Lead, Interaction types
│   │       └── index.ts
│   │
│   ├── common/                         # Shared utilities
│   │   └── src/
│   │       ├── logger.ts              # Pino structured logging
│   │       ├── errors.ts              # Custom error classes
│   │       ├── validation.ts          # Zod schema validation
│   │       ├── retry.ts               # Retry with backoff
│   │       └── circuit-breaker.ts     # Circuit breaker pattern
│   │
│   └── mcp-tools/                      # MCP tool wrappers
│       └── src/
│           ├── registry.ts            # Tool registry
│           ├── wordpress.ts           # WordPress MCP
│           ├── sanity.ts              # Sanity MCP
│           ├── moengage.ts            # MoEngage MCP
│           ├── heygen.ts              # HeyGen MCP
│           └── index.ts
│
├── services/                           # Service modules (clear microservice boundaries)
│   │
│   ├── agent-service/                  # Core Agent Orchestration
│   │   └── src/
│   │       ├── agents/
│   │       │   ├── supervisor.ts      # Supervisor agent (orchestrator)
│   │       │   ├── lead-analyst.ts
│   │       │   ├── content-creator.ts
│   │       │   ├── campaign-optimizer.ts
│   │       │   ├── customer-insights.ts
│   │       │   └── outreach-agent.ts
│   │       ├── memory/
│   │       │   ├── short-term.ts      # Session memory
│   │       │   ├── long-term.ts       # Persistent (Supabase)
│   │       │   └── shared-knowledge.ts # Cross-agent KB
│   │       ├── tools/
│   │       │   ├── tool-executor.ts
│   │       │   └── mcp-adapter.ts
│   │       ├── communication/
│   │       │   ├── message-bus.ts     # Event-driven messaging
│   │       │   └── delegation.ts      # Task delegation
│   │       └── orchestrator.ts
│   │
│   ├── workflow-service/               # Hybrid Workflow Engine
│   │   └── src/
│   │       ├── core/
│   │       │   ├── workflow-engine.ts
│   │       │   ├── workflow-context.ts
│   │       │   └── state-machine.ts
│   │       ├── nodes/
│   │       │   ├── base-node.ts
│   │       │   ├── trigger-node.ts
│   │       │   ├── agent-node.ts      # Executes agent tasks
│   │       │   ├── condition-node.ts
│   │       │   ├── approval-node.ts   # Manual/auto approval gates
│   │       │   └── webhook-node.ts
│   │       └── persistence/
│   │           ├── workflow-store.ts
│   │           └── checkpoint.ts
│   │
│   ├── autopilot-service/              # Autonomous Execution Framework
│   │   └── src/
│   │       ├── scheduler/
│   │       │   ├── cron-scheduler.ts
│   │       │   ├── event-scheduler.ts
│   │       │   └── adaptive-scheduler.ts
│   │       ├── monitoring/
│   │       │   ├── anomaly-detector.ts
│   │       │   ├── performance-monitor.ts
│   │       │   └── health-checker.ts
│   │       ├── self-healing/
│   │       │   ├── recovery-engine.ts
│   │       │   ├── fallback-manager.ts
│   │       │   └── circuit-breaker.ts
│   │       └── escalation/
│   │           ├── escalation-rules.ts
│   │           └── human-in-loop.ts
│   │
│   ├── content-service/                # Content Management
│   │   └── src/
│   │       ├── generators/
│   │       ├── publishers/
│   │       └── seo/
│   │
│   ├── analytics-service/              # Analytics & Insights
│   │   └── src/
│   │       ├── collectors/
│   │       ├── processors/
│   │       └── reporters/
│   │
│   └── integration-service/            # MCP Gateway
│       └── src/
│           ├── gateway/
│           ├── adapters/
│           └── webhooks/
│
├── apps/                               # Application entry points
│   │
│   ├── api/                            # REST/GraphQL/WebSocket API
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── agents.ts
│   │       │   ├── workflows.ts
│   │       │   ├── campaigns.ts
│   │       │   └── analytics.ts
│   │       ├── graphql/
│   │       ├── websocket/
│   │       └── middleware/
│   │
│   └── web/                            # React Frontend
│       └── src/
│           ├── components/
│           │   ├── dashboard/
│           │   ├── agents/
│           │   ├── workflows/
│           │   └── analytics/
│           ├── contexts/
│           ├── hooks/
│           └── api/
│               └── martech-adapter.ts
│
├── data/
│   ├── workflows/                      # YAML workflow definitions
│   ├── templates/                      # Content templates
│   └── prompts/                        # AI prompts
│
└── scripts/
    ├── dev.sh
    ├── build.sh
    └── deploy.sh
```

---

## 2. Agent Architecture

### Agent Hierarchy

```
                    ┌─────────────────────────┐
                    │   SUPERVISOR AGENT      │
                    │   ─────────────────     │
                    │   • Task decomposition  │
                    │   • Agent delegation    │
                    │   • Conflict resolution │
                    │   • Quality assurance   │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ LEAD ANALYST  │    │CONTENT CREATOR│    │CAMPAIGN OPT.  │
│ • Scoring     │    │ • Blogs       │    │ • Budget opt. │
│ • Enrichment  │    │ • Social      │    │ • A/B testing │
│ • Lookalikes  │    │ • Email       │    │ • ROI analysis│
└───────────────┘    └───────────────┘    └───────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐    ┌───────────────┐
│CUSTOMER INSIGHT│   │OUTREACH AGENT │
│ • Segmentation │   │ • Email seq.  │
│ • Churn pred.  │   │ • LinkedIn    │
│ • Journey map  │   │ • Follow-ups  │
└───────────────┘    └───────────────┘

           ┌─────────────────────────────┐
           │     SHARED COMPONENTS       │
           ├─────────────────────────────┤
           │ Memory System:              │
           │  • Short-term (session)     │
           │  • Long-term (Supabase)     │
           │  • Shared Knowledge Base    │
           │                             │
           │ Tool Registry (MCP):        │
           │  • WordPress, Sanity        │
           │  • MoEngage, HeyGen         │
           │  • Google APIs              │
           │                             │
           │ Message Bus:                │
           │  • Event-driven messaging   │
           │  • Task delegation          │
           └─────────────────────────────┘
```

### Key Agent Types

```typescript
interface Agent {
  id: string;
  name: string;
  role: string;
  goal: string;
  capabilities: AgentCapability[];
  tools: AgentTool[];
  memory: AgentMemory;
  status: "idle" | "busy" | "paused" | "error";
  config: {
    maxConcurrentTasks: number;
    autonomyLevel: "supervised" | "semi-autonomous" | "autonomous";
    escalationThreshold: number;
  };
}
```

---

## 3. Auto-Pilot Framework

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTO-PILOT ENGINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SCHEDULER LAYER                                            │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐     │
│  │Cron Scheduler│ │Event Scheduler│ │Adaptive Sched. │     │
│  │• Daily runs  │ │• Webhooks     │ │• ML-based      │     │
│  │• Hourly batch│ │• API triggers │ │• Load-balanced │     │
│  └──────────────┘ └───────────────┘ └────────────────┘     │
│                                                             │
│  MONITORING LAYER                                           │
│  ┌────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │Anomaly Detector│ │Performance Mon. │ │Health Checker│   │
│  │• Statistical   │ │• Latency        │ │• Agent health│   │
│  │• ML-based      │ │• Error rates    │ │• Service up  │   │
│  └────────────────┘ └─────────────────┘ └──────────────┘   │
│                                                             │
│  SELF-HEALING          OPTIMIZATION         ESCALATION      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │• Auto-retry │    │• Resource   │    │• Threshold  │     │
│  │• Fallback   │    │  allocation │    │  triggers   │     │
│  │• Circuit    │    │• Model      │    │• Human-in-  │     │
│  │  breaker    │    │  selection  │    │  loop       │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Capabilities

1. **Scheduled Execution**: Cron-based + event-triggered + adaptive timing
2. **Anomaly Detection**: Statistical + ML-based + rule-based detection
3. **Self-Healing**: Auto-retry, fallback strategies, circuit breaker
4. **Performance Optimization**: Resource allocation, model selection
5. **Human-in-Loop Escalation**: Threshold triggers, approval routing

---

## 4. Hybrid Workflow Engine

Supports both **agent-based** (autonomous) and **node-based** (deterministic) workflows:

```
┌─────────────────────────────────────────────────────────────┐
│              HYBRID WORKFLOW ENGINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WORKFLOW DEFINITION                                        │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │ YAML/JSON Config    │    │ Visual Builder      │        │
│  │ workflows/*.yaml    │    │ Drag-drop nodes     │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                             │
│  EXECUTION MODES                                            │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │ Agent-Based         │    │ Node-Based          │        │
│  │ • Autonomous        │    │ • Deterministic     │        │
│  │ • LLM-driven        │    │ • Sequential        │        │
│  │ • Learning loop     │    │ • Approval gates    │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                             │
│  NODE TYPES                                                 │
│  • Trigger   • Agent    • Condition   • Transform          │
│  • Approval  • Webhook  • Delay       • Parallel/Merge     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Approval Gates

```typescript
interface ApprovalGate {
  type: "manual" | "auto-approve" | "conditional";
  autoApproveThreshold?: number; // Score >= threshold = auto-approve
  approvers?: string[]; // User IDs for manual
  timeout?: number; // Auto-reject after timeout
}
```

---

## 5. B2B User Personas & Features

| User Type             | Primary Features                                       | Dashboard Focus                       |
| --------------------- | ------------------------------------------------------ | ------------------------------------- |
| **Marketing Manager** | Campaign management, content calendar, budget tracking | Campaign performance, ROI metrics     |
| **Content Team**      | Bulk content creation, SEO tools, publishing           | Content pipeline, approval queue      |
| **Sales Team**        | Lead scoring, outreach automation, CRM sync            | Lead quality, conversion rates        |
| **Executive**         | High-level analytics, forecasting, reports             | Revenue attribution, team performance |
| **Developer/Admin**   | API access, webhook config, integrations               | System health, API usage              |

---

## 6. API Layer Design

### Endpoints Overview

```
REST API (/api/v1)
├── /agents           - Agent CRUD, chat, tasks
├── /workflows        - Workflow CRUD, execute, status
├── /approvals        - Approval management
├── /campaigns        - Campaign management
├── /content          - Content CRUD, publish
├── /analytics        - Metrics, dashboards
└── /webhooks         - Webhook registration

GraphQL (/graphql)
├── Queries           - Flexible data fetching
├── Mutations         - Create/update operations
└── Subscriptions     - Real-time updates

WebSocket (/ws)
├── Agent events      - Status, task progress
├── Workflow events   - Execution updates
└── System events     - Alerts, notifications
```

---

## 7. Microservices Migration Path

```
Phase 1: MONOLITH (MVP)
└── Single deployable, shared Supabase

Phase 2: MODULAR MONOLITH (Weeks 1-4)
├── Extract shared packages
├── Define module boundaries
└── Implement dependency injection

Phase 3: EVENT-DRIVEN (Weeks 5-8)
├── Introduce Redis pub/sub
├── Convert to async events
└── Add event sourcing

Phase 4: FIRST EXTRACTION (Weeks 9-12)
├── Extract Analytics service (lowest coupling)
├── Separate database (ClickHouse)
└── Add API gateway

Phase 5: FULL MICROSERVICES (Weeks 13-20)
├── Agent Service
├── Workflow Service
├── Content Service
├── Integration Service (MCP Gateway)
└── Service mesh, observability
```

---

## 8. Critical Files to Modify/Extend

| File                               | Action | Purpose                             |
| ---------------------------------- | ------ | ----------------------------------- |
| `src/services/agentService.ts`     | Extend | Add Supervisor agent, memory system |
| `src/types/agent.ts`               | Extend | Add new agent interfaces            |
| New: `services/autopilot-service/` | Create | Auto-pilot framework                |
| New: `services/workflow-service/`  | Create | Hybrid workflow engine              |
| New: `packages/mcp-tools/`         | Create | MCP tool registry                   |
| New: `apps/api/`                   | Create | REST/GraphQL/WebSocket API          |

---

## 9. Technology Stack

| Layer       | Technology                        | Rationale                |
| ----------- | --------------------------------- | ------------------------ |
| Frontend    | React 18 + TypeScript + Vite      | Existing stack, fast     |
| Backend     | Node.js + Express/Fastify         | TypeScript consistency   |
| Database    | Supabase (Postgres)               | Existing, auth built-in  |
| Cache/Queue | Redis                             | Pub/sub, caching, queues |
| AI/LLM      | Groq (primary), Gemini (fallback) | Existing integrations    |
| Video       | HeyGen + Shotstack                | Existing integrations    |
| Analytics   | ClickHouse (future)               | Time-series optimization |

---

## 10. Verification Plan

### Phase 1: Agent System

- [ ] Test Supervisor delegation to specialist agents
- [ ] Verify inter-agent communication via message bus
- [ ] Test memory persistence (short-term, long-term)

### Phase 2: Workflow Engine

- [ ] Test node-based workflow execution
- [ ] Test agent-based autonomous execution
- [ ] Verify approval gates (manual, auto-approve)
- [ ] Test checkpoint/recovery

### Phase 3: Auto-Pilot

- [ ] Test scheduled task execution
- [ ] Verify anomaly detection alerts
- [ ] Test self-healing (retry, fallback)
- [ ] Test human escalation triggers

### Phase 4: API Layer

- [ ] Test REST endpoints (Postman/Insomnia)
- [ ] Test GraphQL queries/mutations
- [ ] Test WebSocket real-time updates

### Phase 5: Integration

- [ ] End-to-end workflow: Lead capture → Scoring → Outreach
- [ ] End-to-end workflow: Topic research → Content creation → Publish
- [ ] Multi-platform publishing (WordPress + Sanity)

---

## Design Decisions (User Confirmed)

1. **MVP User Focus**: Marketing Managers (campaign management, content calendar, analytics dashboards)
2. **Agent Autonomy**: Fully autonomous - agents make decisions independently with minimal human intervention
3. **MVP Integrations (All 4 categories)**:
   - Content Publishing (WordPress, Sanity)
   - Marketing Automation (MoEngage)
   - Video Generation (HeyGen, Shotstack)
   - Lead Enrichment (Apollo, LinkedIn)
4. **Agent Orchestration**: Supervisor pattern with specialized agents
5. **Workflow Model**: Hybrid (agent-based + node-based)
6. **Auto-Pilot**: Scheduler + Monitoring + Self-Healing + Escalation
7. **Monolith → Microservices**: Clear service boundaries from day 1

---

## Next Steps (Implementation Order)

1. **Restructure directory** per recommended layout
2. **Extract shared packages** (types, common, mcp-tools)
3. **Implement Supervisor agent** extending existing AgentService
4. **Build workflow engine** with node types
5. **Create auto-pilot service** with scheduler + monitoring
6. **Build API layer** (REST first, then GraphQL)
7. **Add real-time** (WebSocket for agent/workflow events)
8. **Integration testing** per verification plan
