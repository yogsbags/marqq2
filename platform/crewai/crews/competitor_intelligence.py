"""
Torqq AI Competitor Intelligence Crew
Multi-agent system for automated competitor analysis and monitoring
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from tools.shared.groq_web_search import GroqWebSearchTool
from tools.shared.supabase_tool import SupabaseTool
from tools.shared.n8n_trigger_tool import N8NTriggerTool
from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory


class CompetitorIntelligenceCrew:
    """
    Competitor Intelligence Crew

    Orchestrates multiple AI agents to:
    1. Discover competitors
    2. Analyze competitive landscape
    3. Activate automated monitoring
    4. Generate strategic insights
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        """
        Initialize the crew with agents and tasks

        Args:
            groq_api_key: Groq API key (defaults to GROQ_API_KEY env var)
        """
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.3, max_tokens=4000)

        # Initialize tools
        self.web_search_tool = GroqWebSearchTool()
        self.supabase_tool = SupabaseTool()
        self.n8n_tool = N8NTriggerTool()

        # Load configurations
        self.agents_config = self._load_yaml_config("config/agents/competitor.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/competitor.yaml")

        # Create agents
        self.agents = self._create_agents()

    def _load_yaml_config(self, file_path: str) -> Dict[str, Any]:
        """Load YAML configuration file"""
        # Get path relative to project root
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        full_path = os.path.join(base_dir, file_path)
        with open(full_path, 'r') as f:
            return yaml.safe_load(f)

    def _create_agents(self) -> Dict[str, Agent]:
        """Create agents from YAML configuration"""
        agents = {}

        # Research Agent (with web search)
        research_config = self.agents_config["research_agent"]
        agents["research"] = Agent(
            role=research_config["role"],
            goal=research_config["goal"],
            backstory=research_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=research_config.get("verbose", True),
            allow_delegation=research_config.get("allow_delegation", False),
            max_iter=research_config.get("max_iter", 15),
            memory=resolve_agent_memory(research_config),
            cache=research_config.get("cache", True),
            max_rpm=research_config.get("max_rpm", 20),
            max_execution_time=research_config.get("max_execution_time", 300)
        )

        # Competitor Analysis Agent (with web search)
        analysis_config = self.agents_config["competitor_analysis_agent"]
        agents["analysis"] = Agent(
            role=analysis_config["role"],
            goal=analysis_config["goal"],
            backstory=analysis_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=analysis_config.get("verbose", True),
            allow_delegation=analysis_config.get("allow_delegation", False),
            max_iter=analysis_config.get("max_iter", 15),
            memory=resolve_agent_memory(analysis_config),
            cache=analysis_config.get("cache", True),
            max_rpm=analysis_config.get("max_rpm", 20),
            max_execution_time=analysis_config.get("max_execution_time", 300)
        )

        # Monitoring Agent (with Supabase and n8n)
        monitoring_config = self.agents_config["monitoring_agent"]
        agents["monitoring"] = Agent(
            role=monitoring_config["role"],
            goal=monitoring_config["goal"],
            backstory=monitoring_config["backstory"],
            tools=[self.supabase_tool, self.n8n_tool],
            llm=self.llm,
            verbose=monitoring_config.get("verbose", True),
            allow_delegation=monitoring_config.get("allow_delegation", False),
            max_iter=monitoring_config.get("max_iter", 10),
            memory=resolve_agent_memory(monitoring_config),
            cache=monitoring_config.get("cache", True),
            max_rpm=monitoring_config.get("max_rpm", 20),
            max_execution_time=monitoring_config.get("max_execution_time", 300)
        )

        # Insights Agent (no tools, pure reasoning)
        insights_config = self.agents_config["insights_agent"]
        agents["insights"] = Agent(
            role=insights_config["role"],
            goal=insights_config["goal"],
            backstory=insights_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=insights_config.get("verbose", True),
            allow_delegation=insights_config.get("allow_delegation", False),
            max_iter=insights_config.get("max_iter", 10),
            memory=resolve_agent_memory(insights_config),
            cache=insights_config.get("cache", True),
            max_rpm=insights_config.get("max_rpm", 20),
            max_execution_time=insights_config.get("max_execution_time", 300)
        )

        return agents

    def _create_tasks(
        self,
        user_request: str,
        company_name: Optional[str] = None,
        region: str = "global",
        user_id: str = "default",
        enable_monitoring: bool = True
    ) -> List[Task]:
        """
        Create tasks from YAML configuration with dynamic inputs

        Args:
            user_request: Natural language request from user
            company_name: Company name (if known)
            region: Target region
            user_id: User ID for monitoring
            enable_monitoring: Whether to activate monitoring

        Returns:
            List of Task objects
        """
        tasks = []

        # Task 1: Discover company (if company name not provided)
        if not company_name:
            discover_config = self.tasks_config["discover_company_task"]
            tasks.append(Task(
                description=discover_config["description"].format(
                    user_request=user_request
                ),
                expected_output=discover_config["expected_output"],
                agent=self.agents["research"]
            ))

        # Task 2: Research competitors
        research_config = self.tasks_config["research_competitors_task"]
        research_task = Task(
            description=research_config["description"].format(
                company_name=company_name or "the company",
                region=region
            ),
            expected_output=research_config["expected_output"],
            agent=self.agents["research"]
        )
        tasks.append(research_task)

        # Task 3: Analyze competitors
        analysis_config = self.tasks_config["analyze_competitors_task"]
        analysis_task = Task(
            description=analysis_config["description"],
            expected_output=analysis_config["expected_output"],
            agent=self.agents["analysis"],
            context=[research_task]  # Depends on research task
        )
        tasks.append(analysis_task)

        # Task 4: Activate monitoring (if enabled)
        if enable_monitoring:
            monitoring_config = self.tasks_config["activate_monitoring_task"]
            monitoring_task = Task(
                description=monitoring_config["description"].format(
                    user_id=user_id
                ),
                expected_output=monitoring_config["expected_output"],
                agent=self.agents["monitoring"],
                context=[research_task, analysis_task]
            )
            tasks.append(monitoring_task)

        # Task 5: Generate insights
        insights_config = self.tasks_config["generate_insights_task"]
        insights_task = Task(
            description=insights_config["description"],
            expected_output=insights_config["expected_output"],
            agent=self.agents["insights"],
            context=[research_task, analysis_task],
        )
        tasks.append(insights_task)

        return tasks

    def execute_workflow(
        self,
        user_request: str,
        company_name: Optional[str] = None,
        company_url: Optional[str] = None,
        region: str = "global",
        user_id: str = "default",
        enable_monitoring: bool = True,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute the complete competitor intelligence workflow

        Args:
            user_request: Natural language request from user
            company_name: Company name (optional)
            company_url: Company website URL (optional, currently unused)
            region: Target region
            user_id: User ID for monitoring
            enable_monitoring: Whether to activate monitoring

        Returns:
            Workflow results
        """
        # Create tasks with dynamic inputs
        tasks = self._create_tasks(
            user_request=user_request,
            company_name=company_name,
            region=region,
            user_id=user_id,
            enable_monitoring=enable_monitoring
        )

        # Create crew
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

        # Execute workflow
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
        """Get information about all agents"""
        return [
            {
                "name": "Research Agent",
                "role": self.agents_config["research_agent"]["role"],
                "capabilities": [
                    "Web search for competitors",
                    "Market research",
                    "News monitoring",
                    "Company intelligence gathering"
                ],
                "tools": ["Groq Compound Web Search"]
            },
            {
                "name": "Competitor Analysis Agent",
                "role": self.agents_config["competitor_analysis_agent"]["role"],
                "capabilities": [
                    "Battlecard generation",
                    "Pricing analysis",
                    "Feature comparison",
                    "Market positioning assessment"
                ],
                "tools": ["Groq Compound Web Search"]
            },
            {
                "name": "Monitoring Agent",
                "role": self.agents_config["monitoring_agent"]["role"],
                "capabilities": [
                    "Supabase config management",
                    "n8n workflow activation",
                    "Alert configuration",
                    "Real-time monitoring setup"
                ],
                "tools": ["Supabase Tool", "n8n Trigger Tool"]
            },
            {
                "name": "Insights Agent",
                "role": self.agents_config["insights_agent"]["role"],
                "capabilities": [
                    "Strategic insights generation",
                    "Opportunity identification",
                    "Threat assessment",
                    "Recommendation prioritization"
                ],
                "tools": ["Groq LLM"]
            }
        ]
