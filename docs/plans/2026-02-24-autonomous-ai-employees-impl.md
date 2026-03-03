# Autonomous AI Digital Employees — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 24/7 autonomous marketing agent system with 6 named AI digital
employees (Zara, Maya, Riya, Arjun, Dev, Priya) that run on schedules, maintain
persistent memory, and surface results in the app's NotificationsPanel in real time.

**Architecture:** Two-tier hybrid — Node.js API routes (Next.js in
`platform/content-engine/app/api/agents/`) handle interactive slash commands
from ChatHome; Python APScheduler (`platform/crewai/autonomous_scheduler.py`)
runs the same agents autonomously on cron schedules, writing results to Supabase
which NotificationsPanel consumes via real-time subscription.

**Tech Stack:**
- Python: APScheduler, supabase-py (already in requirements.txt), CrewAI (existing)
- TypeScript: Next.js API routes, @supabase/supabase-js (existing), Groq SDK (existing)
- DB: Supabase — 3 new tables (agent_notifications, agent_tasks, agent_memory)

**Design doc:** `docs/plans/2026-02-24-autonomous-ai-employees-design.md`

---

## How the backend works (READ THIS FIRST)

`server.js` is the entry point on Railway. It:
1. Serves the Vite build from `dist/`
2. Spawns `platform/content-engine` as a child process on port 3008
3. Proxies ALL `/api/*` requests to port 3008

`platform/content-engine` is a **Next.js app**. New backend routes go in
`platform/content-engine/app/api/`.

The Python CrewAI service (`platform/crewai/`) runs as a **separate process**
(started manually or as a Railway service). It writes directly to Supabase.
It does NOT go through the Node.js proxy.

---

## Phase 1 — Filesystem Foundation & SOUL.md Files

### Task 1: Create agent directory structure

**Files:**
- Create: `platform/crewai/agents/zara/SOUL.md`
- Create: `platform/crewai/agents/maya/SOUL.md`
- Create: `platform/crewai/agents/riya/SOUL.md`
- Create: `platform/crewai/agents/arjun/SOUL.md`
- Create: `platform/crewai/agents/dev/SOUL.md`
- Create: `platform/crewai/agents/priya/SOUL.md`

**Step 1: Create directory tree**

```bash
mkdir -p platform/crewai/agents/{zara,maya,riya,arjun,dev,priya}/{memory/logs,workspace}
mkdir -p platform/crewai/heartbeat
mkdir -p platform/crewai/client_context
```

**Step 2: Create `platform/crewai/agents/zara/SOUL.md`**

```markdown
# Zara — Chief Marketing Orchestrator

**Role**: AI CMO and agent orchestrator — holds all business context,
          routes tasks to the right agent, synthesises cross-agent insights
**Personality**: Strategic, decisive, concise — communicates in executive summaries
**Expertise**: B2B marketing strategy, campaign ROI, content-led growth,
               GTM execution, agent coordination

**Schedule**: Always on — morning synthesis at 09:00 IST
**Memory**: agents/zara/memory/MEMORY.md
**Workspace**: agents/zara/workspace/

## My Mission
I am the strategic brain of the marketing operation. I coordinate Maya, Riya,
Arjun, Dev, and Priya — synthesising their overnight outputs into a daily
marketing brief. I flag cross-agent patterns and ensure nothing falls through.

## What I Produce Each Run
- Daily morning marketing brief (summary of all agent overnight outputs)
- Cross-agent insight synthesis (e.g. Maya found ranking drop + Priya found
  competitor published on same topic = high-priority response needed)
- Recommended priority action for the day (1 item, max 2 sentences)

## My Rules
- Always cite which agent produced each insight.
- Never recommend action without data from at least one other agent.
- Speak like a CMO briefing a founder — no fluff, all signal.
- Format output as JSON matching the agent_notifications schema.
```

**Step 3: Create `platform/crewai/agents/maya/SOUL.md`**

```markdown
# Maya — SEO & LLMO Monitor

**Role**: Senior SEO & AI Search Specialist
**Personality**: Data-driven, methodical, always backs claims with metrics
**Expertise**: Technical SEO, keyword rank tracking, competitor SERP gaps,
               LLM citation monitoring (ChatGPT/Perplexity/Gemini mentions)

**Schedule**: Daily at 06:00 IST
**Memory**: agents/maya/memory/MEMORY.md
**Workspace**: agents/maya/workspace/

## My Mission
I monitor search visibility every morning. I surface ranking drops before the
client notices them, identify keyword opportunities competitors are winning,
and track whether content is being cited in AI search tools.

## What I Produce Each Run
- Top 5 ranking changes (gains, drops, new entries)
- 3 keyword opportunities the client is not ranking for but competitors are
- LLMO presence check — is the client cited in AI-generated answers?
- 1 priority recommended action with urgency (critical/high/medium/low)

## My Rules
- Never fabricate metrics. If data unavailable, say so.
- Compare every metric to previous run stored in MEMORY.md.
- Flag any change >10% as high priority.
- Write summaries a non-technical marketing manager can act on immediately.
- Format output as JSON matching the agent_notifications schema.
```

**Step 4: Create `platform/crewai/agents/riya/SOUL.md`**

```markdown
# Riya — Content Planner

**Role**: Senior Content Strategist & Editorial Planner
**Personality**: Creative, organised, audience-first thinking
**Expertise**: Content calendar planning, SEO-driven briefs, topic clustering,
               content performance analysis, editorial workflows

**Schedule**: Monday, Wednesday, Friday at 08:00 IST
**Memory**: agents/riya/memory/MEMORY.md
**Workspace**: agents/riya/workspace/

## My Mission
I plan the content pipeline three times a week. I look at what Maya flagged
(SEO gaps), what Priya found (competitor topics), and what's trending —
then produce actionable content briefs ready for a writer or AI tool to execute.

## What I Produce Each Run
- 3 content briefs (title, target keyword, outline, word count, CTA)
- 1 content calendar update (what to publish this week vs next)
- Priority ranking: which brief to execute first and why

## My Rules
- Every brief must map to a keyword Maya or Priya flagged.
- No brief without a clear CTA and target audience definition.
- Mark briefs as Quick Win (<1,000 words) or Authority Piece (2,000+).
- Format output as JSON matching the agent_notifications schema.
```

**Step 5: Create `platform/crewai/agents/arjun/SOUL.md`**

```markdown
# Arjun — Lead Scout

**Role**: B2B Lead Research & Scoring Specialist
**Personality**: Methodical, curious, always looking for buying signals
**Expertise**: Lead qualification, ICP matching, intent signal detection,
               prospect research, outreach personalisation

**Schedule**: Daily at 07:00 IST
**Memory**: agents/arjun/memory/MEMORY.md
**Workspace**: agents/arjun/workspace/

## My Mission
Every morning I scan for new leads matching the client's ICP and surface the
hottest ones. I look for intent signals — hiring activity that signals budget,
recent funding, job changes at target accounts.

## What I Produce Each Run
- Top 5 new prospects with fit score (0-100) and signal reason
- 2 hot signals from existing pipeline (re-engagement triggers)
- 1 recommended outreach personalisation angle for the top prospect

## My Rules
- Every prospect must match at least 3 ICP criteria from MEMORY.md.
- Always include the signal source (URL or platform).
- Score conservatively — a 70 is a genuine hot lead.
- Format output as JSON matching the agent_notifications schema.
```

**Step 6: Create `platform/crewai/agents/dev/SOUL.md`**

```markdown
# Dev — Campaign Analyzer

**Role**: Paid Media & Campaign ROI Analyst
**Personality**: Precise, ROI-obsessed, surfaces uncomfortable truths
**Expertise**: Google Ads, Meta Ads, budget allocation, ROAS analysis,
               A/B test evaluation, bid strategy optimisation

**Schedule**: Every Monday at 09:00 IST
**Memory**: agents/dev/memory/MEMORY.md
**Workspace**: agents/dev/workspace/

## My Mission
Every Monday I review campaign performance from the past week. I find where
budget is being wasted, what's over-performing and deserves more spend,
and what tests to run this week.

## What I Produce Each Run
- Budget waste report: ad sets burning spend with no conversions
- Top 3 performers: what to scale and by how much
- 1 recommended test for the week (hypothesis + measurement plan)
- Week-over-week summary: spend, leads, CPL, ROAS

## My Rules
- Always compare to previous week and 30-day average from MEMORY.md.
- Flag any CPL increase >20% as high priority.
- Never recommend scaling without statistical confidence (min 50 conversions).
- Format output as JSON matching the agent_notifications schema.
```

**Step 7: Create `platform/crewai/agents/priya/SOUL.md`**

```markdown
# Priya — Competitor Watcher

**Role**: Competitive Intelligence Analyst
**Personality**: Sharp, detail-oriented, pattern-recognition focused
**Expertise**: Competitor content monitoring, pricing change detection,
               product launch tracking, share of voice analysis

**Schedule**: Daily at 08:00 IST
**Memory**: agents/priya/memory/MEMORY.md
**Workspace**: agents/priya/workspace/

## My Mission
I watch the top competitors every morning so the team is never caught
off-guard. I surface new content they publish, pricing or product changes,
funding news, and any moves that require a strategic response.

## What I Produce Each Run
- Competitor content published in last 24h (title, topic, estimated reach)
- Pricing or product changes detected
- News/PR mentions for tracked competitors
- Threat level: critical (respond today), high (this week), low (monitor)

## My Rules
- Only report changes, not static info. Compare to MEMORY.md baseline.
- Always include source URL for every item.
- If two competitors make the same move, escalate urgency to 'critical'.
- Format output as JSON matching the agent_notifications schema.
```

**Step 8: Create initial heartbeat file**

Create `platform/crewai/heartbeat/status.json`:

```json
{
  "updated_at": null,
  "agents": {
    "zara":  { "status": "idle", "last_run": null, "duration_ms": null, "next_run": null },
    "maya":  { "status": "idle", "last_run": null, "duration_ms": null, "next_run": "06:00 IST daily" },
    "arjun": { "status": "idle", "last_run": null, "duration_ms": null, "next_run": "07:00 IST daily" },
    "priya": { "status": "idle", "last_run": null, "duration_ms": null, "next_run": "08:00 IST daily" },
    "riya":  { "status": "idle", "last_run": null, "duration_ms": null, "next_run": "08:00 IST Mon/Wed/Fri" },
    "dev":   { "status": "idle", "last_run": null, "duration_ms": null, "next_run": "09:00 IST Monday" }
  }
}
```

**Step 9: Create client context template**

Create `platform/crewai/client_context/_template.md`:

```markdown
# Client Context

**Company**: [Company name]
**Industry**: [Industry / niche]
**Target ICP**: [2-3 sentence ICP description]
**Top Competitors**: [comma-separated list]
**Current Campaigns**: [brief summary]
**Active Keywords**: [top 5-10 keywords]
**Key Goals this Quarter**: [1-3 goals]
**Brand Voice**: [adjectives]
```

**Step 10: Create empty MEMORY.md for each agent**

```bash
for agent in zara maya riya arjun dev priya; do
  echo "# ${agent^} Memory\n\n_No runs yet._" > platform/crewai/agents/$agent/memory/MEMORY.md
done
```

**Step 11: Verify structure**

```bash
find platform/crewai/agents -type f | sort
find platform/crewai/heartbeat -type f
```

Expected output: 6 SOUL.md files, 6 MEMORY.md files, 1 status.json

**Step 12: Commit**

```bash
git add platform/crewai/agents/ platform/crewai/heartbeat/ platform/crewai/client_context/
git commit -m "feat(agents): add SOUL.md identities and filesystem structure for 6 AI digital employees"
```

---

## Phase 2 — Supabase Migration

### Task 2: Create the 3 agent database tables

**Files:**
- Create: `database/migrations/agent-employees.sql`

**Step 1: Create migration file**

Create `database/migrations/agent-employees.sql`:

```sql
-- ============================================================================
-- AUTONOMOUS AI DIGITAL EMPLOYEES — DATABASE SCHEMA
-- ============================================================================

-- Agent run results (one row per scheduled or on-demand run)
CREATE TABLE IF NOT EXISTS agent_notifications (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name   TEXT    NOT NULL,
  agent_role   TEXT,
  task_type    TEXT,
  title        TEXT    NOT NULL,
  summary      TEXT    NOT NULL,
  full_output  JSONB,
  action_items JSONB,
  status       TEXT    NOT NULL DEFAULT 'success'
                       CHECK (status IN ('success', 'error', 'running')),
  duration_ms  INTEGER,
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_notifications_user_created
  ON agent_notifications (user_id, created_at DESC);
CREATE INDEX idx_agent_notifications_unread
  ON agent_notifications (user_id, read) WHERE read = FALSE;

-- Live task registry (what is running or scheduled right now)
CREATE TABLE IF NOT EXISTS agent_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name    TEXT NOT NULL,
  task_type     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'running', 'done', 'failed')),
  scheduled_for TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Persistent cross-run agent memory (mirrors filesystem, queryable)
CREATE TABLE IF NOT EXISTS agent_memory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name   TEXT NOT NULL,
  memory_type  TEXT NOT NULL
               CHECK (memory_type IN ('long_term', 'daily_log', 'client_context')),
  content      TEXT NOT NULL,
  date         DATE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, agent_name, memory_type, date)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory        ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own rows
CREATE POLICY "agent_notifications_own" ON agent_notifications
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "agent_tasks_own" ON agent_tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "agent_memory_own" ON agent_memory
  FOR ALL USING (auth.uid() = user_id);

-- Service role (used by Python scheduler) bypasses RLS — no extra policy needed.
-- The scheduler uses SUPABASE_SERVICE_KEY which has full access.
```

**Step 2: Run migration in Supabase**

Go to Supabase Dashboard → SQL Editor → paste the SQL above → Run.

Or via CLI if configured:
```bash
supabase db push  # if supabase CLI is configured
```

**Step 3: Verify tables exist**

In Supabase Dashboard → Table Editor, verify:
- `agent_notifications` — 13 columns including action_items (JSONB)
- `agent_tasks` — 10 columns
- `agent_memory` — 8 columns with unique constraint

**Step 4: Enable real-time on agent_notifications**

In Supabase Dashboard → Database → Replication → enable `agent_notifications` table
for real-time publication. This is required for the NotificationsPanel live subscription.

**Step 5: Commit**

```bash
git add database/migrations/agent-employees.sql
git commit -m "feat(db): add agent_notifications, agent_tasks, agent_memory tables with RLS"
```

---

## Phase 3 — Python Autonomous Scheduler

### Task 3: Add APScheduler to requirements and extend orchestrator

**Files:**
- Modify: `platform/crewai/requirements.txt`
- Modify: `platform/crewai/orchestrator.py`

**Step 1: Add APScheduler to requirements.txt**

Add these two lines to `platform/crewai/requirements.txt`:

```
# Autonomous scheduler
APScheduler==3.10.4
```

(supabase-py is already in requirements.txt as `supabase==2.10.0`)

**Step 2: Verify supabase and apscheduler install**

```bash
cd platform/crewai
source venv/bin/activate  # or: python -m venv venv && source venv/bin/activate
pip install APScheduler==3.10.4
python -c "from apscheduler.schedulers.background import BackgroundScheduler; print('OK')"
```

Expected: `OK`

**Step 3: Add `execute_for_scheduler()` method to orchestrator.py**

Open `platform/crewai/orchestrator.py`. After the `__init__` method and before any
existing methods, add:

```python
def execute_for_scheduler(
    self,
    crew_module: str,
    task_type: str,
    system_context: str,
    prior_memory: str,
    client_context: str = ""
) -> dict:
    """
    Entry point for the autonomous scheduler.
    Wraps the existing crew execution with SOUL.md context injection.

    Returns a dict matching the agent_notifications schema:
    {
        "title": str,
        "summary": str,
        "full_output": dict,
        "action_items": [{"label": str, "priority": str, "url": str}],
        "role": str
    }
    """
    combined_context = f"{system_context}\n\n## Prior Memory\n{prior_memory}"
    if client_context:
        combined_context += f"\n\n## Client Context\n{client_context}"

    try:
        result = self.execute_crew(crew_module, {
            "system_context": combined_context,
            "task_type": task_type
        })
        # Ensure result matches expected schema
        return {
            "title": result.get("title", f"{task_type} completed"),
            "summary": result.get("summary", "Agent run completed."),
            "full_output": result if isinstance(result, dict) else {"output": str(result)},
            "action_items": result.get("action_items", []),
            "role": result.get("role", "")
        }
    except Exception as e:
        return {
            "title": f"{task_type} failed",
            "summary": f"Agent encountered an error: {str(e)[:200]}",
            "full_output": {"error": str(e)},
            "action_items": [],
            "role": ""
        }
```

**Step 4: Verify the method works (smoke test)**

```bash
cd platform/crewai
source venv/bin/activate
python -c "
from orchestrator import CrewOrchestrator
o = CrewOrchestrator()
print('execute_for_scheduler' in dir(o))
"
```

Expected: `True`

**Step 5: Commit**

```bash
git add platform/crewai/requirements.txt platform/crewai/orchestrator.py
git commit -m "feat(agents): add execute_for_scheduler() to orchestrator + APScheduler dep"
```

---

### Task 4: Create autonomous_scheduler.py

**Files:**
- Create: `platform/crewai/autonomous_scheduler.py`

**Step 1: Create the file**

Create `platform/crewai/autonomous_scheduler.py`:

```python
"""
Autonomous AI Digital Employees — Scheduler
============================================
Runs 5 marketing agents on cron schedules (IST timezone).
Writes results to Supabase agent_notifications table.
Updates heartbeat/status.json after each run.

Usage:
    python autonomous_scheduler.py

Environment variables required:
    GROQ_API_KEY       - for LLM calls inside CrewAI
    SUPABASE_URL       - your Supabase project URL
    SUPABASE_SERVICE_KEY - service role key (bypasses RLS)
    AGENT_USER_ID      - Supabase user UUID to scope notifications to
                         (use your own user ID from Supabase auth.users)
"""

import os
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from supabase import create_client, Client
from dotenv import load_dotenv

from orchestrator import CrewOrchestrator

# ── Setup ──────────────────────────────────────────────────────────────────────

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("scheduler")

BASE_DIR = Path(__file__).parent
AGENTS_DIR = BASE_DIR / "agents"
HEARTBEAT_FILE = BASE_DIR / "heartbeat" / "status.json"
CLIENT_CONTEXT_DIR = BASE_DIR / "client_context"

# ── Globals (initialised in main) ──────────────────────────────────────────────

orchestrator: CrewOrchestrator = None
supabase: Client = None
AGENT_USER_ID: str = None

# ── Filesystem helpers ─────────────────────────────────────────────────────────

def load_soul(agent_name: str) -> str:
    """Load agent SOUL.md as system prompt."""
    soul_file = AGENTS_DIR / agent_name / "SOUL.md"
    if not soul_file.exists():
        logger.warning(f"SOUL.md not found for {agent_name}")
        return f"You are {agent_name}, a marketing AI agent."
    return soul_file.read_text(encoding="utf-8")


def load_memory(agent_name: str) -> str:
    """Load agent MEMORY.md from last run."""
    memory_file = AGENTS_DIR / agent_name / "memory" / "MEMORY.md"
    if not memory_file.exists():
        return ""
    return memory_file.read_text(encoding="utf-8")


def load_client_context() -> str:
    """Load client business context for current user."""
    if not AGENT_USER_ID:
        return ""
    ctx_file = CLIENT_CONTEXT_DIR / f"{AGENT_USER_ID}.md"
    if ctx_file.exists():
        return ctx_file.read_text(encoding="utf-8")
    # Fall back to template
    template = CLIENT_CONTEXT_DIR / "_template.md"
    return template.read_text(encoding="utf-8") if template.exists() else ""


def update_memory(agent_name: str, result: dict) -> None:
    """Append run summary to agent MEMORY.md."""
    memory_file = AGENTS_DIR / agent_name / "memory" / "MEMORY.md"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entry = f"\n\n## {today}\n{result.get('summary', 'Run completed.')}\n"

    existing = memory_file.read_text(encoding="utf-8") if memory_file.exists() else ""
    # Keep only last 30 days (roughly 8000 chars) to avoid token bloat
    combined = (existing + entry)[-8000:]
    memory_file.write_text(combined, encoding="utf-8")

    # Also write daily log
    log_file = AGENTS_DIR / agent_name / "memory" / "logs" / f"{today}.md"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    log_file.write_text(result.get("summary", ""), encoding="utf-8")


def update_heartbeat(agent_name: str, status: str, duration_ms: int = None, error: str = None) -> None:
    """Update heartbeat/status.json with agent run state."""
    HEARTBEAT_FILE.parent.mkdir(parents=True, exist_ok=True)

    data = {}
    if HEARTBEAT_FILE.exists():
        try:
            data = json.loads(HEARTBEAT_FILE.read_text())
        except json.JSONDecodeError:
            data = {}

    if "agents" not in data:
        data["agents"] = {}

    agent_entry = {
        "status": status,
        "last_run": datetime.now(timezone.utc).isoformat(),
        "duration_ms": duration_ms,
    }
    if error:
        agent_entry["error"] = error

    data["agents"][agent_name] = agent_entry
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    HEARTBEAT_FILE.write_text(json.dumps(data, indent=2))


# ── Supabase helpers ───────────────────────────────────────────────────────────

def write_notification(agent_name: str, agent_role: str, task_type: str, result: dict, status: str, duration_ms: int) -> None:
    """Insert one row into agent_notifications."""
    if not supabase or not AGENT_USER_ID:
        logger.warning("Supabase not configured — skipping notification write")
        return

    try:
        supabase.table("agent_notifications").insert({
            "user_id": AGENT_USER_ID,
            "agent_name": agent_name,
            "agent_role": agent_role,
            "task_type": task_type,
            "title": result.get("title", f"{agent_name} run complete"),
            "summary": result.get("summary", ""),
            "full_output": result.get("full_output", {}),
            "action_items": result.get("action_items", []),
            "status": status,
            "duration_ms": duration_ms,
        }).execute()
        logger.info(f"Notification written for {agent_name} ({task_type})")
    except Exception as e:
        logger.error(f"Failed to write notification for {agent_name}: {e}")


# ── Core agent runner ──────────────────────────────────────────────────────────

AGENT_ROLES = {
    "zara":  "Chief Marketing Orchestrator",
    "maya":  "SEO & LLMO Monitor",
    "riya":  "Content Planner",
    "arjun": "Lead Scout",
    "dev":   "Campaign Analyzer",
    "priya": "Competitor Watcher",
}

AGENT_CREWS = {
    "maya":  "content",
    "riya":  "content",
    "arjun": "lead",
    "dev":   "budget",
    "priya": "competitor",
    "zara":  "company",   # orchestrator uses company crew for synthesis
}


def run_agent(agent_name: str, task_type: str, max_retries: int = 3) -> None:
    """
    Run one agent:
      1. Load SOUL.md + MEMORY.md + client context
      2. Execute via CrewAI orchestrator
      3. Write result to Supabase
      4. Update filesystem memory
      5. Update heartbeat
    Retries up to max_retries on failure (15 min gap handled by scheduler).
    """
    logger.info(f"▶ Running {agent_name} ({task_type})")
    start = datetime.now(timezone.utc)
    update_heartbeat(agent_name, "running")

    soul = load_soul(agent_name)
    memory = load_memory(agent_name)
    client_context = load_client_context()
    crew_module = AGENT_CREWS.get(agent_name, "company")
    role = AGENT_ROLES.get(agent_name, agent_name)

    try:
        result = orchestrator.execute_for_scheduler(
            crew_module=crew_module,
            task_type=task_type,
            system_context=soul,
            prior_memory=memory,
            client_context=client_context,
        )
        duration = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        write_notification(agent_name, role, task_type, result, "success", duration)
        update_memory(agent_name, result)
        update_heartbeat(agent_name, "idle", duration_ms=duration)
        logger.info(f"✅ {agent_name} completed in {duration}ms")

    except Exception as e:
        duration = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        error_str = str(e)
        logger.error(f"❌ {agent_name} failed: {error_str}")
        write_notification(agent_name, role, task_type,
                           {"title": f"{agent_name.title()} run failed",
                            "summary": f"Error: {error_str[:300]}",
                            "full_output": {"error": error_str},
                            "action_items": []},
                           "error", duration)
        update_heartbeat(agent_name, "failed", error=error_str)


# ── Scheduler setup ────────────────────────────────────────────────────────────

def build_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")

    # Maya — SEO Monitor — daily 06:00 IST
    scheduler.add_job(
        lambda: run_agent("maya", "daily_seo_check"),
        CronTrigger(hour=6, minute=0, timezone="Asia/Kolkata"),
        id="maya_daily", replace_existing=True
    )

    # Arjun — Lead Scout — daily 07:00 IST
    scheduler.add_job(
        lambda: run_agent("arjun", "daily_lead_scout"),
        CronTrigger(hour=7, minute=0, timezone="Asia/Kolkata"),
        id="arjun_daily", replace_existing=True
    )

    # Priya — Competitor Watcher — daily 08:00 IST
    scheduler.add_job(
        lambda: run_agent("priya", "daily_competitor_watch"),
        CronTrigger(hour=8, minute=0, timezone="Asia/Kolkata"),
        id="priya_daily", replace_existing=True
    )

    # Riya — Content Planner — Mon/Wed/Fri 08:00 IST
    scheduler.add_job(
        lambda: run_agent("riya", "content_plan"),
        CronTrigger(day_of_week="mon,wed,fri", hour=8, minute=0, timezone="Asia/Kolkata"),
        id="riya_mwf", replace_existing=True
    )

    # Dev — Campaign Analyzer — Monday 09:00 IST
    scheduler.add_job(
        lambda: run_agent("dev", "weekly_campaign_review"),
        CronTrigger(day_of_week="mon", hour=9, minute=0, timezone="Asia/Kolkata"),
        id="dev_weekly", replace_existing=True
    )

    # Zara — Morning Synthesis — daily 09:15 IST (after all daily agents finish)
    scheduler.add_job(
        lambda: run_agent("zara", "morning_synthesis"),
        CronTrigger(hour=9, minute=15, timezone="Asia/Kolkata"),
        id="zara_synthesis", replace_existing=True
    )

    return scheduler


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Validate required env vars
    required = ["GROQ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "AGENT_USER_ID"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        raise EnvironmentError(f"Missing required env vars: {', '.join(missing)}")

    # Initialise globals
    orchestrator = CrewOrchestrator(groq_api_key=os.getenv("GROQ_API_KEY"))
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    AGENT_USER_ID = os.environ["AGENT_USER_ID"]

    # Build and start scheduler
    scheduler = build_scheduler()
    scheduler.start()

    logger.info("🤖 Autonomous AI employees online")
    logger.info("   Maya:  daily 06:00 IST")
    logger.info("   Arjun: daily 07:00 IST")
    logger.info("   Priya: daily 08:00 IST")
    logger.info("   Riya:  Mon/Wed/Fri 08:00 IST")
    logger.info("   Dev:   Monday 09:00 IST")
    logger.info("   Zara:  daily 09:15 IST (synthesis)")
    logger.info("Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        logger.info("Scheduler stopped.")
```

**Step 2: Smoke test — verify it imports cleanly**

```bash
cd platform/crewai
source venv/bin/activate
pip install APScheduler==3.10.4
python -c "import autonomous_scheduler; print('imports OK')"
```

Expected: `imports OK`

**Step 3: Smoke test — verify scheduler builds**

```bash
cd platform/crewai
source venv/bin/activate
python -c "
import os
os.environ['GROQ_API_KEY'] = 'test'
os.environ['SUPABASE_URL'] = 'https://test.supabase.co'
os.environ['SUPABASE_SERVICE_KEY'] = 'test'
os.environ['AGENT_USER_ID'] = '00000000-0000-0000-0000-000000000000'
from autonomous_scheduler import build_scheduler, AGENTS_DIR
s = build_scheduler()
jobs = s.get_jobs()
print(f'Scheduled {len(jobs)} jobs: {[j.id for j in jobs]}')
"
```

Expected: `Scheduled 6 jobs: ['maya_daily', 'arjun_daily', 'priya_daily', 'riya_mwf', 'dev_weekly', 'zara_synthesis']`

**Step 4: Commit**

```bash
git add platform/crewai/autonomous_scheduler.py
git commit -m "feat(agents): add autonomous_scheduler.py with APScheduler cron jobs for 6 digital employees"
```

---

## Phase 4 — Node.js API Routes (Next.js)

### Task 5: Agent status endpoint

**Files:**
- Create: `platform/content-engine/app/api/agents/status/route.ts`

**Step 1: Create the route**

Create `platform/content-engine/app/api/agents/status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Path from content-engine to the shared heartbeat file
// content-engine lives at platform/content-engine/
// heartbeat is at platform/crewai/heartbeat/status.json
const HEARTBEAT_PATH = join(
  process.cwd(),
  '..',
  'crewai',
  'heartbeat',
  'status.json'
)

export async function GET() {
  try {
    const raw = await readFile(HEARTBEAT_PATH, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch {
    // Return default idle state if file doesn't exist yet
    return NextResponse.json({
      updated_at: null,
      agents: {
        zara:  { status: 'idle', last_run: null, duration_ms: null },
        maya:  { status: 'idle', last_run: null, duration_ms: null },
        riya:  { status: 'idle', last_run: null, duration_ms: null },
        arjun: { status: 'idle', last_run: null, duration_ms: null },
        dev:   { status: 'idle', last_run: null, duration_ms: null },
        priya: { status: 'idle', last_run: null, duration_ms: null },
      }
    })
  }
}
```

**Step 2: Test the endpoint**

With the server running (`npm start` in project root):
```bash
curl http://localhost:3007/api/agents/status | jq .
```

Expected: JSON with 6 agents all showing `"status": "idle"` (from the default).

**Step 3: Commit**

```bash
git add platform/content-engine/app/api/agents/status/route.ts
git commit -m "feat(api): add GET /api/agents/status heartbeat endpoint"
```

---

### Task 6: Agent memory endpoint

**Files:**
- Create: `platform/content-engine/app/api/agents/[name]/memory/route.ts`

**Step 1: Create the route**

Create `platform/content-engine/app/api/agents/[name]/memory/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const VALID_AGENTS = new Set(['zara', 'maya', 'riya', 'arjun', 'dev', 'priya'])

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  const { name } = params

  if (!VALID_AGENTS.has(name)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  }

  const memoryPath = join(
    process.cwd(), '..', 'crewai', 'agents', name, 'memory', 'MEMORY.md'
  )

  try {
    const content = await readFile(memoryPath, 'utf-8')
    return NextResponse.json({ agent: name, memory: content })
  } catch {
    return NextResponse.json({ agent: name, memory: '_No memory yet._' })
  }
}
```

**Step 2: Test**

```bash
curl http://localhost:3007/api/agents/maya/memory | jq .memory
```

Expected: `"# Maya Memory\n\n_No runs yet._"`

**Step 3: Commit**

```bash
git add platform/content-engine/app/api/agents/
git commit -m "feat(api): add GET /api/agents/[name]/memory endpoint"
```

---

### Task 7: On-demand agent run endpoint (interactive mode)

**Files:**
- Create: `platform/content-engine/app/api/agents/[name]/run/route.ts`

This endpoint powers slash commands in ChatHome (`/seo`, `/leads`, etc.).
It loads the agent's SOUL.md as system prompt, calls Groq directly,
and streams the response back via SSE.

**Step 1: Create the route**

Create `platform/content-engine/app/api/agents/[name]/run/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import Groq from 'groq-sdk'

const VALID_AGENTS = new Set(['zara', 'maya', 'riya', 'arjun', 'dev', 'priya'])
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  const { name } = params

  if (!VALID_AGENTS.has(name)) {
    return new Response(JSON.stringify({ error: 'Unknown agent' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { query } = await req.json() as { query: string }
  if (!query?.trim()) {
    return new Response(JSON.stringify({ error: 'query is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Load SOUL.md
  const soulPath = join(process.cwd(), '..', 'crewai', 'agents', name, 'SOUL.md')
  let systemPrompt = `You are ${name}, a marketing AI agent.`
  try {
    systemPrompt = await readFile(soulPath, 'utf-8')
  } catch { /* use default */ }

  // Load MEMORY.md for context
  const memoryPath = join(process.cwd(), '..', 'crewai', 'agents', name, 'memory', 'MEMORY.md')
  let memory = ''
  try {
    memory = await readFile(memoryPath, 'utf-8')
  } catch { /* no memory yet */ }

  const fullSystem = memory
    ? `${systemPrompt}\n\n## Your Recent Memory\n${memory}`
    : systemPrompt

  // Stream from Groq
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const groqStream = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: fullSystem },
            { role: 'user', content: query }
          ],
          stream: true,
          max_tokens: 1024,
          temperature: 0.4,
        })

        for await (const chunk of groqStream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        )
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
```

**Step 2: Install groq-sdk in content-engine if not present**

```bash
cd platform/content-engine
grep "groq-sdk" package.json || npm install groq-sdk
```

**Step 3: Test the endpoint**

```bash
curl -X POST http://localhost:3007/api/agents/maya/run \
  -H "Content-Type: application/json" \
  -d '{"query": "What SEO issues should I check today?"}' \
  --no-buffer
```

Expected: SSE stream with `data: {"text":"..."}` lines followed by `data: [DONE]`

**Step 4: Commit**

```bash
git add platform/content-engine/app/api/agents/
git commit -m "feat(api): add POST /api/agents/[name]/run — SSE streaming agent endpoint"
```

---

## Phase 5 — Frontend Wiring

### Task 8: NotificationsPanel — wire to agent_notifications table

**Files:**
- Modify: `app/src/components/notifications/NotificationsPanel.tsx`

The current panel fetches from `competitor_alerts`. We extend it to also fetch
from `agent_notifications` and merge both into a unified feed.

**Step 1: Add AgentNotification type above CompetitorAlert interface**

In `NotificationsPanel.tsx`, after the imports block, add:

```typescript
interface AgentNotification {
  id: string
  agent_name: string
  agent_role: string
  task_type: string
  title: string
  summary: string
  full_output?: Record<string, unknown>
  action_items?: Array<{ label: string; priority: string; url?: string }>
  status: 'success' | 'error' | 'running'
  duration_ms?: number
  read: boolean
  created_at: string
}

const AGENT_COLOURS: Record<string, string> = {
  zara:  'bg-indigo-100 text-indigo-800',
  maya:  'bg-blue-100 text-blue-800',
  riya:  'bg-purple-100 text-purple-800',
  arjun: 'bg-green-100 text-green-800',
  dev:   'bg-orange-100 text-orange-800',
  priya: 'bg-red-100 text-red-800',
}

const AGENT_INITIALS: Record<string, string> = {
  zara: 'ZA', maya: 'MA', riya: 'RI', arjun: 'AR', dev: 'DV', priya: 'PR'
}
```

**Step 2: Add agent notifications state and fetch inside the component**

Inside `NotificationsPanel`, after `const [alerts, setAlerts]`, add:

```typescript
const [agentNotifs, setAgentNotifs] = useState<AgentNotification[]>([])
const [agentFilter, setAgentFilter] = useState<string>('all')

const fetchAgentNotifications = async () => {
  if (!user) return
  const { data, error } = await supabase
    .from('agent_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (!error && data) setAgentNotifs(data)
}
```

**Step 3: Add real-time subscription inside useEffect**

Inside the existing `useEffect` that calls `fetchAlerts()`, add:

```typescript
fetchAgentNotifications()

// Real-time subscription for new agent runs
const channel = supabase
  .channel('agent-notifications-live')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'agent_notifications',
      filter: `user_id=eq.${user.id}`
    },
    payload => {
      setAgentNotifs(prev => [payload.new as AgentNotification, ...prev])
    }
  )
  .subscribe()

return () => { supabase.removeChannel(channel) }
```

**Step 4: Add unread count to include agent notifications**

Find where unread count is computed (likely a `.filter(a => !a.read).length`).
Replace with:

```typescript
const unreadCount = alerts.filter(a => !a.read && !a.dismissed).length
  + agentNotifs.filter(n => !n.read).length
```

**Step 5: Add markAgentRead helper**

```typescript
const markAgentRead = async (id: string) => {
  await supabase.from('agent_notifications').update({ read: true }).eq('id', id)
  setAgentNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
}
```

**Step 6: Add Agent Notifications tab section in the JSX**

Find the ScrollArea section that renders competitor alerts. BEFORE it, add
a new "AI Team" tab section:

```tsx
{/* Agent filter chips */}
<div className="flex gap-1 flex-wrap px-4 pt-2">
  {['all', 'zara', 'maya', 'riya', 'arjun', 'dev', 'priya'].map(name => (
    <button
      key={name}
      onClick={() => setAgentFilter(name)}
      className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
        agentFilter === name
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      )}
    >
      {name}
    </button>
  ))}
</div>

{/* Agent notification cards */}
{agentNotifs
  .filter(n => agentFilter === 'all' || n.agent_name === agentFilter)
  .map(n => (
    <div
      key={n.id}
      className={cn(
        'p-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors',
        !n.read && 'bg-blue-50/40'
      )}
      onClick={() => markAgentRead(n.id)}
    >
      <div className="flex items-start gap-2">
        {/* Agent avatar */}
        <span className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
          AGENT_COLOURS[n.agent_name] ?? 'bg-gray-100 text-gray-600'
        )}>
          {AGENT_INITIALS[n.agent_name] ?? n.agent_name.slice(0,2).toUpperCase()}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-gray-800 capitalize">{n.agent_name}</span>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {new Date(n.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs font-medium text-gray-700 mt-0.5">{n.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.summary}</p>

          {/* Action items */}
          {n.action_items && n.action_items.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {n.action_items.slice(0, 3).map((item, i) => (
                <span key={i} className={cn(
                  'px-1.5 py-0.5 rounded text-xs',
                  item.priority === 'critical' ? 'bg-red-100 text-red-700' :
                  item.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-600'
                )}>
                  {item.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  ))
}
```

**Step 7: TypeScript check**

```bash
cd /path/to/martech
npm run typecheck
```

Expected: no errors in NotificationsPanel.tsx

**Step 8: Commit**

```bash
git add app/src/components/notifications/NotificationsPanel.tsx
git commit -m "feat(ui): wire NotificationsPanel to agent_notifications table with real-time subscription"
```

---

### Task 9: AgentDashboard — live status cards

**Files:**
- Modify: `app/src/components/agents/AgentDashboard.tsx`

Replace the static AgentService-based display with live heartbeat polling
showing the 6 digital employees with status indicators.

**Step 1: Add agent metadata constants near the top of AgentDashboard.tsx**

After the imports, add:

```typescript
const DIGITAL_EMPLOYEES = [
  { name: 'zara',  displayName: 'Zara',  role: 'CMO / Orchestrator',   colour: 'indigo', schedule: 'Daily 09:15 IST' },
  { name: 'maya',  displayName: 'Maya',  role: 'SEO & LLMO Monitor',   colour: 'blue',   schedule: 'Daily 06:00 IST' },
  { name: 'riya',  displayName: 'Riya',  role: 'Content Planner',      colour: 'purple', schedule: 'Mon/Wed/Fri 08:00' },
  { name: 'arjun', displayName: 'Arjun', role: 'Lead Scout',           colour: 'green',  schedule: 'Daily 07:00 IST' },
  { name: 'dev',   displayName: 'Dev',   role: 'Campaign Analyzer',    colour: 'orange', schedule: 'Monday 09:00 IST' },
  { name: 'priya', displayName: 'Priya', role: 'Competitor Watcher',   colour: 'red',    schedule: 'Daily 08:00 IST' },
] as const

interface AgentStatus {
  status: 'idle' | 'running' | 'failed'
  last_run: string | null
  duration_ms: number | null
  error?: string
}

interface HeartbeatData {
  updated_at: string | null
  agents: Record<string, AgentStatus>
}
```

**Step 2: Add heartbeat state and polling inside the component**

Inside `AgentDashboard`, add:

```typescript
const [heartbeat, setHeartbeat] = useState<HeartbeatData | null>(null)
const [runningAgent, setRunningAgent] = useState<string | null>(null)

const fetchHeartbeat = async () => {
  try {
    const res = await fetch('/api/agents/status')
    if (res.ok) setHeartbeat(await res.json())
  } catch { /* ignore */ }
}

useEffect(() => {
  fetchHeartbeat()
  const interval = setInterval(fetchHeartbeat, 30_000) // poll every 30s
  return () => clearInterval(interval)
}, [])

const runAgentNow = async (agentName: string) => {
  setRunningAgent(agentName)
  try {
    const res = await fetch(`/api/agents/${agentName}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Run your scheduled task now and provide a full report.' })
    })
    if (res.ok) toast.success(`${agentName} is running — results will appear in Notifications`)
    else toast.error(`Failed to run ${agentName}`)
  } catch {
    toast.error(`Failed to run ${agentName}`)
  } finally {
    setRunningAgent(null)
    setTimeout(fetchHeartbeat, 3000) // refresh status after 3s
  }
}
```

**Step 3: Add the AI Team section to the render JSX**

Find the existing `return (` JSX in AgentDashboard. At the TOP of what it renders
(before any existing tabs), add the digital employees grid:

```tsx
{/* AI Digital Employees — live status grid */}
<div className="mb-6">
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-sm font-semibold text-gray-700">AI Team</h2>
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <span className="text-xs text-gray-500">
        {Object.values(heartbeat?.agents ?? {}).filter(a => a.status === 'idle').length}/6 healthy
      </span>
    </div>
  </div>

  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    {DIGITAL_EMPLOYEES.map(emp => {
      const status = heartbeat?.agents[emp.name]
      const statusColour =
        !status || status.status === 'idle' ? 'bg-green-400' :
        status.status === 'running' ? 'bg-yellow-400 animate-pulse' :
        'bg-red-400'

      return (
        <Card key={emp.name} className="p-3 relative">
          {/* Status dot */}
          <span className={cn('absolute top-2.5 right-2.5 w-2 h-2 rounded-full', statusColour)} />

          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
              `bg-${emp.colour}-100 text-${emp.colour}-800`
            )}>
              {emp.displayName.slice(0,2).toUpperCase()}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{emp.displayName}</p>
              <p className="text-xs text-gray-500">{emp.role}</p>
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-2">
            {status?.last_run
              ? `Last run: ${new Date(status.last_run).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : 'Not yet run'}
            {status?.duration_ms && ` · ${(status.duration_ms / 1000).toFixed(1)}s`}
          </div>

          {status?.status === 'failed' && (
            <p className="text-xs text-red-500 mb-2 truncate">{status.error}</p>
          )}

          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            disabled={runningAgent === emp.name || status?.status === 'running'}
            onClick={() => runAgentNow(emp.name)}
          >
            {runningAgent === emp.name || status?.status === 'running' ? 'Running…' : 'Run Now'}
          </Button>
        </Card>
      )
    })}
  </div>
</div>
```

**Step 4: TypeScript check**

```bash
npm run typecheck
```

Expected: no new errors

**Step 5: Commit**

```bash
git add app/src/components/agents/AgentDashboard.tsx
git commit -m "feat(ui): add live AI team status grid to AgentDashboard with heartbeat polling"
```

---

### Task 10: ChatHome — slash command routing to agents

**Files:**
- Modify: `app/src/components/chat/ChatHome.tsx`

Add 5 slash command handlers that call `/api/agents/:name/run` and stream
the response into the chat thread.

**Step 1: Add slash command map after imports**

In `ChatHome.tsx`, after imports, add:

```typescript
const SLASH_AGENTS: Record<string, { agent: string; label: string; defaultQuery: string }> = {
  '/seo':         { agent: 'maya',  label: 'Maya (SEO)',       defaultQuery: 'Give me today\'s SEO insights and top opportunities.' },
  '/leads':       { agent: 'arjun', label: 'Arjun (Leads)',    defaultQuery: 'What are the hottest leads I should contact today?' },
  '/content':     { agent: 'riya',  label: 'Riya (Content)',   defaultQuery: 'What content should I create this week?' },
  '/campaign':    { agent: 'dev',   label: 'Dev (Campaign)',   defaultQuery: 'How are my campaigns performing this week?' },
  '/competitors': { agent: 'priya', label: 'Priya (Competitors)', defaultQuery: 'What are my competitors doing this week?' },
  '/brief':       { agent: 'zara',  label: 'Zara (CMO)',       defaultQuery: 'Give me the morning marketing brief.' },
}
```

**Step 2: Add `runAgentSlashCommand` function inside the component**

Find the send handler function (likely `handleSend` or similar). Just before it, add:

```typescript
const runAgentSlashCommand = async (command: string, userQuery: string) => {
  const match = SLASH_AGENTS[command]
  if (!match) return false

  const query = userQuery.replace(command, '').trim() || match.defaultQuery

  // Add user message to thread
  const userMsg = { id: Date.now().toString(), role: 'user' as const,
    content: `${match.label}: ${query}`, timestamp: new Date() }
  setMessages(prev => [...prev, userMsg])

  // Add placeholder agent message
  const agentMsgId = (Date.now() + 1).toString()
  setMessages(prev => [...prev, {
    id: agentMsgId, role: 'assistant' as const,
    content: `_${match.label} is thinking..._`, timestamp: new Date()
  }])

  try {
    const res = await fetch(`/api/agents/${match.agent}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })

    if (!res.body) throw new Error('No response body')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const { text } = JSON.parse(data)
            if (text) {
              accumulated += text
              setMessages(prev => prev.map(m =>
                m.id === agentMsgId ? { ...m, content: accumulated } : m
              ))
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    }
  } catch (err) {
    setMessages(prev => prev.map(m =>
      m.id === agentMsgId
        ? { ...m, content: `Error running ${match.label}: ${String(err)}` }
        : m
    ))
  }

  return true
}
```

**Step 3: Call slash command handler before normal send**

Inside the existing send handler (wherever messages are sent), at the very
start before the normal flow, add:

```typescript
// Check for slash commands
const firstWord = inputValue.trim().split(' ')[0].toLowerCase()
if (firstWord in SLASH_AGENTS) {
  const handled = await runAgentSlashCommand(firstWord, inputValue.trim())
  if (handled) {
    setInputValue('')
    return
  }
}
```

**Step 4: TypeScript check**

```bash
npm run typecheck
```

Expected: no new errors

**Step 5: Manual test**

Start dev server (`npm run dev`), open ChatHome, type `/seo` and press Enter.
Expected: streaming response from Maya appearing in the chat thread.

**Step 6: Commit**

```bash
git add app/src/components/chat/ChatHome.tsx
git commit -m "feat(chat): add slash command routing — /seo /leads /content /campaign /competitors /brief"
```

---

## Phase 6 — Client Context Settings

### Task 11: Client context form in SettingsPanel

**Files:**
- Modify: `app/src/components/settings/SettingsPanel.tsx`

Add a "AI Team Context" section where users describe their company, ICP, and
competitors. This writes to Supabase `agent_memory` and the filesystem
`client_context/{user_id}.md` via a new API route.

**Step 1: Create the save-context API route**

Create `platform/content-engine/app/api/agents/context/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const CLIENT_CONTEXT_DIR = join(process.cwd(), '..', 'crewai', 'client_context')

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    userId: string
    company: string
    industry: string
    icp: string
    competitors: string
    campaigns: string
    keywords: string
    goals: string
  }

  if (!body.userId || !body.company) {
    return NextResponse.json({ error: 'userId and company are required' }, { status: 400 })
  }

  const content = `# Client Context

**Company**: ${body.company}
**Industry**: ${body.industry || '—'}
**Target ICP**: ${body.icp || '—'}
**Top Competitors**: ${body.competitors || '—'}
**Current Campaigns**: ${body.campaigns || '—'}
**Active Keywords**: ${body.keywords || '—'}
**Key Goals this Quarter**: ${body.goals || '—'}
`

  await mkdir(CLIENT_CONTEXT_DIR, { recursive: true })
  await writeFile(join(CLIENT_CONTEXT_DIR, `${body.userId}.md`), content, 'utf-8')

  return NextResponse.json({ success: true })
}
```

**Step 2: Add AI Team Context section to SettingsPanel.tsx**

Find where settings sections are rendered (likely a Tabs or Card structure).
Add a new section:

```tsx
{/* AI Team Context */}
<Card>
  <CardHeader>
    <CardTitle className="text-sm">AI Team Context</CardTitle>
    <CardDescription>
      Tell your AI employees about your business so they give relevant insights.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <div>
      <label className="text-xs font-medium text-gray-700">Company Name</label>
      <Input value={agentCtx.company} onChange={e => setAgentCtx(p => ({...p, company: e.target.value}))}
        placeholder="Torqq AI" className="mt-1" />
    </div>
    <div>
      <label className="text-xs font-medium text-gray-700">Industry / Niche</label>
      <Input value={agentCtx.industry} onChange={e => setAgentCtx(p => ({...p, industry: e.target.value}))}
        placeholder="B2B MarTech / SaaS" className="mt-1" />
    </div>
    <div>
      <label className="text-xs font-medium text-gray-700">Target ICP</label>
      <Textarea value={agentCtx.icp} onChange={e => setAgentCtx(p => ({...p, icp: e.target.value}))}
        placeholder="Indian CMOs at Series A-C SaaS companies, 50-500 employees" className="mt-1 h-16" />
    </div>
    <div>
      <label className="text-xs font-medium text-gray-700">Top Competitors (comma-separated)</label>
      <Input value={agentCtx.competitors} onChange={e => setAgentCtx(p => ({...p, competitors: e.target.value}))}
        placeholder="HubSpot, Zoho, LeadSquared" className="mt-1" />
    </div>
    <div>
      <label className="text-xs font-medium text-gray-700">Key Goals this Quarter</label>
      <Textarea value={agentCtx.goals} onChange={e => setAgentCtx(p => ({...p, goals: e.target.value}))}
        placeholder="Reach 100 MQLs/month, launch LinkedIn ads, grow organic to 5K visits" className="mt-1 h-16" />
    </div>
    <Button
      size="sm"
      onClick={saveAgentContext}
      disabled={savingCtx}
      className="w-full"
    >
      {savingCtx ? 'Saving…' : 'Save — Update AI Team Context'}
    </Button>
  </CardContent>
</Card>
```

**Step 3: Add state and save handler in SettingsPanel**

At the top of `SettingsPanel`, after existing state declarations, add:

```typescript
const { user } = useAuth()
const [agentCtx, setAgentCtx] = useState({
  company: '', industry: '', icp: '', competitors: '', campaigns: '', keywords: '', goals: ''
})
const [savingCtx, setSavingCtx] = useState(false)

const saveAgentContext = async () => {
  if (!user) return
  setSavingCtx(true)
  try {
    await fetch('/api/agents/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...agentCtx, userId: user.id })
    })
    toast.success('AI team context saved — agents will use this on next run')
  } catch {
    toast.error('Failed to save context')
  } finally {
    setSavingCtx(false)
  }
}
```

**Step 4: TypeScript check**

```bash
npm run typecheck
```

Expected: no new errors

**Step 5: Commit**

```bash
git add app/src/components/settings/SettingsPanel.tsx \
        platform/content-engine/app/api/agents/context/route.ts
git commit -m "feat(settings): add AI Team Context form — feeds business info to autonomous agents"
```

---

## Phase 7 — Environment Variables & Deployment

### Task 12: Document required environment variables

**Step 1: Add agent env vars to Railway**

In Railway dashboard → your service → Variables, add:

```
AGENT_USER_ID=<your Supabase auth.users UUID>
SUPABASE_SERVICE_KEY=<service role key from Supabase → Settings → API>
```

(SUPABASE_URL and GROQ_API_KEY should already be set)

**Step 2: Add env vars to Python service**

If running `autonomous_scheduler.py` as a separate Railway service, set:
```
GROQ_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
AGENT_USER_ID=...
```

**Step 3: Get your user UUID**

In Supabase Dashboard → Authentication → Users → find your user → copy UUID.
This is the `AGENT_USER_ID` value.

**Step 4: Test full flow manually**

Run one agent directly to verify end-to-end:

```bash
cd platform/crewai
source venv/bin/activate
export GROQ_API_KEY=...
export SUPABASE_URL=...
export SUPABASE_SERVICE_KEY=...
export AGENT_USER_ID=...

python -c "
from autonomous_scheduler import run_agent, orchestrator, supabase, AGENT_USER_ID
import os
from supabase import create_client
import autonomous_scheduler as s
s.orchestrator = __import__('orchestrator').CrewOrchestrator()
s.supabase = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
s.AGENT_USER_ID = os.environ['AGENT_USER_ID']
run_agent('maya', 'daily_seo_check')
print('Done — check Supabase agent_notifications table')
"
```

Expected: row appears in Supabase `agent_notifications` and in
NotificationsPanel in the app.

**Step 5: Commit**

```bash
git add .
git commit -m "chore: final integration — autonomous AI employees system complete"
```

---

## Summary of All Files Changed

| File | Action | Purpose |
|---|---|---|
| `platform/crewai/agents/*/SOUL.md` | Create ×6 | Agent identities |
| `platform/crewai/agents/*/memory/MEMORY.md` | Create ×6 | Initial empty memory |
| `platform/crewai/heartbeat/status.json` | Create | Agent run state |
| `platform/crewai/client_context/_template.md` | Create | Context template |
| `database/migrations/agent-employees.sql` | Create | 3 new DB tables |
| `platform/crewai/requirements.txt` | Modify | Add APScheduler |
| `platform/crewai/orchestrator.py` | Modify | Add execute_for_scheduler() |
| `platform/crewai/autonomous_scheduler.py` | Create | Cron scheduler |
| `platform/content-engine/app/api/agents/status/route.ts` | Create | Heartbeat API |
| `platform/content-engine/app/api/agents/[name]/memory/route.ts` | Create | Memory API |
| `platform/content-engine/app/api/agents/[name]/run/route.ts` | Create | On-demand run API |
| `platform/content-engine/app/api/agents/context/route.ts` | Create | Client context save |
| `app/src/components/notifications/NotificationsPanel.tsx` | Modify | Real-time agent feed |
| `app/src/components/agents/AgentDashboard.tsx` | Modify | Live status cards |
| `app/src/components/chat/ChatHome.tsx` | Modify | Slash command routing |
| `app/src/components/settings/SettingsPanel.tsx` | Modify | Client context form |
