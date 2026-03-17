export const COMPANY_INTEL_LIST_UPDATED_EVENT = 'marqq-company-intel-list-updated'

export function notifyCompanyIntelListUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COMPANY_INTEL_LIST_UPDATED_EVENT))
}
