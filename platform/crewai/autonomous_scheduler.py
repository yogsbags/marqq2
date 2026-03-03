"""
Autonomous AI Digital Employees — Scheduler
============================================
Runs 6 marketing agents on cron schedules (IST timezone).
Writes results to Supabase agent_notifications table.
Updates heartbeat/status.json after each run.

Usage:
    python autonomous_scheduler.py

Environment variables required:
    GROQ_API_KEY          - for LLM calls inside CrewAI
    SUPABASE_URL          - your Supabase project URL
    SUPABASE_SERVICE_KEY  - service role key (bypasses RLS)
    AGENT_WORKSPACE_ID    - Workspace UUID this scheduler instance runs for.
                            Used as the Composio entityId (scopes connected accounts)
                            and to filter agent_notifications in the UI.
                            Find in Supabase Dashboard → Table Editor → workspaces.
                            One scheduler process per workspace / tenant deployment.
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
DEPLOYMENT_QUEUE_FILE = BASE_DIR / "deployments" / "queue.json"
STALE_DEPLOYMENT_TIMEOUT_SECONDS = int(os.getenv("TORQQ_DEPLOYMENT_STALE_SECONDS", "1800"))

# ── Globals (initialised in main) ──────────────────────────────────────────────

orchestrator: CrewOrchestrator = None
supabase: Client = None
AGENT_WORKSPACE_ID: str | None = None

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


def load_client_context(workspace_id: str | None = None) -> str:
    """Load client business context for current user."""
    effective_workspace_id = workspace_id or AGENT_WORKSPACE_ID
    if not effective_workspace_id:
        return ""
    ctx_file = CLIENT_CONTEXT_DIR / f"{effective_workspace_id}.md"
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
    # Keep only last ~8000 chars (~30 days) to avoid token bloat
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


def load_deployment_queue() -> list[dict]:
    """Load queued GTM deployments created from the frontend."""
    if not DEPLOYMENT_QUEUE_FILE.exists():
        return []
    try:
        raw = json.loads(DEPLOYMENT_QUEUE_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except Exception:
        return []


def save_deployment_queue(entries: list[dict]) -> None:
    DEPLOYMENT_QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEPLOYMENT_QUEUE_FILE.write_text(json.dumps(entries, indent=2), encoding="utf-8")


def mark_stale_processing_deployments(queue: list[dict]) -> bool:
    now = datetime.now(timezone.utc)
    changed = False

    for entry in queue:
        if entry.get("status") != "processing":
            continue

        picked_at = entry.get("pickedAt")
        if not picked_at:
            continue

        try:
            picked_dt = datetime.fromisoformat(picked_at.replace("Z", "+00:00"))
        except ValueError:
            continue

        age_seconds = (now - picked_dt).total_seconds()
        if age_seconds < STALE_DEPLOYMENT_TIMEOUT_SECONDS:
            continue

        entry["status"] = "failed"
        entry["failedAt"] = now.isoformat()
        entry["error"] = f"Marked failed after exceeding stale timeout of {STALE_DEPLOYMENT_TIMEOUT_SECONDS} seconds."
        changed = True

    return changed


def pull_pending_deployments(agent_name: str) -> list[dict]:
    """Mark queued deployments for an agent as processing and return them."""
    queue = load_deployment_queue()
    if mark_stale_processing_deployments(queue):
        save_deployment_queue(queue)
    picked: list[dict] = []

    for entry in queue:
      if entry.get("agentName") == agent_name and entry.get("status") == "pending":
        entry["status"] = "processing"
        entry["pickedAt"] = datetime.now(timezone.utc).isoformat()
        picked.append(entry)

    if picked:
      save_deployment_queue(queue)

    return picked


def update_deployment_status(deployment_id: str, status: str, error: str | None = None) -> None:
    queue = load_deployment_queue()
    changed = False
    for entry in queue:
        if entry.get("id") != deployment_id:
            continue
        entry["status"] = status
        if status == "completed":
            entry["completedAt"] = datetime.now(timezone.utc).isoformat()
        elif status == "failed":
            entry["failedAt"] = datetime.now(timezone.utc).isoformat()
            if error:
                entry["error"] = error[:500]
        changed = True
        break

    if changed:
        save_deployment_queue(queue)


# ── Supabase helpers ───────────────────────────────────────────────────────────

def write_notification(agent_name: str, agent_role: str, task_type: str, result: dict, status: str, duration_ms: int, workspace_id: str | None = None) -> None:
    """Insert one row into agent_notifications."""
    effective_workspace_id = workspace_id or AGENT_WORKSPACE_ID
    if not supabase or not effective_workspace_id:
        logger.warning("Supabase not configured — skipping notification write")
        return

    try:
        supabase.table("agent_notifications").insert({
            "user_id": effective_workspace_id,
            "workspace_id": effective_workspace_id,
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
    "kiran": "Social Media Intelligence",
    "dev":   "Campaign Analyzer",
    "priya": "Competitor Watcher",
    "sam":   "Email Marketing Monitor",
}

AGENT_CREWS = {
    "maya":  "content",
    "riya":  "content",
    "arjun": "lead",
    "kiran": "content",   # social fits closest to content crew
    "dev":   "budget",
    "priya": "competitor",
    "sam":   "content",   # email fits closest to content crew
    "zara":  "company",   # orchestrator uses company crew for synthesis
}


def run_agent(agent_name: str, task_type: str) -> None:
    """
    Run one agent:
      1. Load SOUL.md + MEMORY.md + client context
      2. Execute via CrewAI orchestrator
      3. Write result to Supabase
      4. Update filesystem memory
      5. Update heartbeat
    """
    logger.info(f"▶ Running {agent_name} ({task_type})")
    start = datetime.now(timezone.utc)
    update_heartbeat(agent_name, "running")

    soul = load_soul(agent_name)
    memory = load_memory(agent_name)
    client_context = load_client_context()
    crew_module = AGENT_CREWS.get(agent_name, "company")
    role = AGENT_ROLES.get(agent_name, agent_name)
    queued_deployments = pull_pending_deployments(agent_name)

    try:
        for deployment in queued_deployments:
            deployment_workspace_id = deployment.get("workspaceId") or AGENT_WORKSPACE_ID
            deployment_client_context = load_client_context(deployment_workspace_id)
            deployment_request = "\n".join([
                f"Execute the approved GTM deployment for section: {deployment.get('sectionTitle', deployment.get('sectionId', 'Unknown section'))}",
                f"Summary: {deployment.get('summary', '')}",
                "Tasks:",
                *[f"- {bullet}" for bullet in deployment.get("bullets", [])],
            ]).strip()

            deployment_result = orchestrator.execute_for_scheduler(
                crew_module=crew_module,
                task_type=deployment_request,
                system_context=soul,
                prior_memory=memory,
                client_context=deployment_client_context,
            )
            deployment_duration = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
            write_notification(
                agent_name,
                role,
                f"scheduled_gtm_deployment:{deployment.get('sectionId', 'unknown')}",
                deployment_result,
                "success",
                deployment_duration,
                workspace_id=deployment_workspace_id,
            )
            update_memory(agent_name, deployment_result)
            update_deployment_status(deployment.get("id", ""), "completed")

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
        for deployment in queued_deployments:
            if deployment.get("status") == "processing":
                update_deployment_status(deployment.get("id", ""), "failed", error=error_str)
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

    # Kiran — Social Media Intelligence — daily 07:30 IST
    scheduler.add_job(
        lambda: run_agent("kiran", "daily_social_pulse"),
        CronTrigger(hour=7, minute=30, timezone="Asia/Kolkata"),
        id="kiran_daily", replace_existing=True
    )

    # Sam — Email Marketing Monitor — Tue/Thu 08:30 IST
    scheduler.add_job(
        lambda: run_agent("sam", "email_health_check"),
        CronTrigger(day_of_week="tue,thu", hour=8, minute=30, timezone="Asia/Kolkata"),
        id="sam_tuth", replace_existing=True
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
    required = ["GROQ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        raise EnvironmentError(f"Missing required env vars: {', '.join(missing)}")

    # Initialise globals
    orchestrator = CrewOrchestrator(groq_api_key=os.getenv("GROQ_API_KEY"))
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    AGENT_WORKSPACE_ID = os.getenv("AGENT_WORKSPACE_ID")

    # Build and start scheduler
    scheduler = build_scheduler()
    scheduler.start()

    logger.info("🤖 Autonomous AI employees online")
    logger.info("   Maya:  daily 06:00 IST")
    logger.info("   Arjun: daily 07:00 IST")
    logger.info("   Kiran: daily 07:30 IST")
    logger.info("   Priya: daily 08:00 IST")
    logger.info("   Riya:  Mon/Wed/Fri 08:00 IST")
    logger.info("   Sam:   Tue/Thu 08:30 IST")
    logger.info("   Dev:   Monday 09:00 IST")
    logger.info("   Zara:  daily 09:15 IST (synthesis)")
    logger.info("Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        logger.info("Scheduler stopped.")
