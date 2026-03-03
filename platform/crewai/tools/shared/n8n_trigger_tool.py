"""
n8n Workflow Trigger Tool for CrewAI
Triggers n8n workflows for automated competitor monitoring
"""

import os
import json
import httpx
from typing import Any, Optional, Type, Dict
from pydantic import BaseModel, Field
from crewai.tools import BaseTool


class N8NTriggerInput(BaseModel):
    """Input schema for n8n workflow trigger"""
    competitor_name: str = Field(..., description="Name of competitor to monitor")
    user_id: str = Field(..., description="User ID requesting monitoring")
    action: str = Field("activate_monitoring", description="Action type")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class N8NTriggerTool(BaseTool):
    """
    n8n Workflow Trigger Tool

    Triggers n8n workflows for automated competitor monitoring.
    Sends webhook requests to activate monitoring workflows that run
    on scheduled intervals (daily/weekly).
    """

    name: str = "n8n_workflow_trigger"
    description: str = """
    Trigger n8n workflows for competitor monitoring.
    Use this tool to:
    - Activate automated monitoring for a competitor
    - Trigger immediate competitor check
    - Schedule recurring monitoring tasks

    The tool sends webhook POST requests to n8n workflow endpoints
    configured in N8N_WEBHOOK_URL environment variable.
    """
    args_schema: Type[BaseModel] = N8NTriggerInput

    webhook_url: Optional[str] = None

    def __init__(self, **kwargs):
        """Initialize n8n webhook URL"""
        super().__init__(**kwargs)

        self.webhook_url = os.getenv("N8N_WEBHOOK_URL")
        if not self.webhook_url:
            print("Warning: N8N_WEBHOOK_URL not set - n8n triggers will be simulated")

    def _run(
        self,
        competitor_name: str,
        user_id: str,
        action: str = "activate_monitoring",
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Trigger n8n workflow

        Args:
            competitor_name: Competitor to monitor
            user_id: User requesting monitoring
            action: Action type (activate_monitoring, immediate_check)
            metadata: Additional data

        Returns:
            Trigger result as JSON string
        """
        try:
            if not self.webhook_url:
                # Simulate trigger if webhook URL not configured
                return json.dumps({
                    "success": True,
                    "simulated": True,
                    "message": f"n8n workflow trigger simulated for {competitor_name}",
                    "note": "Set N8N_WEBHOOK_URL environment variable for actual triggers"
                }, indent=2)

            # Prepare webhook payload
            payload = {
                "competitorName": competitor_name,
                "userId": user_id,
                "action": action,
                "metadata": metadata or {},
                "timestamp": self._get_timestamp()
            }

            # Send webhook POST request
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    self.webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )

                if response.status_code == 200:
                    return json.dumps({
                        "success": True,
                        "message": f"n8n workflow triggered successfully for {competitor_name}",
                        "response": response.json() if response.text else None
                    }, indent=2)
                else:
                    return json.dumps({
                        "success": False,
                        "error": f"n8n webhook returned status {response.status_code}",
                        "details": response.text
                    }, indent=2)

        except httpx.TimeoutException:
            return json.dumps({
                "success": False,
                "error": "n8n webhook request timed out (30s)",
                "note": "Workflow may still execute in background"
            }, indent=2)

        except Exception as e:
            return json.dumps({
                "success": False,
                "error": f"Failed to trigger n8n workflow: {str(e)}"
            }, indent=2)

    def _get_timestamp(self) -> str:
        """Get current ISO timestamp"""
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    async def _arun(
        self,
        competitor_name: str,
        user_id: str,
        action: str = "activate_monitoring",
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Async version of _run (not implemented, falls back to sync)"""
        return self._run(competitor_name, user_id, action, metadata)
