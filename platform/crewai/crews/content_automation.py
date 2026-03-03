"""
Torqq AI Content Automation Crew
Multi-agent system for SEO research, content creation, and multi-platform publishing
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from tools.shared.groq_web_search import GroqWebSearchTool
from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory


class ContentAutomationCrew:
    """
    Content Automation Crew

    Orchestrates 5 specialized agents for complete content workflow:
    1. SEO Research → Discover opportunities
    2. Topic Generation → Create strategic topics
    3. Content Creation → Write E-E-A-T compliant articles
    4. SEO Optimization → Add meta tags and schema
    5. Publishing → Deploy to WordPress/Sanity/Next.js
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        """
        Initialize the content automation crew

        Args:
            groq_api_key: Groq API key (defaults to GROQ_API_KEY env var)
        """
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.5, max_tokens=8000)

        # Initialize tools
        self.web_search_tool = GroqWebSearchTool()

        # Load configurations
        self.agents_config = self._load_yaml_config("config/agents/content.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/content.yaml")

        # Create agents
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

        # SEO Researcher (with web search)
        seo_config = self.agents_config["seo_researcher"]
        agents["seo_researcher"] = Agent(
            role=seo_config["role"],
            goal=seo_config["goal"],
            backstory=seo_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=seo_config.get("verbose", True),
            allow_delegation=seo_config.get("allow_delegation", False),
            max_iter=seo_config.get("max_iter", 15),
            memory=resolve_agent_memory(seo_config),
            cache=seo_config.get("cache", True),
            max_rpm=seo_config.get("max_rpm", 20),
            max_execution_time=seo_config.get("max_execution_time", 300)
        )

        # Topic Generator (pure reasoning)
        topic_config = self.agents_config["topic_generator"]
        agents["topic_generator"] = Agent(
            role=topic_config["role"],
            goal=topic_config["goal"],
            backstory=topic_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=topic_config.get("verbose", True),
            allow_delegation=topic_config.get("allow_delegation", False),
            max_iter=topic_config.get("max_iter", 12),
            memory=resolve_agent_memory(topic_config),
            cache=topic_config.get("cache", True),
            max_rpm=topic_config.get("max_rpm", 20),
            max_execution_time=topic_config.get("max_execution_time", 240)
        )

        # Content Creator (with web search for research)
        creator_config = self.agents_config["content_creator"]
        agents["content_creator"] = Agent(
            role=creator_config["role"],
            goal=creator_config["goal"],
            backstory=creator_config["backstory"],
            tools=[self.web_search_tool],
            llm=self.llm,
            verbose=creator_config.get("verbose", True),
            allow_delegation=creator_config.get("allow_delegation", False),
            max_iter=creator_config.get("max_iter", 20),
            memory=resolve_agent_memory(creator_config),
            cache=creator_config.get("cache", True),
            max_rpm=creator_config.get("max_rpm", 15),
            max_execution_time=creator_config.get("max_execution_time", 600)
        )

        # SEO Optimizer (pure reasoning)
        seo_opt_config = self.agents_config["seo_optimizer"]
        agents["seo_optimizer"] = Agent(
            role=seo_opt_config["role"],
            goal=seo_opt_config["goal"],
            backstory=seo_opt_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=seo_opt_config.get("verbose", True),
            allow_delegation=seo_opt_config.get("allow_delegation", False),
            max_iter=seo_opt_config.get("max_iter", 10),
            memory=resolve_agent_memory(seo_opt_config),
            cache=seo_opt_config.get("cache", True),
            max_rpm=seo_opt_config.get("max_rpm", 25),
            max_execution_time=seo_opt_config.get("max_execution_time", 180)
        )

        # Publisher (will use specialized tools when implemented)
        publisher_config = self.agents_config["publisher"]
        agents["publisher"] = Agent(
            role=publisher_config["role"],
            goal=publisher_config["goal"],
            backstory=publisher_config["backstory"],
            tools=[],  # WordPress/Sanity tools will be added here
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
        topic: Optional[str] = None,
        num_topics: int = 5,
        region: str = "global",
        platforms: List[str] = None,
        publish_status: str = "draft",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute content automation workflow

        Args:
            user_request: Natural language request
            topic: Content topic area
            num_topics: Number of topics to generate
            region: Target region for SEO research
            platforms: Publishing platforms (wordpress, sanity)
            publish_status: Draft or publish

        Returns:
            Workflow results
        """
        if platforms is None:
            platforms = ["wordpress"]

        # Extract topic from user request if not provided
        if not topic:
            topic = user_request

        # Create tasks
        tasks = []

        # Task 1: SEO Research
        research_config = self.tasks_config["seo_research_task"]
        research_task = Task(
            description=research_config["description"].format(
                topic=topic,
                region=region
            ),
            expected_output=research_config["expected_output"],
            agent=self.agents["seo_researcher"]
        )
        tasks.append(research_task)

        # Task 2: Topic Generation
        topic_gen_config = self.tasks_config["topic_generation_task"]
        topic_gen_task = Task(
            description=topic_gen_config["description"].format(
                num_topics=num_topics,
                topic=topic
            ),
            expected_output=topic_gen_config["expected_output"],
            agent=self.agents["topic_generator"],
            context=[research_task]
        )
        tasks.append(topic_gen_task)

        # Task 3: Content Creation (for first topic)
        creation_config = self.tasks_config["content_creation_task"]
        creation_task = Task(
            description=creation_config["description"].format(
                topic_title="Top generated topic",
                keywords="Primary keywords from research",
                word_count=2500,
                content_type="comprehensive guide"
            ),
            expected_output=creation_config["expected_output"],
            agent=self.agents["content_creator"],
            context=[research_task, topic_gen_task]
        )
        tasks.append(creation_task)

        # Task 4: SEO Optimization
        seo_opt_config = self.tasks_config["seo_optimization_task"]
        seo_opt_task = Task(
            description=seo_opt_config["description"].format(
                topic_title="Generated topic title",
                primary_keyword="Primary keyword"
            ),
            expected_output=seo_opt_config["expected_output"],
            agent=self.agents["seo_optimizer"],
            context=[creation_task]
        )
        tasks.append(seo_opt_task)

        # Task 5: Publishing (if platforms specified)
        if platforms:
            publish_config = self.tasks_config["publishing_task"]
            publish_task = Task(
                description=publish_config["description"].format(
                    platforms=", ".join(platforms),
                    content_html="Generated content",
                    seo_metadata="SEO metadata",
                    publish_status=publish_status
                ),
                expected_output=publish_config["expected_output"],
                agent=self.agents["publisher"],
                context=[creation_task, seo_opt_task]
            )
            tasks.append(publish_task)

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
                "name": "SEO Researcher",
                "role": self.agents_config["seo_researcher"]["role"],
                "capabilities": [
                    "Search volume analysis",
                    "Competitor content gap identification",
                    "User intent analysis",
                    "Keyword research"
                ],
                "tools": ["Groq Compound Web Search"]
            },
            {
                "name": "Topic Generator",
                "role": self.agents_config["topic_generator"]["role"],
                "capabilities": [
                    "Strategic topic ideation",
                    "Quick win identification",
                    "Content type recommendation",
                    "Priority scoring"
                ],
                "tools": ["Groq LLM"]
            },
            {
                "name": "Content Creator",
                "role": self.agents_config["content_creator"]["role"],
                "capabilities": [
                    "E-E-A-T compliant writing",
                    "Long-form content creation",
                    "Research and citation",
                    "SEO-optimized structure"
                ],
                "tools": ["Groq Compound Web Search", "Groq LLM"]
            },
            {
                "name": "SEO Optimizer",
                "role": self.agents_config["seo_optimizer"]["role"],
                "capabilities": [
                    "Meta tag generation",
                    "Schema markup creation",
                    "Internal linking strategy",
                    "Technical SEO checks"
                ],
                "tools": ["Groq LLM"]
            },
            {
                "name": "Publisher",
                "role": self.agents_config["publisher"]["role"],
                "capabilities": [
                    "WordPress publishing",
                    "Sanity CMS publishing",
                    "Multi-platform distribution",
                    "Content validation"
                ],
                "tools": ["WordPress Tool", "Sanity Tool"]
            }
        ]
