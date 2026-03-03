#!/usr/bin/env python3
"""
CrewAI Multi-Agent Backend for Torqq AI
Production-ready multi-module intelligence platform with automated monitoring
"""

import os
import re
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from orchestrator import CrewOrchestrator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Pydantic models for API
class WorkflowRequest(BaseModel):
    """Request model for workflow execution"""
    user_request: str = Field(..., description="Natural language request from user")
    module: Optional[str] = Field(None, description="Module to execute (competitor, content, lead, etc.). Auto-detected if not provided.")
    user_id: Optional[str] = Field(None, description="User ID for personalization")
    company_name: Optional[str] = Field(None, description="Company name for analysis")
    company_url: Optional[str] = Field(None, description="Company website URL")
    region: Optional[str] = Field("global", description="Target region")
    enable_monitoring: bool = Field(True, description="Auto-activate monitoring")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")

class WorkflowResponse(BaseModel):
    """Response model for workflow execution"""
    workflow_id: str
    module: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None

class MultiWorkflowRequest(BaseModel):
    """Request model for multi-crew parallel execution"""
    requests: List[WorkflowRequest] = Field(..., description="List of workflow requests to execute in parallel")

# Global variables
orchestrator: Optional["CrewOrchestrator"] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle management for FastAPI app"""
    # Startup
    global orchestrator

    logger.info("🚀 Starting CrewAI Multi-Module Backend...")
    os.environ.setdefault("CREWAI_TESTING", "true")

    # Initialize orchestrator
    try:
        from orchestrator import CrewOrchestrator

        orchestrator = CrewOrchestrator()
        modules = orchestrator.get_available_modules()
        logger.info(f"✅ Orchestrator initialized with {len(modules)} modules")
        for module_name, module_info in modules.items():
            logger.info(f"   📦 {module_name}: {module_info['status']}")
    except Exception as e:
        logger.error(f"❌ Failed to initialize orchestrator: {e}")
        logger.warning("⚠️  Backend will start but workflows will fail")

    yield

    # Shutdown
    logger.info("👋 Shutting down CrewAI backend...")

# Create FastAPI app
app = FastAPI(
    title="CrewAI Multi-Module Backend",
    description="Production-ready multi-module intelligence platform with automated monitoring",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    modules = {}
    if orchestrator:
        modules = orchestrator.get_available_modules()

    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "orchestrator_configured": orchestrator is not None,
        "available_modules": list(modules.keys()) if modules else []
    }

# Main workflow execution endpoint
@app.post("/api/crewai/execute", response_model=WorkflowResponse)
async def execute_workflow(
    request: WorkflowRequest,
    background_tasks: BackgroundTasks
):
    """
    Execute workflow with automatic crew routing

    This endpoint:
    1. Analyzes user intent (if module not specified)
    2. Routes to appropriate crew (competitor, content, lead, etc.)
    3. Executes workflow with specialized agents
    4. Returns aggregated results

    Module auto-detection:
    - "Find competitors for Salesforce" → competitor module
    - "Generate blog about mutual funds" → content module
    - "Score these leads" → lead module
    - "Create LinkedIn campaign" → social module
    """
    workflow_id = f"wf-{int(datetime.now().timestamp() * 1000)}"
    created_at = datetime.now().isoformat()

    try:
        if orchestrator is None:
            raise HTTPException(
                status_code=503,
                detail="Orchestrator not initialized. Check GROQ_API_KEY and other environment variables."
            )

        logger.info(f"[{workflow_id}] Starting workflow execution")
        logger.info(f"[{workflow_id}] Request: {request.user_request}")
        if request.module:
            logger.info(f"[{workflow_id}] Explicit module: {request.module}")

        # Route request to appropriate crew
        result = orchestrator.route_request(
            user_request=request.user_request,
            module=request.module,
            company_name=request.company_name,
            company_url=request.company_url,
            region=request.region or "global",
            user_id=request.user_id or "default",
            enable_monitoring=request.enable_monitoring
        )
        result = _normalize_json_like_payload(result)

        completed_at = datetime.now().isoformat()

        logger.info(f"[{workflow_id}] Workflow completed: {result['status']}")

        return WorkflowResponse(
            workflow_id=workflow_id,
            module=result["module"],
            status=result["status"],
            result=result.get("result"),
            error=result.get("error"),
            created_at=created_at,
            completed_at=completed_at
        )

    except Exception as e:
        logger.error(f"[{workflow_id}] Workflow execution failed: {str(e)}", exc_info=True)

        return WorkflowResponse(
            workflow_id=workflow_id,
            module=request.module or "unknown",
            status="failed",
            error=str(e),
            created_at=created_at,
            completed_at=datetime.now().isoformat()
        )

# Multi-crew parallel execution endpoint
@app.post("/api/crewai/execute-parallel")
async def execute_parallel_workflows(request: MultiWorkflowRequest):
    """
    Execute multiple workflows in parallel across different crews

    Example use cases:
    - Generate content + Create social campaign simultaneously
    - Score leads + Enrich company data in parallel
    - Analyze competitors + Generate performance report together
    """
    if orchestrator is None:
        raise HTTPException(
            status_code=503,
            detail="Orchestrator not initialized"
        )

    logger.info(f"🔄 Executing {len(request.requests)} workflows in parallel")

    # Convert WorkflowRequest objects to dicts
    requests_data = [
        {
            "user_request": req.user_request,
            "module": req.module,
            "company_name": req.company_name,
            "region": req.region,
            "user_id": req.user_id,
            "enable_monitoring": req.enable_monitoring
        }
        for req in request.requests
    ]

    results = orchestrator.execute_multi_crew_workflow(requests_data)
    results = [_normalize_json_like_payload(item) for item in results]

    return {
        "workflows_executed": len(results),
        "results": results,
        "timestamp": datetime.now().isoformat()
    }

# Get available modules endpoint
@app.get("/api/crewai/modules")
async def get_modules():
    """Get list of available modules and their capabilities"""
    if orchestrator is None:
        raise HTTPException(
            status_code=503,
            detail="Orchestrator not initialized"
        )

    modules = orchestrator.get_available_modules()

    return {
        "modules": modules,
        "count": len(modules)
    }

# Module-specific endpoint: Competitor Intelligence
@app.post("/api/crewai/competitor/analyze")
async def analyze_competitors(
    company_name: str,
    region: str = "global",
    user_id: str = "default",
    enable_monitoring: bool = True
):
    """Direct endpoint for competitor analysis"""
    request = WorkflowRequest(
        user_request=f"Analyze competitors for {company_name}",
        module="competitor",
        company_name=company_name,
        region=region,
        user_id=user_id,
        enable_monitoring=enable_monitoring
    )

    return await execute_workflow(request, BackgroundTasks())

# ─────────────────────────────────────────────────────────────────────────────
# Company Intelligence: direct Groq generation (bypasses crew orchestrator)
# ─────────────────────────────────────────────────────────────────────────────

class CompanyIntelRequest(BaseModel):
    company_name: str = Field(..., description="Company name")
    company_url: Optional[str] = Field(None, description="Company website URL")
    artifact_type: str = Field(..., description="Type of artifact to generate")
    inputs: Optional[Dict[str, Any]] = Field(None, description="Additional inputs")
    company_profile: Optional[Dict[str, Any]] = Field(None, description="Company profile data")

class CompanyIntelResponse(BaseModel):
    artifact_type: str
    status: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    generated_at: str

# Artifact specs: label + JSON schema (mirrors backend-server.js exactly)
ARTIFACT_SPECS: Dict[str, Dict[str, str]] = {
    "competitor_intelligence": {
        "label": "Competitor Intelligence",
        "schema": '{"topCompetitors":[{"name":string,"website":string|null,"whyRelevant":string,"positioningSnapshot":string,"strengths":string[],"weaknesses":string[]}],"comparison":{"yourDifferentiators":string[],"messagingGaps":string[],"opportunities":string[]},"notes":string[]}',
    },
    "website_audit": {
        "label": "Website Audit",
        "schema": '{"summary":string,"firstImpression":{"clarityScore":number,"trustScore":number,"visualHierarchyScore":number,"notes":string[]},"conversionFunnel":{"primaryCta":string,"frictionPoints":string[],"recommendedCtas":string[]},"homepageSections":[{"section":string,"whatWorks":string[],"issues":string[],"recommendations":string[]}],"copyRecommendations":{"headlineOptions":string[],"subheadlineOptions":string[],"ctaCopyOptions":string[]},"uxRecommendations":{"quickWins":string[],"highImpactChanges":string[],"a11yNotes":string[]},"seoNotes":string[],"experiments":[{"name":string,"hypothesis":string,"implementation":string[],"successMetric":string}],"priorityPlan":[{"priority":"high"|"medium"|"low","task":string,"why":string,"effort":"low"|"medium"|"high","ownerHint":string}]}',
    },
    "opportunities": {
        "label": "Opportunities",
        "schema": '{"summary":string,"quickWins":[{"title":string,"priority":"high"|"medium"|"low","description":string,"expectedImpact":string,"timeToValue":string}],"opportunities":[{"title":string,"category":string,"priority":"high"|"medium"|"low","description":string,"expectedImpact":string,"effort":"low"|"medium"|"high","requirements":string[],"nextSteps":string[]}],"risksAndMitigations":[{"risk":string,"mitigation":string}],"90DayPlan":[{"week":number,"focus":string,"keyActivities":string[]}]}',
    },
    "client_profiling": {
        "label": "Client Profiling Analytics",
        "schema": '{"segments":[{"name":string,"profile":string,"jobsToBeDone":string[],"painPoints":string[],"objections":string[],"triggers":string[],"channels":string[]}],"insights":string[]}',
    },
    "partner_profiling": {
        "label": "Partner Profiling Analytics",
        "schema": '{"partnerTypes":[{"name":string,"valueExchange":string,"selectionCriteria":string[],"activationPlaybook":string[]}],"insights":string[]}',
    },
    "icps": {
        "label": "ICPs / Cohorts",
        "schema": '{"icps":[{"name":string,"who":string,"firmographics":string[],"psychographics":string[],"qualifiers":string[],"disqualifiers":string[],"hook":string,"channels":string[]}],"cohorts":[{"name":string,"definition":string,"priority":number,"messagingAngle":string}],"notes":string[]}',
    },
    "social_calendar": {
        "label": "Social Media Content Calendar",
        "schema": '{"timezone":string,"startDate":string,"weeks":number,"channels":string[],"cadence":{"postsPerWeek":number},"items":[{"date":string,"channel":string,"format":string,"pillar":string,"hook":string,"captionBrief":string,"cta":string,"assetNotes":string,"complianceNote":string}],"themes":string[]}',
    },
    "marketing_strategy": {
        "label": "Marketing Strategy",
        "schema": '{"objective":string,"targetSegments":string[],"positioning":string,"messagingPillars":string[],"funnelPlan":[{"stage":string,"goal":string,"channels":string[],"offers":string[]}],"kpis":string[],"90DayPlan":[{"week":number,"focus":string,"keyActivities":string[]}],"risksAndMitigations":string[]}',
    },
    "positioning_messaging": {
        "label": "Positioning & Messaging",
        "schema": '{"positioning":{"tagline":string,"elevatorPitch":string,"valueProp":string,"categoryPosition":string,"targetAudience":string},"messagingFramework":{"coreBenefits":string[],"emotionalDrivers":string[],"rationalDrivers":string[],"proofPoints":string[]},"brandVoice":{"tone":string,"style":string,"dos":string[],"donts":string[]},"competitiveDifferentiators":string[],"messagingPillars":[{"pillar":string,"description":string,"sampleMessages":string[]}],"notes":string[]}',
    },
    "sales_enablement": {
        "label": "Sales Enablement",
        "schema": '{"battlecards":[{"competitor":string,"theirStrength":string,"ourCounter":string,"landmines":string[],"winningTactics":string[]}],"objectionHandling":[{"objection":string,"response":string,"proof":string}],"discovery":{"qualifyingQuestions":string[],"painPointProbes":string[],"budgetConversation":string[]},"demoScript":{"hook":string,"discovery":string,"demo":string,"close":string},"emailTemplates":[{"stage":string,"subject":string,"body":string}],"resources":{"caseStudies":string[],"productSheets":string[],"roisCalculators":string[]},"notes":string[]}',
    },
    "pricing_intelligence": {
        "label": "Pricing Intelligence",
        "schema": '{"pricingModel":{"type":string,"rationale":string},"tiers":[{"name":string,"price":string,"targetSegment":string,"features":string[],"positioning":string}],"competitorPricing":[{"competitor":string,"pricingModel":string,"strengths":string[],"weaknesses":string[]}],"valueMetrics":string[],"discountingStrategy":{"rulesOfThumb":string[],"triggerScenarios":string[]},"packaging":{"bundles":string[],"addOns":string[]},"pricingPsychology":{"anchoringTechniques":string[],"framing":string[]},"notes":string[]}',
    },
    "content_strategy": {
        "label": "Content Strategy",
        "schema": '{"contentPillars":[{"name":string,"purpose":string,"exampleTopics":string[]}],"formats":string[],"distributionRules":string[],"repurposingPlan":string[],"governance":{"reviewChecklist":string[]}}',
    },
    "channel_strategy": {
        "label": "Channel Strategy",
        "schema": '{"channels":[{"name":string,"role":string,"contentMix":string[],"cadence":string,"growthLoops":string[]}],"budgetSplitGuidance":string[],"measurement":string[]}',
    },
    "lookalike_audiences": {
        "label": "Lookalike Audiences",
        "schema": '{"seedAudiences":string[],"lookalikes":[{"platform":string,"targeting":string[],"exclusions":string[],"creativeAngles":string[]}],"measurement":string[]}',
    },
    "lead_magnets": {
        "label": "Lead Magnets",
        "schema": '{"leadMagnets":[{"name":string,"format":string,"promise":string,"outline":string[],"landingPageCopy":{"headline":string,"subheadline":string,"bullets":string[],"cta":string},"followUpSequence":[{"day":number,"subject":string,"goal":string}]}],"notes":string[]}',
    },
}


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extract first valid JSON object from LLM response text."""
    if not text:
        return None
    # 1) code fence
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # 2) whole response
    try:
        return json.loads(text)
    except Exception:
        pass
    # 3) scan for first complete JSON object
    depth = 0
    start = -1
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                try:
                    return json.loads(text[start : i + 1])
                except Exception:
                    start = -1
    return None


def _normalize_json_like_payload(value: Any) -> Any:
    """
    Recursively normalize LLM/crew outputs:
    - Parse markdown-fenced JSON strings
    - Parse plain JSON strings (object/array)
    - Traverse dict/list structures
    """
    if isinstance(value, dict):
        return {k: _normalize_json_like_payload(v) for k, v in value.items()}

    if isinstance(value, list):
        return [_normalize_json_like_payload(item) for item in value]

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return value

        # Handle fenced JSON blocks first
        if text.startswith("```"):
            parsed_obj = _extract_json(text)
            if parsed_obj is not None:
                return _normalize_json_like_payload(parsed_obj)
            return value

        # Handle plain JSON object/array strings
        if text[0] in "{[":
            try:
                parsed = json.loads(text)
                return _normalize_json_like_payload(parsed)
            except Exception:
                parsed_obj = _extract_json(text)
                if parsed_obj is not None:
                    return _normalize_json_like_payload(parsed_obj)

    return value


async def _call_groq(
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    model: str = "groq/compound",
    temperature: float = 0.4,
    max_tokens: int = 2000,
    retries: int = 0,
) -> str:
    """Call Groq chat completions API directly via httpx."""
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )

    if response.status_code == 429 and retries < 4:
        retry_after = int(response.headers.get("retry-after", "0"))
        wait = retry_after if retry_after > 0 else min(4 * (2 ** retries), 60)
        logger.warning(f"Rate limited on {model}, waiting {wait}s (retry {retries+1}/4)")
        import asyncio
        await asyncio.sleep(wait)
        return await _call_groq(api_key, system_prompt, user_prompt, model, temperature, max_tokens, retries + 1)

    if not response.is_success:
        raise RuntimeError(f"Groq API error {response.status_code}: {response.text[:300]}")

    data = response.json()
    return (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()


async def _generate_artifact_direct(
    artifact_type: str,
    company_name: str,
    company_url: Optional[str],
    profile: Dict[str, Any],
    inputs: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate a single company-intel artifact via direct Groq calls."""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set")

    spec = ARTIFACT_SPECS.get(artifact_type)
    if not spec:
        raise ValueError(f"Unknown artifact type: {artifact_type}. Supported: {list(ARTIFACT_SPECS.keys())}")

    # Build prompts
    if artifact_type == "competitor_intelligence":
        industry = profile.get("industry", "")
        geo = ", ".join(profile.get("geoFocus", [])) or inputs.get("geo", "India")
        audience = ", ".join(profile.get("primaryAudience", []))
        products = ", ".join(p.get("name", "") for p in profile.get("productsServices", []) if isinstance(p, dict))
        competitors_hint = ", ".join(profile.get("competitorsHint", []))
        positioning = profile.get("positioning") or profile.get("summary", "")

        system_prompt = (
            "You are a master competitive intelligence analyst with real-time web search capability.\n"
            "Your task is to identify the closest DIRECT competitors for a given company and analyze them deeply.\n"
            "A direct competitor must operate in the SAME industry/vertical, target the SAME customer segment, "
            "and offer SIMILAR products or services.\n"
            "IMPORTANT: You MUST use your web search capabilities to find up-to-date, real-world data about the company and its competitors before answering.\n"
            "After performing your research, output your final answer as a valid JSON object enclosed in ```json ... ``` markers."
        )
        user_prompt = (
            f"Find the 5–7 closest direct competitors for this company and produce a competitive intelligence brief based on REAL data.\n\n"
            f"## Target Company\n"
            f"- Name: {company_name}\n"
            f"- Website: {company_url or '(none)'}\n"
            f"- Industry: {industry}\n"
            f"- Geography: {geo}\n"
            f"- Target customers: {audience or '(see products)'}\n"
            f"- Core products/services: {products or '(see profile)'}\n"
            f"- Positioning: {positioning}\n"
            f"- Known competitors (hints): {competitors_hint or '(none — use search)'}\n\n"
            f"## Execution Steps\n"
            f"1. Perform comprehensive web searches for {company_name} to understand their exact offering.\n"
            f"2. Search for their top niche competitors in {geo} (do not just list Microsoft/Google unless accurate).\n"
            f"3. Synthesize the research into a highly specific, non-generic strategy brief.\n\n"
            f"Provide your final output as a valid JSON object inside a ```json block matching this schema:\n{spec['schema']}"
        )
        temperature, max_tokens = 0.2, 3000
    else:
        system_prompt = (
            f"You are an elite, enterprise-grade growth marketer for India-focused brands.\n"
            f"Generate the requested artifact: {spec['label']}.\n"
            f"CRITICAL: You MUST use your web search capabilities first to gather real facts, firmographics, recent news, and exact market positioning about the company and its market.\n"
            f"We do NOT want generic ChatGPT-wrapper advice. We want highly specific, data-backed insights, precise job titles, factual pain points, and actionable strategies.\n"
            f"Keep compliance-safe for financial marketing: no guaranteed returns.\n"
            f"Output your final result wrapped in a ```json block."
        )
        critical_rules = (
            "CRITICAL OUTPUT RULES:\n"
            "1) Use web search to verify facts before generating strategy.\n"
            "2) Your final output MUST be a valid JSON object enclosed in ```json ... ``` markers.\n"
            "3) Include every required key from the schema. Do not add keys not present in the schema.\n"
            "4) Keep recommendations highly specific to the company's ACTUAL product and market realities.\n"
        )

        artifact_specific_rules = ""
        if artifact_type == "opportunities":
            artifact_specific_rules = (
                "CRITICAL FOR OPPORTUNITIES:\n"
                "- quickWins: provide at least 3 items with concrete expectedImpact and timeToValue.\n"
                "- opportunities: provide at least 5 items across mixed categories (targeting, creative, bidding,"
                " funnel/landing, lifecycle/retention, analytics).\n"
                "- Each opportunity must include explicit nextSteps and requirements.\n"
                "- risksAndMitigations: provide at least 3 realistic risks.\n"
                "- 90DayPlan: provide at least 12 weekly entries (week 1..12) with actionable keyActivities.\n"
                "- Tie expectedImpact to ROI/CPA/CVR/CTR/lead quality where applicable.\n"
            )

        user_prompt = (
            f"Company profile:\n{json.dumps(profile, indent=2)}\n\n"
            f"Additional inputs:\n{json.dumps(inputs, indent=2)}\n\n"
            f"{critical_rules}\n"
            f"{artifact_specific_rules}\n"
            f"Perform your research, write out your thoughts or findings, and then output ONLY the final artifact matching this JSON schema exactly, enclosed in ```json:\n{spec['schema']}"
        )
        temperature, max_tokens = 0.4, 2000

    model_candidates = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"]
    last_error: Optional[Exception] = None

    for model in model_candidates:
        try:
            raw = await _call_groq(api_key, system_prompt, user_prompt, model, temperature, max_tokens)
            parsed = _extract_json(raw)
            if parsed:
                return parsed
            # Retry with fix prompt
            fix_raw = await _call_groq(
                api_key,
                "Return ONLY valid JSON. No markdown. No commentary.",
                f"Fix into valid JSON matching this schema:\n\nSCHEMA:\n{spec['schema']}\n\nTEXT:\n{raw}",
                model,
                0.2,
                2000,
            )
            parsed = _extract_json(fix_raw)
            if parsed:
                return parsed
        except Exception as e:
            last_error = e
            logger.warning(f"Model {model} failed for {artifact_type}: {e}")

    raise RuntimeError(str(last_error) if last_error else "All models failed to produce valid JSON")


@app.post("/api/crewai/company-intel/generate", response_model=CompanyIntelResponse)
async def generate_company_artifact(request: CompanyIntelRequest):
    """
    Generate a Company Intelligence artifact via direct Groq API call.
    Supports all 15 artifact types without depending on the crew orchestrator.
    """
    try:
        if request.artifact_type not in ARTIFACT_SPECS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown artifact type: {request.artifact_type}. Supported: {list(ARTIFACT_SPECS.keys())}",
            )

        profile = request.company_profile or {}
        inputs = request.inputs or {}

        logger.info(f"[company-intel] Generating '{request.artifact_type}' for '{request.company_name}'")

        data = await _generate_artifact_direct(
            artifact_type=request.artifact_type,
            company_name=request.company_name,
            company_url=request.company_url,
            profile=profile,
            inputs=inputs,
        )

        logger.info(f"[company-intel] ✅ '{request.artifact_type}' generated successfully")
        return CompanyIntelResponse(
            artifact_type=request.artifact_type,
            status="completed",
            data=data,
            generated_at=datetime.now().isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[company-intel] ❌ '{request.artifact_type}' failed: {e}", exc_info=True)
        return CompanyIntelResponse(
            artifact_type=request.artifact_type,
            status="failed",
            error=str(e),
            generated_at=datetime.now().isoformat(),
        )

# Legacy compatibility endpoint (maintains backward compatibility)
@app.post("/api/crewai/execute-workflow")
async def execute_workflow_legacy(request: WorkflowRequest):
    """
    Legacy endpoint for backward compatibility
    Redirects to new unified execute endpoint
    """
    return await execute_workflow(request, BackgroundTasks())

# Main entry point
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8002"))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"🚀 Starting CrewAI multi-module backend on {host}:{port}")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=os.getenv("RELOAD", "true").lower() == "true",
        log_level=os.getenv("LOG_LEVEL", "info")
    )
