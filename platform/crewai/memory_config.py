import os
from typing import Any


def crewai_memory_enabled() -> bool:
    raw = os.getenv("TORQQ_ENABLE_CREWAI_MEMORY", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def resolve_agent_memory(config: dict[str, Any]) -> bool:
    return crewai_memory_enabled() and bool(config.get("memory", True))


def resolve_crew_memory() -> bool:
    return crewai_memory_enabled()
