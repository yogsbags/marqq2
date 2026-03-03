"""
Torqq AI Lead Intelligence Crew
Multi-agent system for lead scoring, enrichment, ICP matching, and segmentation
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from tools.shared.groq_web_search import GroqWebSearchTool
from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory


class LeadIntelligenceCrew:
    """
    Lead Intelligence Crew

    Orchestrates 4 specialized agents for complete lead workflow:
    1. Lead Scoring → Score based on ICP and conversion probability
    2. Data Enrichment → Enrich with firmographic/technographic data
    3. ICP Matching → Precision matching against ideal profile
    4. Segmentation → Group leads for targeted outreach
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        """
        Initialize the lead intelligence crew

        Args:
            groq_api_key: Groq API key (defaults to GROQ_API_KEY env var)
        """
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.3, max_tokens=4000)

        self.web_search_tool = GroqWebSearchTool()

        self.agents_config = self._load_yaml_config("config/agents/lead.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/lead.yaml")

        self.agents = self._create_agents()

    def _load_yaml_config(self, file_path: str) -> Dict[str, Any]:
        """Load YAML configuration file"""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(base_dir, file_path)
        with open(full_path, 'r') as f:
            return yaml.safe_load(f)

    def _create_agents(self) -> Dict[str, Agent]:
        """Create agents from YAML configuration"""
        agents = {}

        scorer_config = self.agents_config["lead_scorer"]
        agents["lead_scorer"] = Agent(
            role=scorer_config["role"],
            goal=scorer_config["goal"],
            backstory=scorer_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=scorer_config.get("verbose", True),
            allow_delegation=scorer_config.get("allow_delegation", False),
            max_iter=scorer_config.get("max_iter", 12),
            memory=resolve_agent_memory(scorer_config),
            cache=scorer_config.get("cache", True),
            max_rpm=scorer_config.get("max_rpm", 25),
            max_execution_time=scorer_config.get("max_execution_time", 240)
        )

        enrichment_config = self.agents_config["enrichment_agent"]
        agents["enrichment_agent"] = Agent(
            role=enrichment_config["role"],
            goal=enrichment_config["goal"],
            backstory=enrichment_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=enrichment_config.get("verbose", True),
            allow_delegation=enrichment_config.get("allow_delegation", False),
            max_iter=enrichment_config.get("max_iter", 15),
            memory=resolve_agent_memory(enrichment_config),
            cache=enrichment_config.get("cache", True),
            max_rpm=enrichment_config.get("max_rpm", 20),
            max_execution_time=enrichment_config.get("max_execution_time", 300)
        )

        icp_config = self.agents_config["icp_matcher"]
        agents["icp_matcher"] = Agent(
            role=icp_config["role"],
            goal=icp_config["goal"],
            backstory=icp_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=icp_config.get("verbose", True),
            allow_delegation=icp_config.get("allow_delegation", False),
            max_iter=icp_config.get("max_iter", 10),
            memory=resolve_agent_memory(icp_config),
            cache=icp_config.get("cache", True),
            max_rpm=icp_config.get("max_rpm", 25),
            max_execution_time=icp_config.get("max_execution_time", 180)
        )

        segmentation_config = self.agents_config["segmentation_agent"]
        agents["segmentation_agent"] = Agent(
            role=segmentation_config["role"],
            goal=segmentation_config["goal"],
            backstory=segmentation_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=segmentation_config.get("verbose", True),
            allow_delegation=segmentation_config.get("allow_delegation", False),
            max_iter=segmentation_config.get("max_iter", 10),
            memory=resolve_agent_memory(segmentation_config),
            cache=segmentation_config.get("cache", True),
            max_rpm=segmentation_config.get("max_rpm", 20),
            max_execution_time=segmentation_config.get("max_execution_time", 240)
        )

        return agents

    def execute_workflow(
        self,
        user_request: str,
        lead_data: Optional[List[Dict]] = None,
        icp_criteria: Optional[Dict] = None,
        enrichment_sources: Optional[List[str]] = None,
        segmentation_strategy: str = "engagement_readiness",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute lead intelligence workflow

        Args:
            user_request: Natural language request
            lead_data: List of lead records to process
            icp_criteria: Ideal Customer Profile definition
            enrichment_sources: Data sources for enrichment
            segmentation_strategy: Strategy for grouping leads

        Returns:
            Workflow results
        """
        if enrichment_sources is None:
            enrichment_sources = ["apollo", "clearbit", "linkedin"]

        if lead_data is None:
            lead_data = []

        if icp_criteria is None:
            icp_criteria = {
                "company_size": {"min": 100, "max": 10000},
                "industries": ["technology", "finance", "healthcare"],
                "regions": ["north_america", "europe"],
                "tech_stack": ["salesforce", "hubspot", "marketo"]
            }

        tasks = []

        scoring_config = self.tasks_config["lead_scoring_task"]
        scoring_task = Task(
            description=scoring_config["description"].format(
                lead_data=lead_data,
                icp_criteria=icp_criteria
            ),
            expected_output=scoring_config["expected_output"],
            agent=self.agents["lead_scorer"]
        )
        tasks.append(scoring_task)

        enrichment_config = self.tasks_config["enrichment_task"]
        enrichment_task = Task(
            description=enrichment_config["description"].format(
                lead_data=lead_data,
                enrichment_sources=enrichment_sources
            ),
            expected_output=enrichment_config["expected_output"],
            agent=self.agents["enrichment_agent"],
            context=[scoring_task]
        )
        tasks.append(enrichment_task)

        icp_config = self.tasks_config["icp_matching_task"]
        icp_task = Task(
            description=icp_config["description"].format(
                enriched_lead_data="Enriched leads from previous step",
                icp_definition=icp_criteria
            ),
            expected_output=icp_config["expected_output"],
            agent=self.agents["icp_matcher"],
            context=[enrichment_task]
        )
        tasks.append(icp_task)

        segmentation_config = self.tasks_config["segmentation_task"]
        segmentation_task = Task(
            description=segmentation_config["description"].format(
                scored_leads="Scored leads",
                icp_matched_leads="ICP matched leads",
                segmentation_strategy=segmentation_strategy
            ),
            expected_output=segmentation_config["expected_output"],
            agent=self.agents["segmentation_agent"],
            context=[scoring_task, icp_task]
        )
        tasks.append(segmentation_task)

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
        """Get information about all agents"""
        return [
            {
                "name": "Lead Scorer",
                "role": self.agents_config["lead_scorer"]["role"],
                "capabilities": [
                    "ICP criteria matching",
                    "Conversion probability prediction",
                    "Tier classification (Hot/Warm/Cold)",
                    "Score breakdown analysis"
                ],
                "tools": ["Groq LLM"]
            },
            {
                "name": "Enrichment Agent",
                "role": self.agents_config["enrichment_agent"]["role"],
                "capabilities": [
                    "Firmographic data gathering",
                    "Tech stack detection",
                    "Decision maker identification",
                    "Business intelligence research"
                ],
                "tools": ["Groq Compound Web Search", "Apollo", "Clearbit"]
            },
            {
                "name": "ICP Matcher",
                "role": self.agents_config["icp_matcher"]["role"],
                "capabilities": [
                    "Precision ICP matching",
                    "Company characteristic evaluation",
                    "Technical fit assessment",
                    "Budget indicator analysis"
                ],
                "tools": ["Groq LLM"]
            },
            {
                "name": "Segmentation Agent",
                "role": self.agents_config["segmentation_agent"]["role"],
                "capabilities": [
                    "Engagement readiness segmentation",
                    "Industry vertical grouping",
                    "Buying stage classification",
                    "Nurture sequence recommendations"
                ],
                "tools": ["Groq LLM"]
            }
        ]
