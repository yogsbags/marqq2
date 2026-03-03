"""
Torqq AI Budget Optimization Crew
Multi-agent system for performance analysis, budget allocation, ROI forecasting, and recommendations
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory

class BudgetOptimizationCrew:
    """
    Budget Optimization Crew

    Orchestrates 4 specialized agents for marketing budget optimization:
    1. Performance Analysis → Analyze channel ROI, CAC, conversion rates
    2. Budget Allocation → Recommend optimal spend distribution
    3. ROI Forecasting → Predict outcomes for budget scenarios
    4. Recommendations → Generate actionable implementation plans
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.3, max_tokens=4000)

        self.agents_config = self._load_yaml_config("config/agents/budget.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/budget.yaml")
        self.agents = self._create_agents()

    def _load_yaml_config(self, file_path: str) -> Dict[str, Any]:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(base_dir, file_path)
        with open(full_path, 'r') as f:
            return yaml.safe_load(f)

    def _create_agents(self) -> Dict[str, Agent]:
        agents = {}

        for agent_name in ["performance_analyzer", "budget_allocator", "roi_predictor", "recommendation_agent"]:
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
        timeframe: str = "last_30_days",
        channels: Optional[List[str]] = None,
        current_budget: Optional[Dict] = None,
        business_goals: Optional[Dict] = None,
        **kwargs
    ) -> Dict[str, Any]:
        if channels is None:
            channels = ["google_ads", "facebook_ads", "linkedin_ads", "seo", "email"]

        if current_budget is None:
            current_budget = {}

        if business_goals is None:
            business_goals = {"target_roi": 3.0, "max_cac": 100}

        tasks = []

        performance_config = self.tasks_config["performance_analysis_task"]
        performance_task = Task(
            description=performance_config["description"].format(
                timeframe=timeframe,
                channels=", ".join(channels)
            ),
            expected_output=performance_config["expected_output"],
            agent=self.agents["performance_analyzer"]
        )
        tasks.append(performance_task)

        allocation_config = self.tasks_config["budget_allocation_task"]
        allocation_task = Task(
            description=allocation_config["description"].format(
                current_budget=current_budget,
                performance_data="Performance analysis"
            ),
            expected_output=allocation_config["expected_output"],
            agent=self.agents["budget_allocator"],
            context=[performance_task]
        )
        tasks.append(allocation_task)

        forecast_config = self.tasks_config["roi_forecasting_task"]
        forecast_task = Task(
            description=forecast_config["description"].format(
                proposed_budgets="Recommended allocations"
            ),
            expected_output=forecast_config["expected_output"],
            agent=self.agents["roi_predictor"],
            context=[allocation_task]
        )
        tasks.append(forecast_task)

        recommendation_config = self.tasks_config["recommendation_task"]
        recommendation_task = Task(
            description=recommendation_config["description"].format(
                analysis="Performance analysis",
                forecasts="ROI forecasts",
                business_goals=business_goals
            ),
            expected_output=recommendation_config["expected_output"],
            agent=self.agents["recommendation_agent"],
            context=[performance_task, allocation_task, forecast_task]
        )
        tasks.append(recommendation_task)

        crew = Crew(
            agents=list(self.agents.values()),
            tasks=tasks,
            process=Process.sequential,
            verbose=True,
            memory=resolve_crew_memory(),
            cache=True,
            max_rpm=20,
            planning=True,
            planning_llm=self.llm
        )

        result = crew.kickoff()

        return {
            "result": str(result),
            "tasks_completed": len(tasks),
            "agents_used": len(self.agents),
            "execution_mode": {
                "process": "sequential",
                "planning": True,
                "delegation_enabled": True
            }
        }

    def get_agent_info(self) -> List[Dict[str, Any]]:
        return [
            {"name": "Performance Analyzer", "role": self.agents_config["performance_analyzer"]["role"]},
            {"name": "Budget Allocator", "role": self.agents_config["budget_allocator"]["role"]},
            {"name": "ROI Predictor", "role": self.agents_config["roi_predictor"]["role"]},
            {"name": "Recommendation Agent", "role": self.agents_config["recommendation_agent"]["role"]}
        ]
