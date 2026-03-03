"""
Torqq AI Social Media Campaign Crew
Multi-agent system for campaign planning, script writing, video production, and multi-platform publishing
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from tools.shared.groq_web_search import GroqWebSearchTool
from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory


class SocialCampaignCrew:
    """
    Social Media Campaign Crew

    Orchestrates 4 specialized agents for complete campaign workflow:
    1. Campaign Planning → Design strategy, audience, content calendar
    2. Script Writing → Create platform-optimized scripts and captions
    3. Video Production → Generate videos using Veo 3.1, HeyGen, Shotstack
    4. Multi-Platform Publishing → Publish to LinkedIn, Instagram, YouTube, etc.
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        """
        Initialize the social campaign crew

        Args:
            groq_api_key: Groq API key (defaults to GROQ_API_KEY env var)
        """
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.7, max_tokens=6000)

        self.web_search_tool = GroqWebSearchTool()

        self.agents_config = self._load_yaml_config("config/agents/social.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/social.yaml")

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

        planner_config = self.agents_config["campaign_planner"]
        agents["campaign_planner"] = Agent(
            role=planner_config["role"],
            goal=planner_config["goal"],
            backstory=planner_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=planner_config.get("verbose", True),
            allow_delegation=planner_config.get("allow_delegation", False),
            max_iter=planner_config.get("max_iter", 12),
            memory=resolve_agent_memory(planner_config),
            cache=planner_config.get("cache", True),
            max_rpm=planner_config.get("max_rpm", 20),
            max_execution_time=planner_config.get("max_execution_time", 240)
        )

        writer_config = self.agents_config["script_writer"]
        agents["script_writer"] = Agent(
            role=writer_config["role"],
            goal=writer_config["goal"],
            backstory=writer_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=writer_config.get("verbose", True),
            allow_delegation=writer_config.get("allow_delegation", False),
            max_iter=writer_config.get("max_iter", 15),
            memory=resolve_agent_memory(writer_config),
            cache=writer_config.get("cache", True),
            max_rpm=writer_config.get("max_rpm", 20),
            max_execution_time=writer_config.get("max_execution_time", 300)
        )

        producer_config = self.agents_config["video_producer"]
        agents["video_producer"] = Agent(
            role=producer_config["role"],
            goal=producer_config["goal"],
            backstory=producer_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=producer_config.get("verbose", True),
            allow_delegation=producer_config.get("allow_delegation", False),
            max_iter=producer_config.get("max_iter", 20),
            memory=resolve_agent_memory(producer_config),
            cache=producer_config.get("cache", True),
            max_rpm=producer_config.get("max_rpm", 15),
            max_execution_time=producer_config.get("max_execution_time", 600)
        )

        publisher_config = self.agents_config["publisher"]
        agents["publisher"] = Agent(
            role=publisher_config["role"],
            goal=publisher_config["goal"],
            backstory=publisher_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=publisher_config.get("verbose", True),
            allow_delegation=publisher_config.get("allow_delegation", False),
            max_iter=publisher_config.get("max_iter", 12),
            memory=resolve_agent_memory(publisher_config),
            cache=publisher_config.get("cache", True),
            max_rpm=publisher_config.get("max_rpm", 20),
            max_execution_time=publisher_config.get("max_execution_time", 300)
        )

        return agents

    def execute_workflow(
        self,
        user_request: str,
        campaign_brief: Optional[str] = None,
        platforms: Optional[List[str]] = None,
        duration_days: int = 30,
        budget: str = "unspecified",
        content_type: str = "video",
        video_duration: int = 60,
        video_style: str = "professional",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute social campaign workflow

        Args:
            user_request: Natural language request
            campaign_brief: Campaign description and objectives
            platforms: Target platforms (linkedin, instagram, youtube, facebook, twitter)
            duration_days: Campaign duration in days
            budget: Campaign budget
            content_type: Type of content (video, carousel, post)
            video_duration: Video length in seconds
            video_style: Video production style

        Returns:
            Workflow results
        """
        if platforms is None:
            platforms = ["linkedin", "instagram", "youtube"]

        if campaign_brief is None:
            campaign_brief = user_request

        tasks = []

        planning_config = self.tasks_config["campaign_planning_task"]
        planning_task = Task(
            description=planning_config["description"].format(
                campaign_brief=campaign_brief,
                platforms=", ".join(platforms),
                duration_days=duration_days,
                budget=budget
            ),
            expected_output=planning_config["expected_output"],
            agent=self.agents["campaign_planner"]
        )
        tasks.append(planning_task)

        script_config = self.tasks_config["script_writing_task"]
        script_task = Task(
            description=script_config["description"].format(
                campaign_plan="Campaign plan from previous step",
                content_type=content_type,
                platform=platforms[0] if platforms else "linkedin",
                video_duration=video_duration
            ),
            expected_output=script_config["expected_output"],
            agent=self.agents["script_writer"],
            context=[planning_task]
        )
        tasks.append(script_task)

        production_config = self.tasks_config["video_production_task"]
        production_task = Task(
            description=production_config["description"].format(
                script="Script from previous step",
                platform=platforms[0] if platforms else "linkedin",
                video_style=video_style,
                video_duration=video_duration
            ),
            expected_output=production_config["expected_output"],
            agent=self.agents["video_producer"],
            context=[script_task]
        )
        tasks.append(production_task)

        publishing_config = self.tasks_config["publishing_task"]
        publishing_task = Task(
            description=publishing_config["description"].format(
                campaign_content="Content from previous steps",
                platforms=", ".join(platforms),
                schedule="Optimal timing per platform"
            ),
            expected_output=publishing_config["expected_output"],
            agent=self.agents["publisher"],
            context=[planning_task, production_task]
        )
        tasks.append(publishing_task)

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
                "name": "Campaign Planner",
                "role": self.agents_config["campaign_planner"]["role"],
                "capabilities": [
                    "Multi-platform campaign strategy",
                    "Audience targeting and personas",
                    "Content calendar planning",
                    "Budget allocation and KPI framework"
                ],
                "tools": ["Groq Compound Web Search"]
            },
            {
                "name": "Script Writer",
                "role": self.agents_config["script_writer"]["role"],
                "capabilities": [
                    "Platform-optimized copywriting",
                    "Video script writing with hooks and CTAs",
                    "Caption and hashtag optimization",
                    "Story arc and engagement formulas"
                ],
                "tools": ["Groq LLM"]
            },
            {
                "name": "Video Producer",
                "role": self.agents_config["video_producer"]["role"],
                "capabilities": [
                    "Veo 3.1 scene extension (8s clips chained)",
                    "HeyGen avatar integration",
                    "Shotstack multi-track compositing",
                    "Platform-specific exports (16:9, 1:1, 9:16)"
                ],
                "tools": ["Veo 3.1", "HeyGen", "Shotstack", "Fal AI", "Replicate"]
            },
            {
                "name": "Publisher",
                "role": self.agents_config["publisher"]["role"],
                "capabilities": [
                    "Multi-platform publishing (LinkedIn, Instagram, YouTube, Facebook, Twitter)",
                    "Optimal timing and scheduling",
                    "Metadata and hashtag optimization",
                    "Engagement monitoring and response"
                ],
                "tools": ["Zapier MCP", "Platform APIs"]
            }
        ]
