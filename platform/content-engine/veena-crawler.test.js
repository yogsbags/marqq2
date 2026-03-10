import test from "node:test";
import assert from "node:assert/strict";

const TOP_LEVEL_FIELDS = [
  "positioning",
  "icp",
  "competitors",
  "offers",
  "messaging",
  "channels",
  "funnel",
  "metrics",
  "baselines",
  "content_pillars",
  "campaigns",
  "insights",
];

async function loadModule(overrides = {}) {
  globalThis.__VEENA_TEST_OVERRIDES__ = overrides;
  const mod = await import(`./veena-crawler.js?test=${Date.now()}-${Math.random()}`);
  return mod;
}

test("extractPageSignals captures title, meta, headings, and CTA labels", async () => {
  const { extractPageSignals } = await loadModule({
    groqClient: { chat: { completions: { create: async () => ({}) } } },
  });

  const signals = extractPageSignals(`
    <html>
      <head>
        <title>Acme Cloud CRM</title>
        <meta property="og:site_name" content="Acme" />
        <meta property="og:description" content="Revenue workflows for B2B teams" />
        <meta name="description" content="Pipeline automation for lean revenue teams" />
      </head>
      <body>
        <h1>Close more deals without admin work</h1>
        <h2>Automate follow-ups</h2>
        <h2>Track every buying signal</h2>
        <h2>Align sales and marketing</h2>
        <button>Book Demo</button>
        <a href="/pricing">Start Free Trial</a>
      </body>
    </html>
  `);

  assert.match(signals, /Title: Acme Cloud CRM/);
  assert.match(signals, /og:site_name: Acme/);
  assert.match(signals, /og:description: Revenue workflows for B2B teams/);
  assert.match(signals, /meta description: Pipeline automation for lean revenue teams/);
  assert.match(signals, /H1: Close more deals without admin work/);
  assert.match(signals, /H2s: Automate follow-ups; Track every buying signal; Align sales and marketing/);
  assert.match(signals, /CTAs: Book Demo; Start Free Trial/);
});

test("buildContextPatchFromCrawl guarantees 12 MKG envelopes with metadata", async () => {
  const { buildContextPatchFromCrawl } = await loadModule({
    groqClient: { chat: { completions: { create: async () => ({}) } } },
  });

  const patch = buildContextPatchFromCrawl(
    {
      positioning: {
        value: { statement: "CRM for B2B teams", unique_value: "Fast setup" },
        confidence: 0.82,
      },
    },
    "veena",
    "run-123"
  );

  assert.equal(Object.keys(patch).length, 12);
  for (const field of TOP_LEVEL_FIELDS) {
    assert.deepEqual(Object.keys(patch[field]).sort(), [
      "confidence",
      "expires_at",
      "last_verified",
      "source_agent",
      "value",
    ]);
  }
  assert.equal(patch.positioning.source_agent, "veena");
  assert.equal(typeof patch.positioning.last_verified, "string");
  assert.equal(typeof patch.positioning.expires_at, "string");
  assert.equal(patch.metrics.value, null);
  assert.equal(patch.metrics.confidence, 0);
  assert.equal(patch.metrics.last_verified, null);
  assert.equal(patch.metrics.expires_at, null);
});

test("initializeMKGTemplate patches all 12 fields with null envelopes", async () => {
  const calls = [];
  const { initializeMKGTemplate } = await loadModule({
    groqClient: { chat: { completions: { create: async () => ({}) } } },
    mkgService: {
      patch: async (companyId, patch) => {
        calls.push({ companyId, patch });
        return { company_id: companyId, ...patch };
      },
    },
  });

  await initializeMKGTemplate("acme");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].companyId, "acme");
  assert.equal(Object.keys(calls[0].patch).length, 12);
  for (const field of TOP_LEVEL_FIELDS) {
    assert.deepEqual(calls[0].patch[field], {
      value: null,
      confidence: 0,
      last_verified: null,
      source_agent: "veena",
      expires_at: null,
    });
  }
});

test("crawlCompanyForMKG falls back to llama and returns normalized 12-field output", async () => {
  let callCount = 0;
  const { crawlCompanyForMKG } = await loadModule({
    fetchImpl: async () => ({
      ok: true,
      text: async () => "<title>Acme</title><h1>Acme CRM</h1><button>Book Demo</button>",
    }),
    groqClient: {
      chat: {
        completions: {
          create: async (payload) => {
            callCount += 1;
            if (payload.model === "groq/compound") {
              throw new Error("compound unavailable");
            }
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      positioning: {
                        value: { statement: "Acme CRM", unique_value: "Fast onboarding" },
                        confidence: 0.8,
                      },
                      insights: {
                        value: { summary: "Clear CRM value prop", gaps: ["No pricing"] },
                        confidence: 0.62,
                      },
                    }),
                  },
                },
              ],
            };
          },
        },
      },
    },
  });

  const result = await crawlCompanyForMKG("https://example.com");

  assert.equal(callCount, 2);
  assert.equal(Object.keys(result).length, 12);
  assert.deepEqual(Object.keys(result), TOP_LEVEL_FIELDS);
  assert.equal(result.positioning.confidence, 0.8);
  assert.equal(result.insights.confidence, 0.62);
  assert.deepEqual(result.metrics, { value: null, confidence: 0 });
  assert.deepEqual(result.campaigns, { value: null, confidence: 0 });
});
