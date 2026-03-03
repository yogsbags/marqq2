"""
Groq Compound Web Search Tool for CrewAI
Provides web search capabilities using Groq's Compound model with real-time web access
"""

import os
import json
from typing import Any, Optional, Type
from pydantic import BaseModel, Field, SecretStr
from crewai.tools import BaseTool
from langchain_groq import ChatGroq


class GroqWebSearchInput(BaseModel):
    """Input schema for Groq web search"""
    query: str = Field(..., description="Search query to find information on the web")
    max_results: int = Field(5, description="Maximum number of search results to return")


class GroqWebSearchTool(BaseTool):
    """
    Groq Compound Web Search Tool

    Uses Groq's Compound model with web search capabilities to find
    real-time information from the web. Ideal for competitor research,
    news monitoring, and market intelligence gathering.
    """

    name: str = "groq_web_search"
    description: str = """
    Search the web for real-time information using Groq Compound.
    Use this tool to:
    - Find competitors in a specific market
    - Research company information and news
    - Discover pricing and product details
    - Monitor industry trends and announcements
    - Gather market intelligence

    Returns structured search results with URLs and snippets.
    """
    args_schema: Type[BaseModel] = GroqWebSearchInput

    llm: Optional[Any] = None

    def __init__(self, llm: Optional[Any] = None, **kwargs):
        """
        Initialize Groq Web Search Tool

        Args:
            llm: Pre-configured ChatGroq instance with web search capabilities
        """
        super().__init__(**kwargs)

        if llm is not None:
            self.llm = llm
        else:
            # Initialize Groq Compound model with web search
            groq_api_key = os.getenv("GROQ_API_KEY")
            if not groq_api_key:
                raise ValueError("GROQ_API_KEY environment variable not set")

            preferred_model = os.getenv("GROQ_WEB_SEARCH_MODEL", "groq/compound")
            fallback_model = os.getenv("GROQ_WEB_SEARCH_FALLBACK_MODEL", "llama-3.3-70b-versatile")

            try:
                self.llm = ChatGroq(
                    api_key=SecretStr(groq_api_key),
                    model=preferred_model,
                    temperature=0.3,
                    max_tokens=4000
                )
            except Exception:
                self.llm = ChatGroq(
                    api_key=SecretStr(groq_api_key),
                    model=fallback_model,
                    temperature=0.3,
                    max_tokens=4000
                )

    def _run(self, query: str, max_results: int = 5) -> str:
        """
        Execute web search using Groq Compound

        Args:
            query: Search query
            max_results: Maximum results to return

        Returns:
            Formatted search results as string
        """
        try:
            if self.llm is None:
                return "Error: LLM not initialized"

            # Groq Compound automatically searches the web when needed
            search_prompt = f"""Search the web for: {query}

Provide the top {max_results} most relevant and recent results.
For each result, include:
- Title
- URL
- Brief summary (2-3 sentences)
- Date published (if available)

Format as structured JSON array."""

            response = self.llm.invoke(search_prompt)

            # Extract content from response
            if hasattr(response, 'content'):
                content = response.content
            else:
                content = str(response)

            # Try to parse as JSON, fallback to raw text
            try:
                results = json.loads(content)
                return json.dumps(results, indent=2)
            except json.JSONDecodeError:
                # Return as is if not JSON
                return content

        except Exception as e:
            return f"Error during web search: {str(e)}"

    async def _arun(self, query: str, max_results: int = 5) -> str:
        """Async version of _run (not implemented, falls back to sync)"""
        return self._run(query, max_results)
