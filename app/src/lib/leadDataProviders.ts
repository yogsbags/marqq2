/**
 * B2B lead-data connectors — any one can satisfy prospecting requirements.
 * Backend: platform/content-engine/lead-data-providers.js
 */
export const LEAD_DATA_PROVIDER_IDS = ['apollo', 'hunter'] as const

export type LeadDataProviderId = (typeof LEAD_DATA_PROVIDER_IDS)[number]

export const LEAD_DATA_PROVIDER_LABELS: Record<LeadDataProviderId, string> = {
  apollo: 'Apollo',
  hunter: 'Hunter',
}

export function isLeadDataProvider(id: string): id is LeadDataProviderId {
  return (LEAD_DATA_PROVIDER_IDS as readonly string[]).includes(id)
}

export function hasLeadDataProvider(connectedIds: string[]): boolean {
  return LEAD_DATA_PROVIDER_IDS.some((id) => connectedIds.includes(id))
}

export function connectedLeadProviders(connectedIds: string[]): LeadDataProviderId[] {
  return LEAD_DATA_PROVIDER_IDS.filter((id) => connectedIds.includes(id))
}
