/**
 * CrewAI Company Intelligence API Adapter
 * Routes Company Intelligence requests to CrewAI backend (port 8002)
 * instead of backend-server.js (port 3006)
 */

const CREWAI_BASE_URL = import.meta.env.VITE_CREWAI_URL || 'http://localhost:8002'

export interface CompanyIntelRequest {
  companyName: string
  companyUrl?: string
  artifactType: string
  inputs?: Record<string, unknown>
  companyProfile?: Record<string, unknown>
}

export interface CompanyIntelResponse {
  artifact_type: string
  status: 'completed' | 'failed'
  data?: Record<string, unknown>
  error?: string
  generated_at: string
}

/**
 * Generate Company Intelligence artifact using CrewAI backend
 *
 * Routes to appropriate specialized crew based on artifact type:
 * - Company Profile, Client/Partner Profiling → CompanyIntelligenceCrew
 * - Competitor Intel, Opportunities, Website Audit → CompetitorIntelligenceCrew
 * - Content Strategy, Social Calendar, Marketing Strategy → ContentAutomationCrew
 * - ICPs, Lookalike Audiences → LeadIntelligenceCrew
 */
export async function generateArtifactWithCrewAI(
  request: CompanyIntelRequest
): Promise<CompanyIntelResponse> {
  const response = await fetch(`${CREWAI_BASE_URL}/api/crewai/company-intel/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      company_name: request.companyName,
      company_url: request.companyUrl,
      artifact_type: request.artifactType,
      inputs: request.inputs,
      company_profile: request.companyProfile,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.detail || `Request failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Check CrewAI backend health
 */
export async function checkCrewAIHealth(): Promise<{
  status: string
  available_modules: string[]
}> {
  const response = await fetch(`${CREWAI_BASE_URL}/health`)

  if (!response.ok) {
    throw new Error('CrewAI backend is not available')
  }

  return response.json()
}

/**
 * Get available CrewAI modules
 */
export async function getAvailableModules(): Promise<{
  modules: Record<string, { name: string; status: string; agents?: Array<{ name: string; role: string }> }>
  count: number
}> {
  const response = await fetch(`${CREWAI_BASE_URL}/api/crewai/modules`)

  if (!response.ok) {
    throw new Error('Failed to fetch available modules')
  }

  return response.json()
}
