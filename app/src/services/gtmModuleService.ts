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
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/execute-options`);
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
  };
}> {
  const res = await fetch(`/api/gtm/modules/${moduleId}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId }),
  });
  return readJsonOrThrow(res);
}
