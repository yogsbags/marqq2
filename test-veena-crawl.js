import {
  buildContextPatchFromCrawl,
  crawlCompanyForMKG,
} from "./platform/content-engine/veena-crawler.js";

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

const url = process.argv[2] || "https://example.com";
let exitCode = 0;

console.log(`\n[test-veena-crawl] Testing crawl for: ${url}\n`);

try {
  console.log("Step 1: crawlCompanyForMKG...");
  const result = await crawlCompanyForMKG(url);

  const missing = TOP_LEVEL_FIELDS.filter((field) => !(field in result));
  if (missing.length > 0) {
    console.error(`FAIL: missing fields: ${missing.join(", ")}`);
    exitCode = 1;
  } else {
    console.log("PASS: all 12 fields present\n");
  }

  for (const field of TOP_LEVEL_FIELDS) {
    const entry = result[field] || {};
    const filled = entry.value !== null && entry.value !== undefined;
    console.log(
      `  ${field}: confidence=${entry.confidence ?? "??"} value=${filled ? "populated" : "null"}`
    );
  }

  console.log("\nStep 2: buildContextPatchFromCrawl...");
  const patch = buildContextPatchFromCrawl(result, "veena", "test-run-001");
  const patchMissing = TOP_LEVEL_FIELDS.filter((field) => !(field in patch));
  const envelopeFields = [
    "value",
    "confidence",
    "last_verified",
    "source_agent",
    "expires_at",
  ];
  const badEnvelopes = TOP_LEVEL_FIELDS.filter(
    (field) => !envelopeFields.every((name) => name in (patch[field] || {}))
  );

  if (patchMissing.length > 0) {
    console.error(`FAIL: patch missing fields: ${patchMissing.join(", ")}`);
    exitCode = 1;
  } else if (badEnvelopes.length > 0) {
    console.error(`FAIL: patch envelope missing keys for: ${badEnvelopes.join(", ")}`);
    exitCode = 1;
  } else {
    console.log("PASS: context_patch covers all 12 fields with correct envelope format");
  }
} catch (error) {
  console.error("FAIL: unexpected error:", error.message);
  exitCode = 1;
}

console.log(`\n[test-veena-crawl] Result: ${exitCode === 0 ? "PASS" : "FAIL"}`);
process.exit(exitCode);
