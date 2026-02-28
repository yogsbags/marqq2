/**
 * Torqq AI — Content Engine Backend
 * ===================================
 * Express server on port BACKEND_PORT (default 3008).
 * Spawned by server.js; all /api/* traffic is proxied here from port 3007.
 *
 * Routes:
 *   GET  /health                       — health check
 *   GET  /api/agents/status            — read heartbeat/status.json
 *   GET  /api/agents/:name/memory      — read agent MEMORY.md
 *   POST /api/agents/context           — write client context markdown
 *   POST /api/agents/:name/run         — SSE streaming Groq call (SOUL.md as system prompt)
 */

import express from 'express'
import Groq from 'groq-sdk'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { enqueueGeneration, startWorker } from './queue.js'
import { supabase, loadCompanyWithArtifacts, saveArtifact, saveCompany } from './supabase.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Paths relative to this file (platform/content-engine/)
const CREWAI_DIR = join(__dirname, '..', 'crewai')
const HEARTBEAT_PATH = join(CREWAI_DIR, 'heartbeat', 'status.json')
const AGENTS_DIR = join(CREWAI_DIR, 'agents')
const CTX_DIR = join(CREWAI_DIR, 'client_context')

const VALID_AGENTS = new Set(['zara', 'maya', 'riya', 'arjun', 'dev', 'priya'])
const PORT = Number(process.env.BACKEND_PORT || 3008)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

const app = express()
app.use(express.json())

// ── Health ─────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'content-engine' })
})

// ── GET /api/agents/status ─────────────────────────────────────────────────────
// Returns heartbeat/status.json (updated by Python scheduler after each run).
// Falls back to default idle state if file does not exist yet.

app.get('/api/agents/status', async (_req, res) => {
  try {
    const raw = await readFile(HEARTBEAT_PATH, 'utf-8')
    res.json(JSON.parse(raw))
  } catch {
    res.json({
      updated_at: null,
      agents: {
        zara: { status: 'idle', last_run: null, duration_ms: null },
        maya: { status: 'idle', last_run: null, duration_ms: null },
        riya: { status: 'idle', last_run: null, duration_ms: null },
        arjun: { status: 'idle', last_run: null, duration_ms: null },
        dev: { status: 'idle', last_run: null, duration_ms: null },
        priya: { status: 'idle', last_run: null, duration_ms: null },
      }
    })
  }
})

// ── POST /api/agents/context ───────────────────────────────────────────────────
// Saves client business context to client_context/{userId}.md.
// IMPORTANT: must be declared BEFORE /:name routes to avoid 'context' being
// matched as the :name param.

app.post('/api/agents/context', async (req, res) => {
  const { userId, company, industry, icp, competitors, campaigns, keywords, goals } = req.body

  if (!userId || !company) {
    return res.status(400).json({ error: 'userId and company are required' })
  }

  const content = `# Client Context

**Company**: ${company}
**Industry**: ${industry || '—'}
**Target ICP**: ${icp || '—'}
**Top Competitors**: ${competitors || '—'}
**Current Campaigns**: ${campaigns || '—'}
**Active Keywords**: ${keywords || '—'}
**Key Goals this Quarter**: ${goals || '—'}
`

  try {
    await mkdir(CTX_DIR, { recursive: true })
    await writeFile(join(CTX_DIR, `${userId}.md`), content, 'utf-8')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/agents/:name/memory ───────────────────────────────────────────────
// Returns the agent's MEMORY.md content.

app.get('/api/agents/:name/memory', async (req, res) => {
  const { name } = req.params

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: 'Unknown agent' })
  }

  const memoryPath = join(AGENTS_DIR, name, 'memory', 'MEMORY.md')
  try {
    const content = await readFile(memoryPath, 'utf-8')
    res.json({ agent: name, memory: content })
  } catch {
    res.json({ agent: name, memory: '_No memory yet._' })
  }
})

// ── POST /api/agents/:name/run ─────────────────────────────────────────────────
// Runs an agent interactively (triggered by slash commands in ChatHome).
// Loads SOUL.md + MEMORY.md + skills/*.md as system prompt, calls Groq, streams SSE.
// Response format: data: {"text":"..."}\n\n ... data: [DONE]\n\n

app.post('/api/agents/:name/run', async (req, res) => {
  const { name } = req.params
  const { query } = req.body

  if (!VALID_AGENTS.has(name)) {
    return res.status(404).json({ error: 'Unknown agent' })
  }
  if (!query?.trim()) {
    return res.status(400).json({ error: 'query is required' })
  }

  // Load SOUL.md
  const soulPath = join(AGENTS_DIR, name, 'SOUL.md')
  let systemPrompt = `You are ${name}, a marketing AI agent.`
  try {
    systemPrompt = await readFile(soulPath, 'utf-8')
  } catch { /* use default */ }

  // Load MEMORY.md
  const memoryPath = join(AGENTS_DIR, name, 'memory', 'MEMORY.md')
  let memory = ''
  try {
    memory = await readFile(memoryPath, 'utf-8')
  } catch { /* no memory yet */ }

  // Load skills from agents/{name}/skills/*.md
  let skillsBlock = ''
  try {
    const skillsDir = join(AGENTS_DIR, name, 'skills')
    const files = (await readdir(skillsDir)).filter(f => f.endsWith('.md')).sort()
    if (files.length) {
      const contents = await Promise.all(files.map(f => readFile(join(skillsDir, f), 'utf-8')))
      skillsBlock = '\n\n## Your Available Skills\nYou have the following specialist workflows available. When a user request matches a skill, follow that skill\'s process exactly.\n\n' +
        contents.map((c, i) => `### ${files[i].replace('.md', '')}\n${c}`).join('\n\n---\n\n')
    }
  } catch { /* no skills dir */ }

  const fullSystem = [
    systemPrompt,
    memory ? `\n\n## Your Recent Memory\n${memory}` : '',
    skillsBlock,
  ].join('')

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: fullSystem },
        { role: 'user', content: query }
      ],
      stream: true,
      max_tokens: 4096,
      temperature: 0.4,
    })

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? ''
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
    res.end()
  }
})

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[content-engine] Listening on port ${PORT}`)
  startWorker()
})

// ── GET /api/integrations ──────────────────────────────────────────────────
// Stub endpoint — returns empty connector list until integrations are built.
app.get('/api/integrations', (_req, res) => {
  res.json({ connectors: [] })
})

// ── POST /api/integrations/connect & /disconnect ──────────────────────────
app.post('/api/integrations/connect', (_req, res) => {
  res.status(501).json({ error: 'Integrations not yet implemented' })
})
app.post('/api/integrations/disconnect', (_req, res) => {
  res.status(501).json({ error: 'Integrations not yet implemented' })
})

// ── Company Intelligence CRUD ──────────────────────────────────────────────
// In-memory store fallback

const _companies = new Map() // id → { company, artifacts }
let _cidCounter = 1

app.get('/api/company-intel/companies', (_req, res) => {
  res.json({ companies: Array.from(_companies.values()).map(e => e.company) })
})

app.post('/api/company-intel/companies', async (req, res) => {
  const { companyName, websiteUrl } = req.body || {}
  if (!companyName?.trim()) return res.status(400).json({ error: 'companyName is required' })

  // Use UUID for easier DB sync
  import('crypto').then(async ({ randomUUID }) => {
    const id = randomUUID()
    const now = new Date().toISOString()
    const company = { id, companyName: companyName.trim(), websiteUrl: websiteUrl?.trim() || null, createdAt: now, updatedAt: now, profile: {} }

    // Save locally
    _companies.set(id, { company, artifacts: {} })

    // Save to Supabase
    await saveCompany(company)

    res.json({ company })
  })
})

app.get('/api/company-intel/companies/:id', async (req, res) => {
  let entry = _companies.get(req.params.id)
  if (!entry) {
    // Try to load from Supabase if not in memory
    const dbData = await loadCompanyWithArtifacts(req.params.id)
    if (dbData) {
      _companies.set(req.params.id, dbData)
      entry = dbData
    } else {
      return res.status(404).json({ error: 'Company not found' })
    }
  }
  res.json({ company: entry.company, artifacts: entry.artifacts })
})

app.patch('/api/company-intel/companies/:id/artifacts', async (req, res) => {
  const entry = _companies.get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Company not found' })
  const { artifactType, data } = req.body || {}
  if (!artifactType) return res.status(400).json({ error: 'artifactType required' })
  const now = new Date().toISOString()
  const artifact = { type: artifactType, updatedAt: now, data }

  entry.artifacts[artifactType] = artifact
  entry.company.updatedAt = now

  await saveArtifact(req.params.id, artifact)

  res.json({ artifact: entry.artifacts[artifactType] })
})

app.post('/api/company-intel/companies/:id/generate', async (req, res) => {
  const entry = _companies.get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Company not found' })

  const { type, inputs } = req.body || {}
  if (!type) return res.status(400).json({ error: 'type is required' })

  try {
    const CREWAI_URL = process.env.CREWAI_URL || 'http://localhost:8002'

    // First try CrewAI
    let crewData = null;
    try {
      const resp = await fetch(`${CREWAI_URL}/api/crewai/company-intel/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: entry.company.companyName,
          company_url: entry.company.websiteUrl,
          artifact_type: type,
          inputs,
          company_profile: entry.company.profile
        })
      });
      if (resp.ok) {
        crewData = await resp.json();
      } else {
        console.warn(`CrewAI responded with ${resp.status}`);
      }
    } catch (err) {
      console.warn('CrewAI backend not reachable, falling back to basic Groq generation...', err.message);
    }

    const now = new Date().toISOString()

    if (crewData && crewData.status !== 'failed') {
      entry.artifacts[type] = { type, updatedAt: crewData.generated_at || now, data: crewData.data }
    } else {
      // --- FALLBACK LOGIC USING DIRECT GROQ ---
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: `You are an expert marketing strategist. Generate ${type} for ${entry.company.companyName}. Output JSON only.` },
          { role: 'user', content: `Inputs: ${JSON.stringify(inputs)}` }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
      const fallbackData = JSON.parse(completion.choices[0]?.message?.content?.trim() || '{}')
      entry.artifacts[type] = { type, updatedAt: now, data: fallbackData }
    }

    entry.company.updatedAt = now
    await saveArtifact(req.params.id, entry.artifacts[type])
    await saveCompany(entry.company)
    res.json({ artifact: entry.artifacts[type] })
  } catch (err) {
    console.error('Generation error:', err)
    res.status(500).json({ error: String(err) })
  }
})

const TYPES_TO_GENERATE = [
  'competitor_intelligence', 'website_audit', 'opportunities',
  'icps', 'client_profiling', 'partner_profiling',
  'social_calendar', 'marketing_strategy', 'positioning_messaging',
  'sales_enablement', 'content_strategy', 'channel_strategy'
];

app.post('/api/company-intel/companies/:id/generate-all', (req, res) => {
  const entry = _companies.get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Company not found' })

  const { inputs } = req.body || {}
  const total = TYPES_TO_GENERATE.length;

  // Enqueue each artifact type for background processing
  (async () => {
    for (const type of TYPES_TO_GENERATE) {
      if (entry.artifacts[type]) continue; // Skip already generated artifacts
      try {
        await enqueueGeneration(entry.company, type, inputs);
      } catch (err) {
        console.warn(`[Generate-all] failed to enqueue ${type}`, err.message)
      }
    }
  })();

  res.status(202).json({ status: 'started', total, companyId: req.params.id })
})

app.get('/api/company-intel/companies/:id/generate-all/status', (req, res) => {
  const entry = _companies.get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Company not found' })
  const completed = Object.keys(entry.artifacts).length
  const total = TYPES_TO_GENERATE.length;
  res.json({ status: completed >= total ? 'completed' : 'running', completed, total })
})

// ── Budget Optimization ────────────────────────────────────────────────────

const BUDGET_CONNECTORS = [
  { id: 'meta', name: 'Meta Ads', status: 'not_configured', connected: false, notes: 'Connect via OAuth in Integrations' },
  { id: 'google_ads', name: 'Google Ads', status: 'not_configured', connected: false, notes: 'Connect via OAuth in Integrations' },
  { id: 'ga4', name: 'Google Analytics 4', status: 'not_configured', connected: false, notes: 'Connect via OAuth in Integrations' },
  { id: 'tiktok', name: 'TikTok Ads', status: 'not_configured', connected: false, notes: 'Connect via OAuth in Integrations' },
  { id: 'shopify', name: 'Shopify', status: 'not_configured', connected: false, notes: 'Connect via API key in Integrations' },
  { id: 'snowflake', name: 'Snowflake', status: 'not_configured', connected: false, notes: 'Connect via credentials in Integrations' },
  { id: 'manual', name: 'Manual / CSV Upload', status: 'available', connected: true, notes: 'Paste or upload your data below' },
]

app.get('/api/budget-optimization/connectors', (_req, res) => {
  res.json({
    philosophy: 'GoMarble-style: real-time connectors + AI insights (no permanent data storage).',
    rateLimit: '10 analyses per hour per user',
    cacheTtlSeconds: 300,
    connectors: BUDGET_CONNECTORS,
  })
})

// Rate-limit map: userId → last call timestamp
const _budgetRateLimit = new Map()

app.post('/api/budget-optimization/analyze', async (req, res) => {
  const { userId = 'anonymous', question, timeframe = 'last_30_days', currency = 'INR', dataText = '' } = req.body || {}
  if (!question?.trim()) return res.status(400).json({ error: 'question is required' })

  // Simple per-user cooldown: 6 seconds
  const now = Date.now()
  if (now - (_budgetRateLimit.get(userId) || 0) < 6000) {
    return res.status(429).json({ error: 'Rate limit: wait a few seconds before analyzing again' })
  }
  _budgetRateLimit.set(userId, now)

  const systemPrompt = `You are a senior marketing analyst specialising in budget optimisation and ROAS analysis.
Timeframe: ${timeframe}. Currency: ${currency}.
Respond with ONLY a valid JSON object — no markdown, no code fences — matching this exact schema:
{
  "kpiSnapshot": { "spend": number|null, "revenue": number|null, "roas": number|null, "cpa": number|null, "cpc": number|null, "ctr": number|null, "cvr": number|null },
  "diagnosis": "string",
  "recommendations": ["string"],
  "budgetPlan": [{ "channel": "string", "currentBudget": number|null, "recommendedBudget": number|null, "rationale": "string" }],
  "creativeInsights": { "topPerformers": ["string"], "fatigue": ["string"], "toTest": ["string"] },
  "reportHtml": "string",
  "assumptions": ["string"],
  "precisionScorecard": { "threshold": 70, "overall": number, "productionReady": boolean, "dimensions": [{ "key": "string", "score": number, "reason": "string" }] }
}`

  const userMsg = `Question: ${question}\n\nData:\n${dataText.trim() || '(No data provided — use general best-practice defaults)'}`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    })
    const text = completion.choices[0]?.message?.content?.trim() || '{}'
    let parsed = {}
    try { parsed = JSON.parse(text) } catch { /* use empty */ }
    res.json({ timeframe, currency, ...parsed })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Upload endpoints require multipart parsing (multer not installed).
// Return 501 so the UI shows a clear "not implemented" rather than a 404 HTML error page.
app.post('/api/budget-optimization/upload', (_req, res) => {
  res.status(501).json({ error: 'File upload requires multer — run: npm install multer' })
})
app.post('/api/budget-optimization/calibration/upload', (_req, res) => {
  res.status(501).json({ error: 'File upload requires multer — run: npm install multer' })
})

// ── Performance Scorecard ──────────────────────────────────────────────────

app.get('/api/performance-scorecard/connectors', (_req, res) => {
  res.json({
    philosophy: 'Upload or paste your marketing data; AI generates a full performance scorecard.',
    rateLimit: '10 scorecards per hour per user',
    cacheTtlSeconds: 300,
    connectors: [
      { id: 'meta', name: 'Meta Ads', status: 'not_configured' },
      { id: 'google_ads', name: 'Google Ads', status: 'not_configured' },
      { id: 'ga4', name: 'Google Analytics 4', status: 'not_configured' },
      { id: 'tiktok', name: 'TikTok Ads', status: 'not_configured' },
      { id: 'manual', name: 'Manual / CSV Upload', status: 'available' },
    ],
  })
})

app.post('/api/performance-scorecard/generate', async (req, res) => {
  const { userId = 'anonymous', timeframe = 'last_30_days', currency = 'INR', businessContext = '', dataText = '' } = req.body || {}

  const now = Date.now()
  if (now - (_budgetRateLimit.get(`ps_${userId}`) || 0) < 6000) {
    return res.status(429).json({ error: 'Rate limit: wait a few seconds before generating again' })
  }
  _budgetRateLimit.set(`ps_${userId}`, now)

  const systemPrompt = `You are a senior marketing performance analyst.
Timeframe: ${timeframe}. Currency: ${currency}.
Respond with ONLY valid JSON (no markdown, no fences) matching this schema:
{
  "overallScore": number,
  "grade": "A+"|"A"|"B+"|"B"|"C"|"D"|"F",
  "kpis": { "spend": number|null, "revenue": number|null, "roas": number|null, "leads": number|null, "customers": number|null, "cpa": number|null, "cpc": number|null, "ctr": number|null, "cvr": number|null },
  "channelBreakdown": [{ "channel": "string", "score": number, "spend": number|null, "roas": number|null, "trend": "up"|"down"|"flat", "recommendation": "string" }],
  "benchmarks": [{ "metric": "string", "yours": number|null, "industry": number|null, "delta": number|null, "status": "above"|"below"|"at" }],
  "forecast": [{ "month": "string", "predictedSpend": number|null, "predictedRevenue": number|null, "predictedRoas": number|null }],
  "insights": ["string"],
  "reportHtml": "string",
  "assumptions": ["string"]
}`

  const userMsg = `Business context: ${businessContext || '(none provided)'}\n\nMarketing data:\n${dataText?.trim() || '(No data — use general best-practice defaults)'}`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 2500,
      temperature: 0.3,
    })
    const text = completion.choices[0]?.message?.content?.trim() || '{}'
    let parsed = {}
    try { parsed = JSON.parse(text) } catch { /* use empty */ }
    res.json({ timeframe, currency, ...parsed })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─── Workspace routes ─────────────────────────────────────────────────────

// GET /api/workspaces?userId=xxx — list workspaces for a user (auto-provisions default)
app.get('/api/workspaces', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    let { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspace:workspaces(id, name, website_url, created_at)')
      .eq('user_id', userId);
    if (error) throw error;

    // Auto-provision default workspace for new users
    if (!data || data.length === 0) {
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .insert({ name: 'My workspace', owner_id: userId })
        .select()
        .single();
      if (wsErr) throw wsErr;
      const { error: memErr } = await supabase
        .from('workspace_members')
        .insert({ workspace_id: ws.id, user_id: userId, role: 'owner' });
      if (memErr) throw memErr;
      return res.json({ workspaces: [{ ...ws, role: 'owner' }] });
    }

    const workspaces = data.map(row => ({ ...row.workspace, role: row.role }));
    res.json({ workspaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces — create workspace + add owner as member
app.post('/api/workspaces', async (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name) return res.status(400).json({ error: 'userId and name required' });
  try {
    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ name, owner_id: userId })
      .select()
      .single();
    if (wsErr) throw wsErr;
    const { error: memErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: ws.id, user_id: userId, role: 'owner' });
    if (memErr) throw memErr;
    res.json({ workspace: { ...ws, role: 'owner' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workspaces/:id — update name or website_url
app.patch('/api/workspaces/:id', async (req, res) => {
  const { id } = req.params;
  const { name, website_url, userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (website_url !== undefined) updates.website_url = website_url;
    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ workspace: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspaces/:id/members — list members
app.get('/api/workspaces/:id/members', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, joined_at, user_id')
      .eq('workspace_id', id);
    if (error) throw error;
    // Fetch user details separately since auth.users join may be restricted
    const members = (data || []).map(row => ({
      id: row.user_id,
      email: row.user_id, // placeholder — will show user_id until auth join available
      name: 'Member',
      role: row.role,
      joined_at: row.joined_at,
    }));
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/:id/invite — create pending invite
app.post('/api/workspaces/:id/invite', async (req, res) => {
  const { id } = req.params;
  const { email, invitedBy } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { data, error } = await supabase
      .from('workspace_invites')
      .insert({ workspace_id: id, email, invited_by: invitedBy })
      .select()
      .single();
    if (error) throw error;
    // TODO: send invite email with data.token
    console.log(`[invite] ${email} invited to workspace ${id} — token: ${data.token}`);
    res.json({ invite: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workspaces/:id/members/:userId — remove member (cannot remove owner)
app.delete('/api/workspaces/:id/members/:userId', async (req, res) => {
  const { id, userId } = req.params;
  try {
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .neq('role', 'owner');
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
