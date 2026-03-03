"""
Torqq AI Company Intelligence Crew
Multi-agent system for firmographic research, tech stack analysis, org mapping, and decision maker identification
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from tools.shared.groq_web_search import GroqWebSearchTool
from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory


class CompanyIntelligenceCrew:
    """
    Company Intelligence Crew

    Orchestrates 4 specialized agents for complete company profiling:
    1. Firmographic Analysis → Company size, industry, revenue, location
    2. Tech Stack Analysis → Technology infrastructure mapping
    3. Org Chart Mapping → Organizational structure and hierarchy
    4. Decision Maker Identification → Contact information for key stakeholders
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        """
        Initialize the company intelligence crew

        Args:
            groq_api_key: Groq API key (defaults to GROQ_API_KEY env var)
        """
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.3, max_tokens=4000)

        self.web_search_tool = GroqWebSearchTool()

        self.agents_config = self._load_yaml_config("config/agents/company.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/company.yaml")

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

        firmographic_config = self.agents_config["firmographic_analyst"]
        agents["firmographic_analyst"] = Agent(
            role=firmographic_config["role"],
            goal=firmographic_config["goal"],
            backstory=firmographic_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=firmographic_config.get("verbose", True),
            allow_delegation=firmographic_config.get("allow_delegation", False),
            max_iter=firmographic_config.get("max_iter", 15),
            memory=resolve_agent_memory(firmographic_config),
            cache=firmographic_config.get("cache", True),
            max_rpm=firmographic_config.get("max_rpm", 20),
            max_execution_time=firmographic_config.get("max_execution_time", 300)
        )

        tech_config = self.agents_config["tech_stack_analyst"]
        agents["tech_stack_analyst"] = Agent(
            role=tech_config["role"],
            goal=tech_config["goal"],
            backstory=tech_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=tech_config.get("verbose", True),
            allow_delegation=tech_config.get("allow_delegation", False),
            max_iter=tech_config.get("max_iter", 12),
            memory=resolve_agent_memory(tech_config),
            cache=tech_config.get("cache", True),
            max_rpm=tech_config.get("max_rpm", 20),
            max_execution_time=tech_config.get("max_execution_time", 240)
        )

        org_config = self.agents_config["org_chart_mapper"]
        agents["org_chart_mapper"] = Agent(
            role=org_config["role"],
            goal=org_config["goal"],
            backstory=org_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=org_config.get("verbose", True),
            allow_delegation=org_config.get("allow_delegation", False),
            max_iter=org_config.get("max_iter", 15),
            memory=resolve_agent_memory(org_config),
            cache=org_config.get("cache", True),
            max_rpm=org_config.get("max_rpm", 15),
            max_execution_time=org_config.get("max_execution_time", 300)
        )

        decision_config = self.agents_config["decision_maker_identifier"]
        agents["decision_maker_identifier"] = Agent(
            role=decision_config["role"],
            goal=decision_config["goal"],
            backstory=decision_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=decision_config.get("verbose", True),
            allow_delegation=decision_config.get("allow_delegation", False),
            max_iter=decision_config.get("max_iter", 15),
            memory=resolve_agent_memory(decision_config),
            cache=decision_config.get("cache", True),
            max_rpm=decision_config.get("max_rpm", 15),
            max_execution_time=decision_config.get("max_execution_time", 300)
        )

        return agents

    def execute_workflow(
        self,
        user_request: str,
        company_name: Optional[str] = None,
        target_departments: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute company intelligence workflow

        Args:
            user_request: Natural language request
            company_name: Target company name
            target_departments: Departments to focus on for contacts

        Returns:
            Workflow results
        """
        if company_name is None:
            company_name = user_request

        if target_departments is None:
            target_departments = ["Marketing", "Sales", "Engineering"]

        tasks = []

        firmographic_config = self.tasks_config["firmographic_research_task"]
        firmographic_task = Task(
            description=firmographic_config["description"].format(
                company_name=company_name
            ),
            expected_output=firmographic_config["expected_output"],
            agent=self.agents["firmographic_analyst"]
        )
        tasks.append(firmographic_task)

        tech_config = self.tasks_config["tech_stack_analysis_task"]
        tech_task = Task(
            description=tech_config["description"].format(
                company_name=company_name
            ),
            expected_output=tech_config["expected_output"],
            agent=self.agents["tech_stack_analyst"]
        )
        tasks.append(tech_task)

        org_config = self.tasks_config["org_chart_mapping_task"]
        org_task = Task(
            description=org_config["description"].format(
                company_name=company_name
            ),
            expected_output=org_config["expected_output"],
            agent=self.agents["org_chart_mapper"]
        )
        tasks.append(org_task)

        decision_config = self.tasks_config["decision_maker_identification_task"]
        decision_task = Task(
            description=decision_config["description"].format(
                company_name=company_name,
                target_departments=", ".join(target_departments)
            ),
            expected_output=decision_config["expected_output"],
            agent=self.agents["decision_maker_identifier"],
            context=[firmographic_task, org_task]
        )
        tasks.append(decision_task)

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
                "name": "Firmographic Analyst",
                "role": self.agents_config["firmographic_analyst"]["role"],
                "capabilities": [
                    "Company size and structure",
                    "Revenue and funding data",
                    "Industry classification",
                    "Corporate hierarchy"
                ],
                "tools": ["Groq Compound Web Search", "Clearbit", "LinkedIn"]
            },
            {
                "name": "Tech Stack Analyst",
                "role": self.agents_config["tech_stack_analyst"]["role"],
                "capabilities": [
                    "Technology infrastructure mapping",
                    "Tool identification and categorization",
                    "Integration analysis",
                    "Technology maturity assessment"
                ],
                "tools": ["BuiltWith", "Wappalyzer", "Job Postings"]
            },
            {
                "name": "Org Chart Mapper",
                "role": self.agents_config["org_chart_mapper"]["role"],
                "capabilities": [
                    "Organizational structure mapping",
                    "Reporting relationship identification",
                    "Team size and headcount analysis",
                    "Recent hiring trends"
                ],
                "tools": ["LinkedIn", "Company Websites"]
            },
            {
                "name": "Decision Maker Identifier",
                "role": self.agents_config["decision_maker_identifier"]["role"],
                "capabilities": [
                    "Key stakeholder identification",
                    "Contact verification (email, phone)",
                    "Budget authority assessment",
                    "Engagement signal analysis"
                ],
                "tools": ["Apollo", "LinkedIn Sales Navigator"]
            }
        ]
