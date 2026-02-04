import type { GtmInterviewPlan, GtmStrategyResponse } from '@/types/gtm';

function hasErrorField(value: unknown): value is { error: unknown } {
  return !!value && typeof value === 'object' && 'error' in value;
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  if (!res.ok) {
    const message =
      typeof body === 'string'
        ? body
        : (hasErrorField(body) ? String(body.error) : `HTTP ${res.status}`);
    throw new Error(message);
  }

  if (!isJson) {
    throw new Error('Unexpected response (expected JSON).');
  }

  return body as T;
}

export async function generateGtmInterviewPlan(prompt: string): Promise<GtmInterviewPlan> {
  const res = await fetch('/api/gtm/questions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return readJsonOrThrow<GtmInterviewPlan>(res);
}

export async function generateGtmStrategy(input: {
  prompt: string;
  answers: Record<string, unknown>;
}): Promise<GtmStrategyResponse> {
  const res = await fetch('/api/gtm/strategy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<GtmStrategyResponse>(res);
}
