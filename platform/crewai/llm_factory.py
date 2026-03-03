import os
from typing import Optional


def create_crewai_llm(
    *,
    api_key: Optional[str] = None,
    model: str = "groq/llama-3.3-70b-versatile",
    temperature: float = 0.3,
    max_tokens: int = 4000,
):
    """
    Create a CrewAI-native LLM.

    CrewAI v1.x uses LiteLLM for non-OpenAI providers like Groq. If LiteLLM
    isn't installed, CrewAI will error during LLM instantiation.
    """
    resolved_api_key = api_key or os.getenv("GROQ_API_KEY")
    if not resolved_api_key:
        raise ValueError("GROQ_API_KEY must be provided or set in environment")

    try:
        from crewai import LLM
    except Exception as e:  # pragma: no cover
        raise RuntimeError("Failed to import CrewAI LLM") from e

    try:
        return LLM(
            model=model,
            api_key=resolved_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except ImportError as e:
        raise RuntimeError(
            "CrewAI Groq models require LiteLLM. Install dependencies with "
            "`pip install 'crewai[litellm]'` or ensure `litellm` is installed."
        ) from e
