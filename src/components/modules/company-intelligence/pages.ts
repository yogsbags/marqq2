export type CompanyIntelPageId =
  | 'overview'
  | 'competitor_intelligence'
  | 'opportunities'
  | 'client_profiling'
  | 'partner_profiling'
  | 'icps'
  | 'social_calendar'
  | 'marketing_strategy'
  | 'content_strategy'
  | 'channel_strategy'
  | 'lookalike_audiences'
  | 'lead_magnets'

export const COMPANY_INTEL_PAGES: Array<{ id: CompanyIntelPageId; title: string; artifactType?: string }> = [
  { id: 'overview', title: 'Company Overview' },
  { id: 'competitor_intelligence', title: 'Competitor Intelligence', artifactType: 'competitor_intelligence' },
  { id: 'opportunities', title: 'Opportunities', artifactType: 'opportunities' },
  { id: 'client_profiling', title: 'Client Profiling Analytics', artifactType: 'client_profiling' },
  { id: 'partner_profiling', title: 'Partner Profiling Analytics', artifactType: 'partner_profiling' },
  { id: 'icps', title: 'ICPs (Cohorts/Segments)', artifactType: 'icps' },
  { id: 'social_calendar', title: 'Social Media Content Calendar', artifactType: 'social_calendar' },
  { id: 'marketing_strategy', title: 'Marketing Strategy', artifactType: 'marketing_strategy' },
  { id: 'content_strategy', title: 'Content Strategy', artifactType: 'content_strategy' },
  { id: 'channel_strategy', title: 'Channel Strategy', artifactType: 'channel_strategy' },
  { id: 'lookalike_audiences', title: 'Lookalike Audiences', artifactType: 'lookalike_audiences' },
  { id: 'lead_magnets', title: 'Lead Magnets', artifactType: 'lead_magnets' }
]

export function getCompanyIntelPageTitle(id: CompanyIntelPageId): string {
  return COMPANY_INTEL_PAGES.find((p) => p.id === id)?.title || 'Company Intelligence'
}
