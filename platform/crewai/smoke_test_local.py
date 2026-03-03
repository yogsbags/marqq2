#!/usr/bin/env python3
"""
Local smoke tests for CrewAI backend (in-process).

This intentionally does NOT start the FastAPI server (some environments/sandboxes
disallow opening listening ports).
"""

import argparse
import asyncio
from dotenv import load_dotenv


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CrewAI backend local smoke tests")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Do not call external LLM APIs; stub responses where possible",
    )
    parser.add_argument(
        "--orchestrator",
        action="store_true",
        help="Also attempt to load CrewAI orchestrator/crews (requires full deps)",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    load_dotenv()

    print("== Smoke: company-intel direct generator ==")
    import main as api

    if args.offline:
        async def fake_call_groq(*_args, **_kwargs) -> str:
            return '{"status":"ok","note":"offline stub"}'

        api._call_groq = fake_call_groq  # type: ignore[attr-defined]

    try:
        result = asyncio.run(
            api._generate_artifact_direct(
                artifact_type="marketing_strategy",
                company_name="Acme Corp",
                company_url="https://example.com",
                profile={},
                inputs={"geo": "India"},
            )
        )
        print("marketing_strategy:", "ok" if isinstance(result, dict) else "unexpected")
    except Exception as e:
        print("marketing_strategy:", "failed:", str(e))

    if args.orchestrator:
        print("\n== Smoke: orchestrator module registry ==")
        try:
            from orchestrator import CrewOrchestrator

            orch = CrewOrchestrator()
            modules = orch.get_available_modules()
            print("modules:", sorted(list(modules.keys())))
        except Exception as e:
            print("orchestrator:", "failed:", str(e))
            print("hint: ensure `litellm` is installed for CrewAI Groq models (see requirements.txt)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
