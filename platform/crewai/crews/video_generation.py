"""
Torqq AI Video Generation Crew
Multi-agent system for storyboarding, AI video generation, avatar creation, and professional editing
"""

import os
from typing import List, Dict, Any, Optional
from crewai import Agent, Task, Crew, Process
import yaml

from llm_factory import create_crewai_llm
from memory_config import resolve_agent_memory, resolve_crew_memory

class VideoGenerationCrew:
    """
    Video Generation Crew

    Orchestrates 4 specialized agents for complete video production workflow:
    1. Storyboard Design → Visual narrative and shot sequences
    2. Veo 3.1 Generation → AI-generated video clips with scene extension
    3. Avatar Creation → HeyGen AI spokesperson videos
    4. Video Editing → Shotstack multi-track compositing and platform exports
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        """
        Initialize the video generation crew

        Args:
            groq_api_key: Groq API key (defaults to GROQ_API_KEY env var)
        """
        api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")

        self.llm = create_crewai_llm(api_key=api_key, temperature=0.6, max_tokens=6000)

        self.agents_config = self._load_yaml_config("config/agents/video.yaml")
        self.tasks_config = self._load_yaml_config("config/tasks/video.yaml")

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

        storyboard_config = self.agents_config["storyboard_agent"]
        agents["storyboard_agent"] = Agent(
            role=storyboard_config["role"],
            goal=storyboard_config["goal"],
            backstory=storyboard_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=storyboard_config.get("verbose", True),
            allow_delegation=storyboard_config.get("allow_delegation", False),
            max_iter=storyboard_config.get("max_iter", 12),
            memory=resolve_agent_memory(storyboard_config),
            cache=storyboard_config.get("cache", True),
            max_rpm=storyboard_config.get("max_rpm", 20),
            max_execution_time=storyboard_config.get("max_execution_time", 240)
        )

        veo_config = self.agents_config["veo_generator"]
        agents["veo_generator"] = Agent(
            role=veo_config["role"],
            goal=veo_config["goal"],
            backstory=veo_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=veo_config.get("verbose", True),
            allow_delegation=veo_config.get("allow_delegation", False),
            max_iter=veo_config.get("max_iter", 25),
            memory=resolve_agent_memory(veo_config),
            cache=veo_config.get("cache", True),
            max_rpm=veo_config.get("max_rpm", 10),
            max_execution_time=veo_config.get("max_execution_time", 900)
        )

        avatar_config = self.agents_config["avatar_specialist"]
        agents["avatar_specialist"] = Agent(
            role=avatar_config["role"],
            goal=avatar_config["goal"],
            backstory=avatar_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=avatar_config.get("verbose", True),
            allow_delegation=avatar_config.get("allow_delegation", False),
            max_iter=avatar_config.get("max_iter", 15),
            memory=resolve_agent_memory(avatar_config),
            cache=avatar_config.get("cache", True),
            max_rpm=avatar_config.get("max_rpm", 15),
            max_execution_time=avatar_config.get("max_execution_time", 600)
        )

        editor_config = self.agents_config["video_editor"]
        agents["video_editor"] = Agent(
            role=editor_config["role"],
            goal=editor_config["goal"],
            backstory=editor_config["backstory"],
            tools=[],
            llm=self.llm,
            verbose=editor_config.get("verbose", True),
            allow_delegation=editor_config.get("allow_delegation", False),
            max_iter=editor_config.get("max_iter", 20),
            memory=resolve_agent_memory(editor_config),
            cache=editor_config.get("cache", True),
            max_rpm=editor_config.get("max_rpm", 15),
            max_execution_time=editor_config.get("max_execution_time", 600)
        )

        return agents

    def execute_workflow(
        self,
        user_request: str,
        script: Optional[str] = None,
        video_duration: int = 60,
        video_style: str = "professional",
        platform: str = "linkedin",
        include_avatar: bool = False,
        avatar_style: str = "professional",
        voice_preference: str = "indian_female_professional",
        branding: Optional[Dict] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute video generation workflow

        Args:
            user_request: Natural language request
            script: Video script text
            video_duration: Video length in seconds
            video_style: Visual style (professional, casual, cinematic)
            platform: Target platform (linkedin, instagram, youtube)
            include_avatar: Whether to include HeyGen avatar
            avatar_style: Avatar appearance style
            voice_preference: Voice selection for avatar
            branding: Branding assets (logo, colors, fonts)

        Returns:
            Workflow results
        """
        if script is None:
            script = user_request

        if branding is None:
            branding = {
                "logo_url": "",
                "primary_color": "#003366",
                "secondary_color": "#FFFFFF",
                "font": "Arial"
            }

        num_scenes = (video_duration + 7) // 8

        tasks = []

        storyboard_config = self.tasks_config["storyboard_task"]
        storyboard_task = Task(
            description=storyboard_config["description"].format(
                script=script,
                video_duration=video_duration,
                video_style=video_style,
                platform=platform,
                num_scenes=num_scenes
            ),
            expected_output=storyboard_config["expected_output"],
            agent=self.agents["storyboard_agent"]
        )
        tasks.append(storyboard_task)

        veo_config = self.tasks_config["veo_generation_task"]
        veo_task = Task(
            description=veo_config["description"].format(
                storyboard="Storyboard from previous step",
                video_duration=video_duration,
                num_scenes=num_scenes
            ),
            expected_output=veo_config["expected_output"],
            agent=self.agents["veo_generator"],
            context=[storyboard_task]
        )
        tasks.append(veo_task)

        if include_avatar:
            avatar_config = self.tasks_config["avatar_generation_task"]
            avatar_task = Task(
                description=avatar_config["description"].format(
                    script=script,
                    avatar_style=avatar_style,
                    voice_preference=voice_preference,
                    video_duration=video_duration
                ),
                expected_output=avatar_config["expected_output"],
                agent=self.agents["avatar_specialist"]
            )
            tasks.append(avatar_task)

            editing_context = [storyboard_task, veo_task, avatar_task]
        else:
            editing_context = [storyboard_task, veo_task]

        editing_config = self.tasks_config["video_editing_task"]
        editing_task = Task(
            description=editing_config["description"].format(
                scene_clips="Veo generated clips",
                avatar_video="Avatar video" if include_avatar else "None",
                script=script,
                platform=platform,
                branding=branding,
                video_duration=video_duration
            ),
            expected_output=editing_config["expected_output"],
            agent=self.agents["video_editor"],
            context=editing_context
        )
        tasks.append(editing_task)

        crew = Crew(
            agents=list(self.agents.values()),
            tasks=tasks,
            process=Process.sequential,
            verbose=True,
            memory=resolve_crew_memory(),
            cache=True,
            max_rpm=15,
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
                "name": "Storyboard Designer",
                "role": self.agents_config["storyboard_agent"]["role"],
                "capabilities": [
                    "Visual narrative design",
                    "Scene-by-scene breakdowns (8s segments)",
                    "Shot composition and camera work",
                    "Transition and timing planning"
                ],
                "tools": ["Groq LLM"]
            },
            {
                "name": "Veo 3.1 Generator",
                "role": self.agents_config["veo_generator"]["role"],
                "capabilities": [
                    "Google Veo 3.1 scene extension (8s clips chained)",
                    "Up to 12-minute videos (90 clips × 8s)",
                    "Multi-provider fallback (Fal AI, Replicate)",
                    "High-resolution output (1080p, 4K)"
                ],
                "tools": ["Google Veo 3.1", "Fal AI", "Replicate"]
            },
            {
                "name": "Avatar Specialist",
                "role": self.agents_config["avatar_specialist"]["role"],
                "capabilities": [
                    "HeyGen AI spokesperson generation",
                    "Natural Indian voices (Cartesia, HeyGen native)",
                    "Realistic lip sync and expressions",
                    "Multiple integration options (standalone, PIP, split-screen)"
                ],
                "tools": ["HeyGen", "Cartesia", "OpenAI TTS"]
            },
            {
                "name": "Video Editor",
                "role": self.agents_config["video_editor"]["role"],
                "capabilities": [
                    "Shotstack multi-track compositing (up to 50 tracks)",
                    "Avatar + B-roll layering",
                    "Captions, branding, music integration",
                    "Platform-specific exports (16:9, 1:1, 9:16)"
                ],
                "tools": ["Shotstack", "FFmpeg"]
            }
        ]
