export function buildSnapshotFixture(overrides = {}) {
  return {
    id: 'snapshot-1',
    company_id: 'acme',
    connector_name: 'meta_ads',
    source_type: 'meta_ads',
    snapshot_date: '2026-03-10',
    grain: 'day',
    currency: 'USD',
    payload: {
      spend: 1200,
      revenue: 4200,
      impressions: 50000,
      clicks: 1200,
      leads: 42,
      conversions: 12,
    },
    triggered_by_run_id: 'run-123',
    ingested_at: '2026-03-10T00:00:00.000Z',
    created_at: '2026-03-10T00:00:00.000Z',
    ...overrides,
  }
}

export function buildKpiFixture(overrides = {}) {
  return {
    id: 'kpi-1',
    company_id: 'acme',
    metric_date: '2026-03-10',
    source_scope: 'blended',
    currency: 'USD',
    spend: 1200,
    revenue: 4200,
    impressions: 50000,
    clicks: 1200,
    leads: 42,
    conversions: 12,
    ctr: 0.024,
    cpc: 1,
    cpl: 28.57,
    cpa: 100,
    roas: 3.5,
    source_snapshot_ids: ['snapshot-1'],
    ingested_at: '2026-03-10T00:00:00.000Z',
    created_at: '2026-03-10T00:00:00.000Z',
    updated_at: '2026-03-10T00:00:00.000Z',
    ...overrides,
  }
}

export function buildAnomalyFixture(overrides = {}) {
  return {
    id: 'anomaly-1',
    company_id: 'acme',
    metric_date: '2026-03-10',
    metric_name: 'roas',
    severity: 'high',
    current_value: 1.2,
    baseline_7d: 2.8,
    baseline_30d: 3.1,
    delta_vs_7d_pct: -57.14,
    delta_vs_30d_pct: -61.29,
    direction: 'down',
    status: 'open',
    narration_required: true,
    narration_run_id: null,
    narrated_at: null,
    context: {},
    created_at: '2026-03-10T00:00:00.000Z',
    updated_at: '2026-03-10T00:00:00.000Z',
    ...overrides,
  }
}

export function createFixedClock(iso = '2026-03-10T00:00:00.000Z') {
  const fixedTime = new Date(iso).getTime()
  return {
    now: () => fixedTime,
    toDate: () => new Date(fixedTime),
    iso: () => new Date(fixedTime).toISOString(),
  }
}

export function createSupabaseClientDouble(label = 'anon') {
  const operations = []

  const builder = {
    select(value = '*') {
      operations.push({ type: 'select', value })
      return this
    },
    insert(value) {
      operations.push({ type: 'insert', value })
      return Promise.resolve({ data: value, error: null })
    },
    upsert(value, options) {
      operations.push({ type: 'upsert', value, options })
      return Promise.resolve({ data: value, error: null })
    },
    update(value) {
      operations.push({ type: 'update', value })
      return this
    },
    delete() {
      operations.push({ type: 'delete' })
      return this
    },
    eq(column, value) {
      operations.push({ type: 'eq', column, value })
      return this
    },
    in(column, value) {
      operations.push({ type: 'in', column, value })
      return this
    },
    order(column, options) {
      operations.push({ type: 'order', column, options })
      return Promise.resolve({ data: [], error: null })
    },
    single() {
      operations.push({ type: 'single' })
      return Promise.resolve({ data: null, error: null })
    },
  }

  return {
    label,
    operations,
    from(table) {
      operations.push({ type: 'from', table })
      return builder
    },
  }
}

export function createClientFactorySpy() {
  const calls = []

  return {
    calls,
    factory(url, key) {
      const client = createSupabaseClientDouble(key === 'service-key' ? 'admin' : 'anon')
      calls.push({ url, key, client })
      return client
    },
  }
}

export function captureLogger() {
  const entries = { warn: [], error: [], log: [] }

  return {
    entries,
    logger: {
      warn(message) {
        entries.warn.push(String(message))
      },
      error(message) {
        entries.error.push(String(message))
      },
      log(message) {
        entries.log.push(String(message))
      },
    },
  }
}
