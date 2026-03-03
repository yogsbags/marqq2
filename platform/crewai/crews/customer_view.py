"""
Torqq AI Unified Customer View Crew
Multi-agent system for customer profile aggregation, journey mapping, prediction, and insights
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory

class CustomerViewCrew:
    """
    Unified Customer View Crew

    Orchestrates 4 specialized agents for 360-degree customer intelligence:
    1. Profile Aggregation → Unify data from CRM, email, social, support, product
    2. Journey Mapping → Map customer paths and touchpoints
    3. Prediction → Churn risk, upsell potential, lifetime value
    4. Insights Generation → Segmentation, patterns, recommendations
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.3, max_tokens=4000)

        self.agents_config = self._load_yaml_config("config/agents/customer.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/customer.yaml")
        self.agents = self._create_agents()

    def _load_yaml_config(self, file_path: str) -> Dict[str, Any]:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(base_dir, file_path)
        with open(full_path, 'r') as f:
            return yaml.safe_load(f)

    def _create_agents(self) -> Dict[str, Agent]:
        agents = {}

        for agent_name in ["profile_aggregator", "journey_mapper", "prediction_agent", "insights_generator"]:
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
        customer_ids: Optional[List[str]] = None,
        customer_segment: str = "all",
        **kwargs
    ) -> Dict[str, Any]:
        if customer_ids is None:
            customer_ids = []

        tasks = []

        aggregation_config = self.tasks_config["profile_aggregation_task"]
        aggregation_task = Task(
            description=aggregation_config["description"].format(customer_ids=customer_ids),
            expected_output=aggregation_config["expected_output"],
            agent=self.agents["profile_aggregator"]
        )
        tasks.append(aggregation_task)

        journey_config = self.tasks_config["journey_mapping_task"]
        journey_task = Task(
            description=journey_config["description"].format(customer_segment=customer_segment),
            expected_output=journey_config["expected_output"],
            agent=self.agents["journey_mapper"],
            context=[aggregation_task]
        )
        tasks.append(journey_task)

        prediction_config = self.tasks_config["prediction_task"]
        prediction_task = Task(
            description=prediction_config["description"].format(customer_profiles="Aggregated profiles"),
            expected_output=prediction_config["expected_output"],
            agent=self.agents["prediction_agent"],
            context=[aggregation_task]
        )
        tasks.append(prediction_task)

        insights_config = self.tasks_config["insights_generation_task"]
        insights_task = Task(
            description=insights_config["description"].format(unified_data="Unified customer data"),
            expected_output=insights_config["expected_output"],
            agent=self.agents["insights_generator"],
            context=[aggregation_task, journey_task, prediction_task]
        )
        tasks.append(insights_task)

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
            {"name": "Profile Aggregator", "role": self.agents_config["profile_aggregator"]["role"]},
            {"name": "Journey Mapper", "role": self.agents_config["journey_mapper"]["role"]},
            {"name": "Prediction Agent", "role": self.agents_config["prediction_agent"]["role"]},
            {"name": "Insights Generator", "role": self.agents_config["insights_generator"]["role"]}
        ]
