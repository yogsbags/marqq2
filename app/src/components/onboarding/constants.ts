import { AgentData, OnboardingStep } from './types';

export const AGENTS: AgentData[] = [
  { id: 'zara', name: 'Zara', role: 'CMO', specialty: 'Campaign Strategy', task: 'Synthesising morning brief', color: '#FF6521', glow: 'rgba(255,101,33,0.4)' },
  { id: 'maya', name: 'Maya', role: 'SEO', specialty: 'Search Intelligence', task: 'Loading keyword database', color: '#22D3EE', glow: 'rgba(34,211,238,0.4)' },
  { id: 'riya', name: 'Riya', role: 'Content', specialty: 'Editorial Pipeline', task: 'Building content calendar', color: '#A78BFA', glow: 'rgba(167,139,250,0.4)' },
  { id: 'arjun', name: 'Arjun', role: 'Leads', specialty: 'B2B Prospecting', task: 'Scanning ICP signals', color: '#4ADE80', glow: 'rgba(74,222,128,0.4)' },
  { id: 'dev', name: 'Dev', role: 'Campaigns', specialty: 'Paid Media ROI', task: 'Reviewing spend data', color: '#FCD34D', glow: 'rgba(252,211,77,0.4)' },
  { id: 'priya', name: 'Priya', role: 'Intel', specialty: 'Competitive Watch', task: 'Tracking competitor moves', color: '#FB7185', glow: 'rgba(251,113,133,0.4)' },
];

export const STEPS: OnboardingStep[] = [
  {
    num: '01', label: 'Identity',
    question: 'Tell us about\nyour company.',
    sub: 'Your agents read this before every run — it shapes every brief, lead, and campaign they produce.',
    fields: [
      { key: 'company', label: 'Company Name', placeholder: 'e.g. PL Capital', type: 'input' },
      { key: 'industry', label: 'Industry / Niche', placeholder: 'e.g. WealthTech, India', type: 'input' },
    ],
  },
  {
    num: '02', label: 'Audience',
    question: 'Who are you\nselling to?',
    sub: 'Your ICP shapes every brief Riya writes and every prospect Arjun surfaces each morning.',
    fields: [
      { key: 'icp', label: 'Ideal Customer Profile', placeholder: 'e.g. HNI investors, 35–55, Tier 1 cities, ₹10L+ portfolio', type: 'input' },
    ],
  },
  {
    num: '03', label: 'Landscape',
    question: 'Who are you\nup against?',
    sub: 'Priya watches these every morning. Dev benchmarks your campaigns against them every Monday.',
    fields: [
      { key: 'competitors', label: 'Top Competitors', placeholder: 'e.g. Groww, Zerodha, ETMoney, PaytmMoney', type: 'input' },
      { key: 'campaigns', label: 'Active Campaigns', placeholder: 'e.g. SIP awareness (Google), HNI retargeting (LinkedIn)', type: 'input' },
    ],
  },
  {
    num: '04', label: 'Goals',
    question: 'What are you\nbuilding toward?',
    sub: 'Clear quarterly goals unlock focused, measurable output from every agent on your team.',
    fields: [
      { key: 'keywords', label: 'Priority SEO Keywords', placeholder: 'e.g. best mutual fund India, SIP calculator', type: 'input' },
      { key: 'goals', label: 'Key Goals This Quarter', placeholder: 'e.g. Grow organic traffic 40%, launch HNI advisory product', type: 'textarea' },
    ],
  },
];
