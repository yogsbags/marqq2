export type Company = {
  id: string
  companyName: string
  websiteUrl: string | null
  createdAt: string
  updatedAt: string
  profile?: unknown
}

export type ArtifactRecord = {
  type: string
  updatedAt: string
  data: unknown
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {})
    }
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = (json as any)?.error || `Request failed: ${res.status}`
    throw new Error(message)
  }
  return json as T
}

