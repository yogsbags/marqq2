/**
 * Automation Registry
 * ===================
 * Catalog of 5 named automations that agents can declare in their contract JSON.
 * Dispatcher executes them after each agent run via executeAutomationTriggers.
 *
 * Usage in contract:
 *   "automation_triggers": [
 *     { "automation_id": "fetch_meta_ads", "params": { "ad_account_id": "...", "date_range": "last_7d" }, "reason": "..." }
 *   ]
 */

export const REGISTRY = [
  {
    id: "fetch_meta_ads",
    name: "Fetch Meta Ads Performance",
    description: "Pulls ad performance metrics from Meta Ads Graph API via n8n webhook",
    category: "paid_media",
    trigger_type: "n8n_webhook",
    endpoint: "N8N_META_ADS_WEBHOOK",
    params_schema: {
      ad_account_id: "Meta Ads account ID",
      date_range: "e.g. last_7d or last_30d",
    },
    returns: "{ campaigns: [...], adsets: [...], ads: [...] }",
    which_agents_can_invoke: ["isha", "maya", "arjun"],
    requires_credential: "facebookads",
  },
  {
    id: "competitor_ad_library",
    name: "Competitor Ad Library Scrape",
    description: "Scrapes Meta Ad Library public API for competitor creatives",
    category: "competitive_intel",
    trigger_type: "direct_api",
    endpoint: "META_AD_LIBRARY_API_URL",
    params_schema: {
      search_term: "Brand or keyword to search",
      country: "Two-letter country code e.g. IN",
    },
    returns: "{ ads: [{ id, page_name, creative, impressions_range }] }",
    which_agents_can_invoke: ["*"],
    requires_credential: null,
  },
  {
    id: "creative_fatigue_check",
    name: "Creative Fatigue Check",
    description: "Analyses CTR trend and frequency to identify fatigued ad creatives",
    category: "creative_analysis",
    trigger_type: "internal_fn",
    endpoint: null,
    params_schema: {
      ads: "Array of { name, impressions, clicks, frequency }",
    },
    returns: "{ fatigued_ads: [...], healthy_ads: [...], summary: string }",
    which_agents_can_invoke: ["isha", "maya"],
    requires_credential: null,
  },
  {
    id: "google_ads_fetch",
    name: "Fetch Google Ads Performance",
    description: "Pulls Google Ads campaign and keyword performance via n8n webhook",
    category: "paid_media",
    trigger_type: "n8n_webhook",
    endpoint: "N8N_GOOGLE_ADS_WEBHOOK",
    params_schema: {
      customer_id: "Google Ads customer ID",
      date_range: "e.g. last_7d",
    },
    returns: "{ campaigns: [...], keywords: [...], search_terms: [...] }",
    which_agents_can_invoke: ["isha", "arjun"],
    requires_credential: "googleads",
  },
  {
    id: "apollo_lead_enrich",
    name: "Apollo Lead Enrichment",
    description: "Enriches lead records with firmographic and contact data via Apollo API",
    category: "lead_data",
    trigger_type: "direct_api",
    endpoint: "APOLLO_API_URL",
    params_schema: {
      email: "Lead email address",
      domain: "Company domain (optional)",
    },
    returns: "{ person: {...}, organization: {...} }",
    which_agents_can_invoke: ["neel", "sam", "kiran"],
    requires_credential: null,
  },
];

/**
 * creativeFatigueCheck — internal function
 * Flags ads with high frequency AND CTR below 80% of average.
 */
function creativeFatigueCheck(params) {
  const ads = Array.isArray(params?.ads) ? params.ads : [];

  const adsWithCtr = ads.map((ad) => ({
    ...ad,
    ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
  }));

  const averageCtr =
    adsWithCtr.length > 0
      ? adsWithCtr.reduce((sum, ad) => sum + ad.ctr, 0) / adsWithCtr.length
      : 0;

  const fatigued_ads = [];
  const healthy_ads = [];

  for (const ad of adsWithCtr) {
    if (ad.frequency > 3 && ad.ctr < averageCtr * 0.8) {
      fatigued_ads.push(ad);
    } else {
      healthy_ads.push(ad);
    }
  }

  const total = adsWithCtr.length;
  let summary;
  if (fatigued_ads.length === 0) {
    summary = `All ${total} ads appear healthy.`;
  } else {
    const names = fatigued_ads.map((a) => a.name).join(", ");
    summary = `${fatigued_ads.length} of ${total} ads are fatigued (high frequency, low CTR). Recommend refreshing: ${names}.`;
  }

  return { fatigued_ads, healthy_ads, summary };
}

/**
 * getComposioToken — fetches an active OAuth access token from Composio for a given company + app.
 * Returns null if COMPOSIO_API_KEY is unset, appName is null, or no active account is found.
 */
async function getComposioToken(companyId, appName) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !appName) return null;
  try {
    let fetchFn;
    try { fetchFn = fetch; } catch { fetchFn = null; }
    if (!fetchFn) {
      const mod = await import('node-fetch').catch(() => null);
      fetchFn = mod?.default || null;
    }
    if (!fetchFn) return null;
    const res = await fetchFn(
      `https://backend.composio.dev/api/v1/connectedAccounts?entityId=${encodeURIComponent(companyId)}&appName=${appName}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await res.json();
    const acct = data.items?.find(a => a.status === 'ACTIVE');
    return acct?.connectionConfig?.access_token || acct?.accessToken || null;
  } catch { return null; }
}

/**
 * executeAutomation — dispatches a single trigger to the appropriate handler.
 */
async function executeAutomation(trigger, companyId, runId) {
  const entry = REGISTRY.find((r) => r.id === trigger.automation_id);
  if (!entry) {
    return { status: "error", error: "unknown automation_id: " + trigger.automation_id };
  }

  if (entry.trigger_type === "internal_fn") {
    const result = creativeFatigueCheck(trigger.params || {});
    return { status: "completed", ...result };
  }

  // n8n_webhook or direct_api
  const url = process.env[entry.endpoint];
  if (!url) {
    return {
      status: "simulated",
      message: "endpoint not configured: " + entry.endpoint,
      automation_id: entry.id,
    };
  }

  // Resolve OAuth access token from Composio if this automation requires one
  let access_token = null;
  if (entry.requires_credential) {
    access_token = await getComposioToken(companyId, entry.requires_credential);
    if (!access_token) {
      console.warn(`[automations] No active Composio token for ${entry.requires_credential} (company: ${companyId}) — proceeding without access_token`);
    }
  }

  try {
    const { default: fetch } = await import("node-fetch").catch(() => {
      throw new Error("node-fetch not available");
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automation_id: entry.id,
        params: trigger.params || {},
        company_id: companyId,
        run_id: runId,
        ...(access_token ? { access_token } : {}),
      }),
    });

    const data = await response.json();
    return data;
  } catch (err) {
    // Fallback: if fetch not available or network error, return simulated
    if (err.message === "node-fetch not available") {
      return {
        status: "simulated",
        message: "endpoint not configured: " + entry.endpoint,
        automation_id: entry.id,
      };
    }
    return { status: "error", error: err.message, automation_id: entry.id };
  }
}

/**
 * executeAutomationTriggers — exported dispatcher.
 * Called after each agent run to process any automation_triggers declared in the contract.
 *
 * @param {object} contract - parsed agent contract
 * @param {string} companyId - company identifier
 * @returns {Promise<Array>} - array of { automation_id, status, result }
 */
export async function executeAutomationTriggers(contract, companyId) {
  if (!contract.automation_triggers || contract.automation_triggers.length === 0) {
    return [];
  }

  let client = null;
  try {
    const mod = await import("../supabase.js");
    client = mod.supabaseAdmin || mod.supabase || null;
  } catch {
    client = null;
  }

  const collected = [];

  for (const trigger of contract.automation_triggers) {
    const result = await executeAutomation(trigger, companyId, contract.run_id);
    const status = result.status || "completed";

    if (client) {
      try {
        const registryEntry = REGISTRY.find((r) => r.id === trigger.automation_id);
        await client.from("automation_runs").insert({
          company_id: companyId || null,
          run_id: contract.run_id || null,
          automation_id: trigger.automation_id,
          automation_name: registryEntry?.name || trigger.automation_id,
          status,
          params: trigger.params || {},
          result,
          triggered_by_agent: contract.agent || null,
        });
      } catch (insertErr) {
        console.warn("[automations] Failed to insert automation_run row:", insertErr.message);
      }
    }

    collected.push({ automation_id: trigger.automation_id, status, result });
  }

  return collected;
}

/**
 * computeNextRun — parses a cron string (5 fields) and returns the next Date.
 *
 * Supported patterns:
 *   "*/15 * * * *"   → next 15-min boundary from now
 *   "0 */N * * *"    → next N-hour boundary (N can be 1-23)
 *   "0 H * * *"      → today at H:00 UTC if not past, else tomorrow at H:00
 *   "0 H * * DOW"    → next occurrence of day-of-week (0=Sun) at H:00 UTC
 *   anything else    → now + 1 hour
 */
export function computeNextRun(cronStr) {
  const now = new Date();
  const parts = (cronStr || '').trim().split(/\s+/);
  if (parts.length !== 5) {
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  const [min, hour, dom, month, dow] = parts;

  // */15 * * * * — every 15 minutes
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const interval = parseInt(min.slice(2), 10);
    if (!isNaN(interval) && interval > 0) {
      const ms = interval * 60 * 1000;
      const next = new Date(Math.ceil(now.getTime() / ms) * ms);
      return next;
    }
  }

  // 0 */N * * * — every N hours
  if (min === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(hour.slice(2), 10);
    if (!isNaN(n) && n > 0) {
      const ms = n * 60 * 60 * 1000;
      const next = new Date(Math.ceil(now.getTime() / ms) * ms);
      return next;
    }
  }

  // 0 H * * DOW — weekly on specific day-of-week at H:00 UTC
  if (min === '0' && /^\d+$/.test(hour) && dom === '*' && month === '*' && /^\d+$/.test(dow)) {
    const h = parseInt(hour, 10);
    const targetDow = parseInt(dow, 10);
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0));
    let daysAhead = (targetDow - now.getUTCDay() + 7) % 7;
    if (daysAhead === 0 && candidate <= now) {
      daysAhead = 7;
    }
    candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
    return candidate;
  }

  // 0 H * * * — daily at H:00 UTC
  if (min === '0' && /^\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
    const h = parseInt(hour, 10);
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0));
    if (candidate <= now) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  }

  // fallback — now + 1 hour
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * upsertScheduledAutomation — creates or updates a scheduled automation row in Supabase.
 *
 * @param {string} companyId
 * @param {{ automation_id: string, cron: string, params?: object }} trigger
 * @param {string|null} agentName
 * @param {object} supabaseClient - Supabase JS client
 * @returns {Promise<{ automation_id: string, cron: string, next_run: string }>}
 */
export async function upsertScheduledAutomation(companyId, trigger, agentName, supabaseClient) {
  const entry = REGISTRY.find((r) => r.id === trigger.automation_id);
  if (!entry) {
    throw new Error('Unknown automation_id: ' + trigger.automation_id);
  }

  const nextRun = computeNextRun(trigger.cron);

  const { error } = await supabaseClient
    .from('scheduled_automations')
    .upsert(
      {
        company_id: companyId,
        automation_id: trigger.automation_id,
        cron: trigger.cron,
        params: trigger.params || {},
        active: true,
        next_run: nextRun.toISOString(),
        updated_at: new Date().toISOString(),
        created_by_agent: agentName || null,
      },
      { onConflict: 'company_id,automation_id' }
    );

  if (error) {
    throw new Error('upsertScheduledAutomation DB error: ' + error.message);
  }

  return {
    automation_id: trigger.automation_id,
    cron: trigger.cron,
    next_run: nextRun.toISOString(),
  };
}

/**
 * runDueScheduledAutomations — queries scheduled_automations for rows with next_run <= now,
 * executes each, updates last_run and next_run, and logs to automation_runs.
 *
 * @param {object} supabaseClient - Supabase JS client
 * @returns {Promise<Array<{ company_id, automation_id, status }>>}
 */
export async function runDueScheduledAutomations(supabaseClient) {
  const now = new Date().toISOString();

  const { data: dueRows, error: queryErr } = await supabaseClient
    .from('scheduled_automations')
    .select('*')
    .eq('active', true)
    .lte('next_run', now);

  if (queryErr) {
    throw new Error('runDueScheduledAutomations query error: ' + queryErr.message);
  }

  const collected = [];

  for (const row of dueRows || []) {
    const runId = Math.random().toString(36).slice(2);
    let result;

    try {
      result = await executeAutomation(
        { automation_id: row.automation_id, params: row.params },
        row.company_id,
        runId
      );
    } catch (execErr) {
      result = { status: 'error', error: execErr.message };
    }

    const nextRun = computeNextRun(row.cron);
    const runNow = new Date().toISOString();

    // Update the scheduled row
    await supabaseClient
      .from('scheduled_automations')
      .update({
        last_run: runNow,
        next_run: nextRun.toISOString(),
        updated_at: runNow,
      })
      .eq('id', row.id);

    // Log to automation_runs
    const registryEntry = REGISTRY.find((r) => r.id === row.automation_id);
    try {
      await supabaseClient.from('automation_runs').insert({
        company_id: row.company_id || null,
        run_id: runId,
        automation_id: row.automation_id,
        automation_name: registryEntry?.name || row.automation_id,
        status: result.status || 'completed',
        params: row.params || {},
        result,
        triggered_by_agent: row.created_by_agent || null,
      });
    } catch (insertErr) {
      console.warn('[automations] Failed to insert automation_run for scheduled row:', insertErr.message);
    }

    collected.push({
      company_id: row.company_id,
      automation_id: row.automation_id,
      status: result.status || 'completed',
    });
  }

  return collected;
}
