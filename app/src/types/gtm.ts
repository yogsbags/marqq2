export type GtmQuestionType = 'single_select' | 'multi_select' | 'free_text';

export interface GtmQuestionOption {
  value: string;
  label: string;
}

export interface GtmInterviewQuestion {
  id: string;
  question: string;
  helperText?: string;
  type: GtmQuestionType;
  options?: GtmQuestionOption[];
  allowCustomAnswer?: boolean;
}

export interface GtmInterviewPlan {
  title: string;
  questions: GtmInterviewQuestion[];
  model?: string;
}

export type AgentTarget =
  | 'company_intel_icp'
  | 'company_intel_competitors'
  | 'company_intel_marketing_strategy'
  | 'company_intel_sales_enablement'
  | 'company_intel_pricing'
  | 'company_intel_content_strategy'
  | 'company_intel_channel_strategy'
  | 'company_intel_social_calendar'
  | 'company_intel_lead_magnets'
  | 'lead_intelligence'
  | 'budget_optimization'
  | 'performance_scorecard'
  | 'user_engagement';

export interface GtmStrategySection {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
  recommendedAgentTarget: AgentTarget;
  deployLabel?: string;
}

export interface GtmStrategyResponse {
  title: string;
  executiveSummary: string;
  assumptions: string[];
  sections: GtmStrategySection[];
  nextSteps: string[];
  model?: string;
}

/** A section enriched with wizard UI state */
export interface GtmStrategyBlock extends GtmStrategySection {
  approved: boolean;
}

/** A fully saved strategy stored in localStorage */
export interface SavedGtmStrategy {
  id: string;
  createdAt: string;
  answers: Record<string, string>;  // questionId → chosen label
  strategy: GtmStrategyResponse;
  blocks: GtmStrategyBlock[];
}
