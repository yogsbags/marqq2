export type Phase = 'welcome' | 'form' | 'review' | 'gtmAutoReview' | 'activate' | 'done';

export type PrimaryGoal = 'leads' | 'conversion' | 'content' | 'market' | 'budget';

export interface BrandDnaKnowledgeFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  category?: string;
  url?: string;
}

export interface BrandDnaVoiceNote {
  id: string;
  transcript: string;
  audioFileId?: string;
  audioUrl?: string;
  transcriptFileId?: string;
  createdAt: string;
}

export interface BrandDna {
  companyName: string;
  websiteUrl: string;
  logoUrl: string | null;
  businessSummary: string;
  fonts: string[];
  colors: string[];
  brandTagline: string;
  toneOfVoice: string;
  brandVoice?: {
    tone: string[];
    dosList: string[];
    dontsList: string[];
  };
  /** Optional uploads from onboarding Brand DNA review */
  knowledgeBaseFiles?: BrandDnaKnowledgeFile[];
  /** Voice briefs recorded during Brand DNA step */
  voiceNotes?: BrandDnaVoiceNote[];
}

export interface FormData {
  company: string;
  websiteUrl: string;   // moved here from post-onboarding checklist
  industry: string;
  icp: string;
  competitors: string;
  connectedIntegrations: string; // comma-separated list of connected integration ids
  monthlyMarketingBudget: string;
  primaryGoal: string;  // one of PrimaryGoal — drives guided path
  goals: string;        // optional free-text "anything else?"
  kpis: string;         // optional: primary KPIs to track e.g. CAC, LTV, ROAS
  channels: string;     // optional: active marketing channels
  [key: string]: string;
}

export interface AgentData {
  id: string;
  name: string;
  role: string;
  specialty: string;
  task: string;
  color: string;
  glow: string;
}

export interface StepField {
  key: keyof FormData;
  label: string;
  placeholder: string;
  type: 'input' | 'textarea' | 'goal-picker' | 'choice' | 'integrations';
  options?: string[];
  optional?: boolean;
}

export interface OnboardingStep {
  num: string;
  label: string;
  question: string;
  sub: string;
  fields: StepField[];
}
