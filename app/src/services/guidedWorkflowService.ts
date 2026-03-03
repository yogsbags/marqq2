export type GuidedGoal = 'leads' | 'roi' | 'content';

export interface GuidedWorkflowRequest {
  userRequest: string;
  goal?: GuidedGoal;
  moduleHint?: string;
  mode?: 'guided' | 'advanced';
  inputs?: Record<string, unknown>;
}

export interface GuidedActionPlan {
  goal: GuidedGoal;
  what_to_do_this_week: string[];
  owner: string;
  expected_impact: string;
}

export interface GuidedWorkflowResponse {
  status: 'queued' | 'completed';
  moduleId: string;
  navigation: {
    moduleId: string;
    hash: string;
  };
  actionPlan: GuidedActionPlan;
  assistantMessage: string;
}

export async function executeGuidedWorkflow(
  payload: GuidedWorkflowRequest
): Promise<GuidedWorkflowResponse> {
  const res = await fetch('/api/workflow/execute-guided', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (json as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(error);
  }

  return json as GuidedWorkflowResponse;
}
