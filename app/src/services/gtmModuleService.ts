import type {
  AgentTarget,
  GtmExecuteOption,
  GtmModule,
  GtmModuleType,
  GtmSectionAnswer,
  GtmSectionQuestionsResponse,
  GtmWizardProgress,
} from '@/types/gtm';

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  if (!res.ok) {
    const message =
      typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
    throw new Error(message);
  }

  if (!isJson) throw new Error('Unexpected response (expected JSON).');
  return body as T;
}

export async function listGtmModules(params: {
  workspaceId?: string;
  userId?: string;
}): Promise<GtmModule[]> {
  const qs = new URLSearchParams();
  if (params.workspaceId) qs.set('workspaceId', params.workspaceId);
  if (params.userId) qs.set('userId', params.userId);
  const res = await fetch(`/api/gtm/modules?${qs}`);
  const data = await readJsonOrThrow<{ modules: GtmModule[] }>(res);
  return data.modules || [];
}

export async function getGtmModule(
  id: string
): Promise<{ module: GtmModule; progress: GtmWizardProgress }> {
  const res = await fetch(`/api/gtm/modules/${id}`);
  return readJsonOrThrow(res);
}

export async function createGtmModule(input: {
  workspaceId: string;
  userId: string;
  companyId?: string | null;
  name?: string;
  moduleType?: GtmModuleType;
  sourceContext?: Record<string, unknown>;
  active?: boolean;
}): Promise<{ module: GtmModule; progress: GtmWizardProgress }> {
  const res = await fetch('/api/gtm/modules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow(res);
}

export async function patchGtmModule(
  id: string,
  patch: {
    name?: string;
    moduleType?: GtmModuleType;
    active?: boolean;
    status?: string;
    autoStrategySections?: Array<{
      id: string;
      title: string;
      channel?: string;
      summary: string;
      bullets: string[];
      body: string;
      approvedAt?: string;
    }>;
  }
): Promise<{ module: GtmModule; progress: GtmWizardProgress }> {
  const res = await fetch(`/api/gtm/modules/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readJsonOrThrow(res);
}

export async function startGtmPrep(input: {
  workspaceId: string;
  userId: string;
  companyId?: string | null;
  websiteUrl?: string;
  companyName?: string;
  onboarding?: Record<string, string>;
  moduleId?: string | null;
}): Promise<{ prep_id: string; companyId?: string | null; moduleId?: string | null }> {
  const res = await fetch('/api/gtm/prep', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow(res);
}

export async function getGtmPrepStatus(workspaceId: string): Promise<{
  ready: boolean;
  module: GtmModule | null;
  progress: GtmWizardProgress | null;
}> {
  const res = await fetch(`/api/gtm/prep/status?workspaceId=${encodeURIComponent(workspaceId)}`);
  return readJsonOrThrow(res);
}

export async function loadSectionQuestions(
  sectionId: string,
  moduleId: string
): Promise<GtmSectionQuestionsResponse> {
  const res = await fetch(`/api/gtm/sections/${sectionId}/questions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moduleId }),
  });
  return readJsonOrThrow(res);
}

export async function refreshQuestionOptions(
  sectionId: string,
  moduleId: string,
  questionId: string,
  draftAnswers: Record<string, GtmSectionAnswer>
): Promise<{ questionId: string; options: Array<{ value: string; label: string; recommended?: boolean }> }> {
  const res = await fetch(`/api/gtm/sections/${sectionId}/question-options`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moduleId, questionId, draftAnswers }),
  });
  return readJsonOrThrow(res);
}

export async function saveSectionAnswers(
  sectionId: string,
  moduleId: string,
  answers: Record<string, GtmSectionAnswer>
): Promise<{ module: GtmModule; progress: GtmWizardProgress }> {
  const res = await fetch(`/api/gtm/sections/${sectionId}/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moduleId, answers }),
  });
  return readJsonOrThrow(res);
}

export async function lockGtmSection(
  sectionId: string,
  moduleId: string,
  answers: Record<string, GtmSectionAnswer>
): Promise<{
  module: GtmModule;
  progress: GtmWizardProgress;
  nextSectionId: string | null;
}> {
  const res = await fetch(`/api/gtm/sections/${sectionId}/lock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moduleId, answers }),
  });
  return readJsonOrThrow(res);
}

export async function unlockGtmSection(
  sectionId: string,
  moduleId: string
): Promise<{ module: GtmModule; progress: GtmWizardProgress }> {
  const res = await fetch(`/api/gtm/sections/${sectionId}/unlock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moduleId }),
  });
  return readJsonOrThrow(res);
}

export async function getExecuteOptions(moduleId: string): Promise<{
  options: GtmExecuteOption[];
  progress: GtmWizardProgress;
  profile: Record<string, unknown>;
  hasStrategy?: boolean;
  strategy?: import('@/types/gtm').GtmStrategyDocument | null;
  postStrategyOptions?: GtmExecuteOption[];
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/execute-options`);
  return readJsonOrThrow(res);
}

export async function getPostStrategyOptions(moduleId: string): Promise<{
  options: GtmExecuteOption[];
  strategyTitle?: string | null;
  goalAlignment?: import('@/types/gtm').GtmStrategyGoalAlignment | null;
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/post-strategy-options`);
  return readJsonOrThrow(res);
}

export async function generateInterviewStrategySection(input: {
  moduleId: string;
  interviewSectionId: string;
  strategySectionId: string;
  answers: Record<string, GtmSectionAnswer>;
  priorSections?: unknown[];
}): Promise<{
  section: import('@/lib/gtmAutoSections').GtmAutoSectionDraft;
  module: GtmModule;
  progress: GtmWizardProgress;
}> {
  const res = await fetch(`/api/gtm/modules/${input.moduleId}/strategy-sections/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      interviewSectionId: input.interviewSectionId,
      strategySectionId: input.strategySectionId,
      answers: input.answers,
      priorSections: input.priorSections,
    }),
  });
  return readJsonOrThrow(res);
}

export async function approveInterviewStrategySection(input: {
  moduleId: string;
  section: import('@/lib/gtmAutoSections').GtmAutoSectionDraft;
  interviewSectionId?: string;
  answers?: Record<string, GtmSectionAnswer>;
  lockInterview?: boolean;
}): Promise<{
  module: GtmModule;
  progress: GtmWizardProgress;
  section: import('@/lib/gtmAutoSections').GtmAutoSectionDraft;
  nextSectionId: string | null;
  allLocked: boolean;
}> {
  const res = await fetch(`/api/gtm/modules/${input.moduleId}/strategy-sections/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      section: input.section,
      interviewSectionId: input.interviewSectionId,
      answers: input.answers,
      lockInterview: Boolean(input.lockInterview),
    }),
  });
  return readJsonOrThrow(res);
}

export async function executeGtmTask(
  moduleId: string,
  taskId: string
): Promise<{
  ok: boolean;
  kind?: 'agent' | 'document';
  task: GtmExecuteOption;
  agentTarget: AgentTarget | null;
  module: GtmModule;
  strategy?: import('@/types/gtm').GtmStrategyDocument;
  markdown?: string;
  deployContext?: {
    sectionId: string;
    sectionTitle: string;
    summary: string;
    bullets: string[];
    strategyContext?: Record<string, unknown>;
  };
  postStrategyOptions?: GtmExecuteOption[];
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId }),
  });
  return readJsonOrThrow(res);
}

export async function getGtmControlLoop(moduleId: string): Promise<{
  controlLoop: import('@/types/gtm').GtmControlLoopState;
  goalSystem: import('@/types/gtm').GtmStrategyGoalAlignment;
  agentRoster?: import('@/types/gtm').GtmAgentRoster;
  module?: GtmModule;
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/control-loop`);
  return readJsonOrThrow(res);
}

export async function measureGtmControlLoop(
  moduleId: string,
  input: { period?: number; actual: number; funnelActuals?: unknown[] }
): Promise<{ controlLoop: import('@/types/gtm').GtmControlLoopState }> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/control-loop/measure`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow(res);
}

export async function diagnoseGtmControlLoop(
  moduleId: string,
  notes?: string
): Promise<{
  diagnosis: import('@/types/gtm').GtmControlLoopState['lastDiagnosis'];
  controlLoop: import('@/types/gtm').GtmControlLoopState;
  agentRoster?: import('@/types/gtm').GtmAgentRoster;
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/control-loop/diagnose`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  return readJsonOrThrow(res);
}

export async function getGtmAgentRoster(moduleId: string): Promise<{
  agentRoster: import('@/types/gtm').GtmAgentRoster;
  goalSystem?: import('@/types/gtm').GtmStrategyGoalAlignment;
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/agent-roster`);
  return readJsonOrThrow(res);
}

export async function refreshGtmAgentRoster(moduleId: string): Promise<{
  agentRoster: import('@/types/gtm').GtmAgentRoster;
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/agent-roster/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return readJsonOrThrow(res);
}

export async function proposeGtmInterventions(moduleId: string): Promise<{
  interventions: import('@/types/gtm').GtmControlIntervention[];
  controlLoop: import('@/types/gtm').GtmControlLoopState;
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/control-loop/interventions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return readJsonOrThrow(res);
}

export async function decideGtmIntervention(
  moduleId: string,
  interventionId: string,
  decision: 'approved' | 'rejected' | 'executing' | 'done'
): Promise<{ controlLoop: import('@/types/gtm').GtmControlLoopState }> {
  const res = await fetch(
    `/api/gtm/modules/${moduleId}/control-loop/interventions/${encodeURIComponent(interventionId)}/decide`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    }
  );
  return readJsonOrThrow(res);
}
