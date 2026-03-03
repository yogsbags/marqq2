export type Phase = 'welcome' | 'form' | 'activate' | 'done';

export interface FormData {
  company: string;
  industry: string;
  icp: string;
  competitors: string;
  campaigns: string;
  keywords: string;
  goals: string;
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
  type: 'input' | 'textarea';
}

export interface OnboardingStep {
  num: string;
  label: string;
  question: string;
  sub: string;
  fields: StepField[];
}
