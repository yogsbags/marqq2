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
  channel?: string;
  summary: string;
  bullets: string[];
  body: string;
  subsections?: Array<{ title: string; body: string; bullets?: string[] }>;
}

export interface GtmStrategyGoalAlignment {
  business_archetype?: string | null;
  north_star_metric?: string | null;
  metric_definition?: string | null;
  ultimate_outcome_metric?: string | null;
  quantified_target?: string | null;
  timeline_target?: string | null;
  priority_90d?: string | null;
  channel_bet?: string | null;
  baseline?: string | null;
  target?: string | number | null;
  measurement_period?: string | null;
  metric_tree?: string[];
  guardrails?: string[];
  primary_loop?: string[];
  rejects_as_nsm?: string[];
  sectionTargets?: Array<{
    sectionId: string;
    metric?: string;
    contribution?: string;
    byWhen?: string;
  }>;
}

export type GtmVarianceStatus = 'green' | 'amber' | 'red' | 'critical' | 'pending' | 'unknown';

export interface GtmControlCheckpoint {
  period: number;
  label: string;
  target: number | null;
  actual: number | null;
  status: GtmVarianceStatus | string;
  attainment?: number | null;
  attainmentPct?: number | null;
}

export interface GtmControlIntervention {
  id: string;
  problem: string;
  affected_metric: string;
  current_value?: number | null;
  target_value?: number | null;
  hypothesis: string;
  intervention: string;
  expected_impact: string;
  owner: string;
  duration: string;
  dependencies?: string[];
  success_condition: string;
  rollback_condition: string;
  requires_human_approval?: boolean;
  status: 'proposed' | 'approved' | 'rejected' | 'executing' | 'done' | string;
  createdAt?: string;
}

export interface GtmControlCadence {
  principle?: string;
  real_time_monitoring?: string[];
  daily_review?: string[];
  weekly_course_correction?: string[];
  biweekly_experiment_review?: string[];
  monthly_resource_review?: string[];
  quarterly_strategy_review?: string[];
  metric_review_windows?: Array<{ metric_class: string; review_after: string }>;
  practical_rules?: string[];
}

export interface GtmControlLoopState {
  version?: number;
  updatedAt?: string;
  status?: GtmVarianceStatus | string;
  weeklyCycle?: Array<{ day: string; focus: string }>;
  cadence?: GtmControlCadence;
  checkpointPlan?: {
    periods?: number;
    unit?: string;
    endTarget?: number | null;
    baseline?: number | null;
    checkpoints: GtmControlCheckpoint[];
  };
  currentPeriod?: GtmControlCheckpoint | null;
  recovery?: {
    shortfall?: number | null;
    requiredPerPeriod?: number | null;
    recommendation?: string;
    choices?: string[];
  } | null;
  lastDiagnosis?: {
    bottleneck_stage?: string;
    summary?: string;
    primary_constraint?: string;
    reallocation?: string;
    funnel?: Array<{
      stage: string;
      target?: number | null;
      actual?: number | null;
      finding?: string;
    }>;
  } | null;
  interventions?: GtmControlIntervention[];
  humanApprovalRequired?: string[];
  autoAdjustAllowed?: string[];
}

export type GtmAgentRosterStatus =
  | 'dormant'
  | 'activated'
  | 'high_priority'
  | 'deprioritized'
  | 'retired'
  | string;

export interface GtmAgentRosterEntry {
  id: string;
  name: string;
  role?: string;
  tier?: 'core' | 'specialist' | string;
  capabilities?: string[];
  status: GtmAgentRosterStatus;
  score?: number;
  reason?: string;
  mission?: string;
  metric?: string | null;
  target?: string | null;
  review_date?: string | null;
  specialist_label?: string | null;
  retiredBy?: string | null;
}

export interface GtmAgentRoster {
  version?: number;
  updatedAt?: string;
  source?: 'llm' | 'rules' | string;
  rationale?: string | null;
  archetypeKey?: string;
  business_archetype?: string | null;
  north_star_metric?: string | null;
  quantified_target?: string | null;
  bottleneck_stage?: string | null;
  agents: GtmAgentRosterEntry[];
  highPriority?: string[];
  activated?: string[];
  dormant?: string[];
  humanApprovalRequired?: string[];
  autoAdjustAllowed?: string[];
}

export interface GtmStrategyDocument {
  title: string;
  executiveSummary: string;
  generatedAt?: string;
  moduleId?: string;
  moduleName?: string;
  sections: GtmStrategyDocSection[];
  /** Slack-style channels for sidebar (excludes executive summary) */
  channels?: Array<{ id: string; title: string; channel: string; order: number }>;
  /** North-star target + per-section measurable sub-goals */
  goalAlignment?: GtmStrategyGoalAlignment;
  nextSteps: string[];
  model?: string | null;
  skill_alignment?: {
    task_key: string;
    skills: string[];
    playbook_loaded: boolean;
  };
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
  | 'goals'
  // Legacy ids retained for older modules; wizard no longer interviews these
  | 'market'
  | 'problem'
  | 'positioning'
  | 'distribution'
  | 'content'
  | 'leads'
  | 'sales';

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
  module?: { type?: GtmModuleType; name?: string; one_sentence_desc?: string };
  offer?: Record<string, string>;
  market?: Record<string, string>;
  audience?: Record<string, string>;
  problem?: Record<string, string>;
  positioning?: Record<string, string>;
  distribution?: Record<string, string>;
  content?: Record<string, string>;
  leads?: Record<string, string>;
  sales?: Record<string, string>;
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
    strategyContext?: Record<string, unknown>;
  };
}
