export type GtmQuestionType = 'single_select' | 'multi_select' | 'free_text';

export interface GtmQuestionOption {
  value: string;
  label: string;
  recommended?: boolean;
}

export interface GtmInterviewQuestion {
  id: string;
  question: string;
  helperText?: string;
  type: GtmQuestionType;
  options?: GtmQuestionOption[];
  allowCustomAnswer?: boolean;
  selectedValue?: string | null;
  selectedLabel?: string | null;
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
  | 'company_intel_marketing_ideas'
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

/** Full GTM strategy document (post-lock wizard option) */
export interface GtmStrategyDocSection {
  id: string;
  title: string;
  channel: string;
  summary: string;
  bullets: string[];
  body: string;
}

export interface GtmStrategyDocument {
  title: string;
  executiveSummary: string;
  generatedAt?: string;
  moduleId?: string;
  moduleName?: string;
  sections: GtmStrategyDocSection[];
  nextSteps: string[];
  model?: string | null;
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
  answers: Record<string, string>; // questionId → chosen label
  strategy: GtmStrategyResponse;
  blocks: GtmStrategyBlock[];
}

/** GTM Module Wizard (post-onboarding chat) */
export type GtmModuleType = 'product' | 'service' | 'app' | 'business_line';
export type GtmModuleStatus = 'draft' | 'in_progress' | 'ready' | 'archived';

export type GtmInterviewSectionId =
  | 'module'
  | 'offer'
  | 'audience'
  | 'problem'
  | 'positioning'
  | 'distribution'
  | 'content'
  | 'leads'
  | 'goals';

export interface GtmSectionAnswer {
  value: string;
  label: string;
  /** Present when the question was answered as multi-select */
  values?: string[];
  labels?: string[];
}

export interface GtmSectionStateEntry {
  locked: boolean;
  locked_at?: string | null;
  answers?: Record<string, GtmSectionAnswer>;
}

export interface GtmModuleProfile {
  module?: { type?: GtmModuleType; name?: string };
  offer?: Record<string, string>;
  audience?: Record<string, string>;
  problem?: Record<string, string>;
  positioning?: Record<string, string>;
  distribution?: Record<string, string>;
  content?: Record<string, string>;
  leads?: Record<string, string>;
  goals?: Record<string, string>;
  locked_sections?: string[];
  inferences?: {
    from_crawl?: string[];
    confidence?: number;
  };
  last_executed_task?: {
    taskId: string;
    agentTarget: AgentTarget;
    at: string;
  };
  [key: string]: unknown;
}

export interface GtmModule {
  id: string;
  workspace_id: string;
  user_id: string;
  company_id?: string | null;
  name: string;
  module_type: GtmModuleType;
  status: GtmModuleStatus;
  source_context: Record<string, unknown>;
  profile: GtmModuleProfile;
  section_state: Record<string, GtmSectionStateEntry>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GtmProgressSection {
  id: string;
  title: string;
  description: string;
  locked: boolean;
  lockedAt?: string | null;
  answerCount: number;
  totalQuestions: number;
}

export interface GtmWizardProgress {
  sections: GtmProgressSection[];
  currentSectionId: string | null;
  allLocked: boolean;
  status: GtmModuleStatus;
}

export interface GtmSectionQuestionsResponse {
  sectionId: string;
  title: string;
  description: string;
  questions: GtmInterviewQuestion[];
  progress: GtmWizardProgress;
}

export interface GtmExecuteOption {
  id: string;
  title: string;
  description: string;
  agentTarget: AgentTarget | null;
  kind?: 'agent' | 'document';
  recommended?: boolean;
  contextSummary?: string;
}

export interface GtmDeployRequest {
  target: AgentTarget;
  /** Prefer company created during GTM quiet prep / crawl */
  companyId?: string | null;
  context?: {
    sectionId?: string;
    sectionTitle?: string;
    summary?: string;
    bullets?: string[];
  };
}
