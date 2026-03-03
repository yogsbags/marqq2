"""
Torqq AI Performance Scorecard Crew
Multi-agent system for metrics collection, anomaly detection, dashboard building, and alerting
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory

class PerformanceScorecardCrew:
    """
    Performance Scorecard Crew

    Orchestrates 4 specialized agents for real-time performance monitoring:
    1. Metrics Collection → Gather data from all marketing platforms
    2. Anomaly Detection → Identify spikes, drops, and unusual patterns
    3. Dashboard Building → Create customizable performance dashboards
    4. Alert Generation → Generate alerts for critical events and thresholds
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.2, max_tokens=4000)

        self.agents_config = self._load_yaml_config("config/agents/scorecard.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/scorecard.yaml")
        self.agents = self._create_agents()

    def _load_yaml_config(self, file_path: str) -> Dict[str, Any]:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(base_dir, file_path)
        with open(full_path, 'r') as f:
            return yaml.safe_load(f)

    def _create_agents(self) -> Dict[str, Agent]:
        agents = {}

        for agent_name in ["metrics_collector", "anomaly_detector", "dashboard_builder", "alert_generator"]:
            config = self.agents_config[agent_name]
            agents[agent_name] = Agent(
                role=config["role"],
                goal=config["goal"],
                backstory=config["backstory"],
                tools=[],
                llm=self.llm,
                verbose=config.get("verbose", True),
                allow_delegation=config.get("allow_delegation", False),
                max_iter=config.get("max_iter", 12),
                memory=resolve_agent_memory(config),
                cache=config.get("cache", True),
                max_rpm=config.get("max_rpm", 20),
                max_execution_time=config.get("max_execution_time", 240)
            )

        return agents

    def execute_workflow(
        self,
        user_request: str,
        platforms: Optional[List[str]] = None,
        metrics: Optional[List[str]] = None,
        timeframe: str = "last_7_days",
        sensitivity: str = "medium",
        kpis: Optional[List[str]] = None,
        alert_thresholds: Optional[Dict] = None,
        **kwargs
    ) -> Dict[str, Any]:
        if platforms is None:
            platforms = ["google_ads", "facebook_ads", "google_analytics", "crm"]

        if metrics is None:
            metrics = ["impressions", "clicks", "conversions", "cost", "roas"]

        if kpis is None:
            kpis = ["cac", "roas", "conversion_rate", "traffic"]

        if alert_thresholds is None:
            alert_thresholds = {"cost_spike": 1.5, "conversion_drop": 0.7}

        tasks = []

        collection_config = self.tasks_config["metrics_collection_task"]
        collection_task = Task(
            description=collection_config["description"].format(
                platforms=", ".join(platforms),
                metrics=", ".join(metrics),
                timeframe=timeframe
            ),
            expected_output=collection_config["expected_output"],
            agent=self.agents["metrics_collector"]
        )
        tasks.append(collection_task)

        anomaly_config = self.tasks_config["anomaly_detection_task"]
        anomaly_task = Task(
            description=anomaly_config["description"].format(
                metrics_data="Collected metrics",
                sensitivity=sensitivity
            ),
            expected_output=anomaly_config["expected_output"],
            agent=self.agents["anomaly_detector"],
            context=[collection_task]
        )
        tasks.append(anomaly_task)

        dashboard_config = self.tasks_config["dashboard_building_task"]
        dashboard_task = Task(
            description=dashboard_config["description"].format(
                metrics=", ".join(metrics),
                kpis=", ".join(kpis),
                viz_preferences="charts and trend lines"
            ),
            expected_output=dashboard_config["expected_output"],
            agent=self.agents["dashboard_builder"],
            context=[collection_task]
        )
        tasks.append(dashboard_task)

        alert_config = self.tasks_config["alert_generation_task"]
        alert_task = Task(
            description=alert_config["description"].format(
                anomalies="Detected anomalies",
                alert_thresholds=alert_thresholds
            ),
            expected_output=alert_config["expected_output"],
            agent=self.agents["alert_generator"],
            context=[anomaly_task]
        )
        tasks.append(alert_task)

        crew = Crew(
            agents=list(self.agents.values()),
            tasks=tasks,
            process=Process.sequential,
            verbose=True,
            memory=resolve_crew_memory(),
            cache=True,
            max_rpm=20,
            planning=False
        )

        result = crew.kickoff()

        return {
            "result": str(result),
            "tasks_completed": len(tasks),
            "agents_used": len(self.agents)
        }

    def get_agent_info(self) -> List[Dict[str, Any]]:
        return [
            {"name": "Metrics Collector", "role": self.agents_config["metrics_collector"]["role"]},
            {"name": "Anomaly Detector", "role": self.agents_config["anomaly_detector"]["role"]},
            {"name": "Dashboard Builder", "role": self.agents_config["dashboard_builder"]["role"]},
            {"name": "Alert Generator", "role": self.agents_config["alert_generator"]["role"]}
        ]
