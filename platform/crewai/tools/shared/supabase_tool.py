"""
Supabase Database Tool for CrewAI
Manages competitor monitoring configurations and alerts in Supabase
"""

import os
import json
from typing import Any, Optional, Type, Dict
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from crewai.tools import BaseTool
from supabase import create_client, Client


class SupabaseInput(BaseModel):
    """Input schema for Supabase operations"""
    operation: str = Field(..., description="Operation type: create_monitoring_config, get_monitoring_configs, create_alert")
    data: Dict[str, Any] = Field(..., description="Data for the operation")


class SupabaseTool(BaseTool):
    """
    Supabase Database Tool

    Manages competitor monitoring configurations and alerts.
    Supports creating monitoring configs, retrieving user preferences,
    and storing competitor alerts.
    """

    name: str = "supabase_database"
    description: str = """
    Interact with Supabase database for competitor monitoring.
    Use this tool to:
    - Create monitoring configurations for competitors
    - Retrieve existing monitoring preferences
    - Store competitor alerts and notifications
    - Update monitoring settings

    Operations:
    - create_monitoring_config: Create new monitoring config
    - get_monitoring_configs: Get user's monitoring configs
    - create_alert: Create new competitor alert
    """
    args_schema: Type[BaseModel] = SupabaseInput

    supabase: Optional[Client] = None
    init_error: Optional[str] = None

    def __init__(self, **kwargs):
        """Initialize Supabase client"""
        super().__init__(**kwargs)

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

        if not supabase_url or not supabase_key:
            self.supabase = None
            self.init_error = "Supabase not configured (missing SUPABASE_URL and SUPABASE_*_KEY)"
            return

        try:
            self.supabase = create_client(supabase_url, supabase_key)
            self.init_error = None
        except Exception as e:
            self.supabase = None
            self.init_error = f"Supabase client init failed: {e}"

    def _run(self, operation: str, data: Dict[str, Any]) -> str:
        """
        Execute Supabase database operation

        Args:
            operation: Operation type
            data: Operation data

        Returns:
            Operation result as JSON string
        """
        try:
            if self.supabase is None:
                return json.dumps(
                    {
                        "success": False,
                        "error": self.init_error or "Supabase client not initialized",
                    }
                )

            if operation == "create_monitoring_config":
                return self._create_monitoring_config(data)
            elif operation == "get_monitoring_configs":
                return self._get_monitoring_configs(data)
            elif operation == "create_alert":
                return self._create_alert(data)
            else:
                return json.dumps({"error": f"Unknown operation: {operation}"})

        except Exception as e:
            return json.dumps({"error": str(e)})

    def _create_monitoring_config(self, data: Dict[str, Any]) -> str:
        """
        Create competitor monitoring configuration

        Args:
            data: Config data with user_id, competitor_name, alert_types, frequency

        Returns:
            Created config as JSON
        """
        try:
            if self.supabase is None:
                return json.dumps({"error": "Supabase client not initialized"})

            config_data = {
                "user_id": data.get("user_id"),
                "competitor_name": data.get("competitor_name"),
                "competitor_url": data.get("competitor_url"),
                "alert_types": data.get("alert_types", ["news", "funding", "product_launch"]),
                "alert_frequency": data.get("alert_frequency", "realtime"),
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            result = self.supabase.table("competitor_monitoring_config").insert(config_data).execute()

            return json.dumps({
                "success": True,
                "config": result.data[0] if result.data else None,
                "message": f"Monitoring activated for {data.get('competitor_name')}"
            }, indent=2)

        except Exception as e:
            return json.dumps({"error": f"Failed to create monitoring config: {str(e)}"})

    def _get_monitoring_configs(self, data: Dict[str, Any]) -> str:
        """
        Get user's monitoring configurations

        Args:
            data: Query data with user_id

        Returns:
            List of configs as JSON
        """
        try:
            if self.supabase is None:
                return json.dumps({"error": "Supabase client not initialized"})

            user_id = data.get("user_id")
            if not user_id:
                return json.dumps({"error": "user_id is required"})

            result = self.supabase.table("competitor_monitoring_config") \
                .select("*") \
                .eq("user_id", user_id) \
                .eq("is_active", True) \
                .execute()

            return json.dumps({
                "success": True,
                "configs": result.data,
                "count": len(result.data)
            }, indent=2)

        except Exception as e:
            return json.dumps({"error": f"Failed to get monitoring configs: {str(e)}"})

    def _create_alert(self, data: Dict[str, Any]) -> str:
        """
        Create competitor alert

        Args:
            data: Alert data with user_id, competitor_name, alert_type, title, description, source_url

        Returns:
            Created alert as JSON
        """
        try:
            if self.supabase is None:
                return json.dumps({"error": "Supabase client not initialized"})

            alert_data = {
                "user_id": data.get("user_id"),
                "competitor_name": data.get("competitor_name"),
                "alert_type": data.get("alert_type", "news"),
                "title": data.get("title"),
                "description": data.get("description"),
                "source_url": data.get("source_url"),
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            result = self.supabase.table("competitor_alerts").insert(alert_data).execute()

            return json.dumps({
                "success": True,
                "alert": result.data[0] if result.data else None,
                "message": "Alert created successfully"
            }, indent=2)

        except Exception as e:
            return json.dumps({"error": f"Failed to create alert: {str(e)}"})

    async def _arun(self, operation: str, data: Dict[str, Any]) -> str:
        """Async version of _run (not implemented, falls back to sync)"""
        return self._run(operation, data)
