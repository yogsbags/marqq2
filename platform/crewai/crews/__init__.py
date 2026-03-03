"""
Torqq AI Specialized Crews

Multi-crew architecture with 9 specialized business modules.
Each crew orchestrates 4-5 agents for domain-specific workflows.
"""

from .competitor_intelligence import CompetitorIntelligenceCrew
from .content_automation import ContentAutomationCrew
from .lead_intelligence import LeadIntelligenceCrew
from .social_campaign import SocialCampaignCrew
from .video_generation import VideoGenerationCrew
from .company_intelligence import CompanyIntelligenceCrew
from .customer_view import CustomerViewCrew
from .budget_optimization import BudgetOptimizationCrew
from .performance_scorecard import PerformanceScorecardCrew

__all__ = [
    'CompetitorIntelligenceCrew',
    'ContentAutomationCrew',
    'LeadIntelligenceCrew',
    'SocialCampaignCrew',
    'VideoGenerationCrew',
    'CompanyIntelligenceCrew',
    'CustomerViewCrew',
    'BudgetOptimizationCrew',
    'PerformanceScorecardCrew'
]
