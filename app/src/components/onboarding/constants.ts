import { AgentData, OnboardingStep } from './types';

export const AGENTS: AgentData[] = [
  { id: 'veena', name: 'Veena', role: 'Company Intel',  specialty: 'Account Research',    task: 'Building company profiles',    color: '#2DD4BF', glow: 'rgba(45,212,191,0.4)' },
  { id: 'isha',  name: 'Isha',  role: 'Market Research', specialty: 'ICP & Audience',     task: 'Mapping audience segments',    color: '#F59E0B', glow: 'rgba(245,158,11,0.4)' },
  { id: 'neel',  name: 'Neel',  role: 'Strategy',        specialty: 'Positioning & GTM',  task: 'Drafting strategy brief',      color: '#60A5FA', glow: 'rgba(96,165,250,0.4)' },
  { id: 'tara',  name: 'Tara',  role: 'CRO & Offers',    specialty: 'Conversion Design',  task: 'Auditing offer friction',      color: '#C084FC', glow: 'rgba(192,132,252,0.4)' },
  { id: 'sam',   name: 'Sam',   role: 'Copy',            specialty: 'Messaging & Voice',  task: 'Reviewing messaging copy',     color: '#86EFAC', glow: 'rgba(134,239,172,0.4)' },
  { id: 'kiran', name: 'Kiran', role: 'Social',          specialty: 'Content Calendar',   task: 'Building 30-day calendar',     color: '#F9A8D4', glow: 'rgba(249,168,212,0.4)' },
  { id: 'zara',  name: 'Zara',  role: 'Channels',        specialty: 'Campaign Strategy',  task: 'Synthesising morning brief',   color: '#FF6521', glow: 'rgba(255,101,33,0.4)' },
  { id: 'maya',  name: 'Maya',  role: 'SEO',             specialty: 'Search Intelligence', task: 'Loading keyword database',    color: '#22D3EE', glow: 'rgba(34,211,238,0.4)' },
  { id: 'riya',  name: 'Riya',  role: 'Content',         specialty: 'Editorial Pipeline',  task: 'Building content calendar',   color: '#A78BFA', glow: 'rgba(167,139,250,0.4)' },
  { id: 'arjun', name: 'Arjun', role: 'Leads',           specialty: 'B2B Prospecting',    task: 'Scanning ICP signals',         color: '#4ADE80', glow: 'rgba(74,222,128,0.4)' },
  { id: 'dev',   name: 'Dev',   role: 'Performance',     specialty: 'Paid Media ROI',     task: 'Reviewing spend data',         color: '#FCD34D', glow: 'rgba(252,211,77,0.4)' },
  { id: 'priya', name: 'Priya', role: 'Intel',           specialty: 'Competitive Watch',  task: 'Tracking competitor moves',    color: '#FB7185', glow: 'rgba(251,113,133,0.4)' },
];

export const STEPS: OnboardingStep[] = [
  {
    num: '01', label: 'Your Company',
    question: 'Tell us about\nyour company.',
    sub: 'Company name and website are required. As soon as you continue, Marqq starts researching your site in the background so the GTM wizard is ready.',
    fields: [
      { key: 'company',    label: 'Company Name',   placeholder: 'e.g. PL Capital',    type: 'input' },
      { key: 'websiteUrl', label: 'Website URL',     placeholder: 'e.g. plcapital.in', type: 'input' },
    ],
  },
  {
    num: '02', label: 'Your Market',
    question: 'Who are you\nselling to?',
    sub: 'Your industry and ICP shape the research, positioning, channel choices, and agents Marqq recommends.',
    fields: [
      { key: 'industry', label: 'Industry / Niche',        placeholder: 'e.g. WealthTech, India',                               type: 'input' },
      { key: 'icp',      label: 'Ideal Customer Profile',  placeholder: 'e.g. HNI investors, 35–55, Tier 1 cities, ₹10L+ portfolio', type: 'input' },
    ],
  },
  {
    num: '03', label: 'Set the outcome',
    question: 'What should Marqq\nmove first?',
    sub: 'Give the agents one measurable direction. Marqq will propose the North Star metric and lock the final definition in the GTM wizard.',
    fields: [
      { key: 'primaryGoal', label: 'Business outcome', placeholder: 'e.g. Generate qualified hospital operator opportunities', type: 'textarea' },
      { key: 'timelineTarget', label: 'Target window', placeholder: '', type: 'choice', options: ['Next 30 days', 'Next 60 days', 'Next 90 days', 'Next 2 quarters'] },
      { key: 'quantifiedTarget', label: 'Target, if known', placeholder: 'e.g. 20 qualified opportunities', type: 'input', optional: true },
      { key: 'successBaseline', label: 'Current baseline, if known', placeholder: 'e.g. 4 per month', type: 'input', optional: true },
    ],
  },
  {
    num: '04', label: 'Connect Accounts',
    question: 'Connect the data\nMarqq should use.',
    sub: 'Connect what is available now. You can add the rest later; missing data is shown explicitly in the control loop.',
    fields: [
      { key: 'connectedIntegrations', label: 'Integrations', placeholder: '', type: 'integrations', optional: true },
    ],
  },
];

/** The onboarding shell shows a recommendation, while the server roster remains authoritative. */
export function recommendedOnboardingAgentIds(formData: { industry?: string; icp?: string; primaryGoal?: string; businessModel?: string }) {
  const text = [formData.industry, formData.icp, formData.primaryGoal, formData.businessModel].join(' ').toLowerCase();
  const ids = new Set(['veena', 'isha', 'neel', 'zara', 'dev', 'priya']);
  if (/b2b|enterprise|hospital|clinic|consult|agency|saas|operator|sales|lead/.test(text)) {
    ids.add('arjun'); ids.add('sam'); ids.add('riya');
  }
  if (/consumer|d2c|nutrition|health|wellness|app|mobile|ecommerce|conversion/.test(text)) {
    ids.add('tara'); ids.add('kiran'); ids.add('maya');
  }
  if (/seo|search|organic|content/.test(text)) ids.add('maya');
  return AGENTS.filter((agent) => ids.has(agent.id)).map((agent) => agent.id);
}
