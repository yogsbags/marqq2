import test from "node:test";
import assert from "node:assert/strict";

import {
  captureLogger,
  createClientFactorySpy,
} from "./data-pipeline-test-helpers.js";
import {
  createSupabaseClients,
  getPipelineWriteClient,
  pipelineSupabase,
  supabase,
  supabaseAdmin,
} from "./supabase.js";

test("createSupabaseClients preserves anon client and creates admin client when service key is present", () => {
  const { calls, factory } = createClientFactorySpy();
  const { logger, entries } = captureLogger();

  const clients = createSupabaseClients({
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    },
    logger,
    clientFactory: factory,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].key, "anon-key");
  assert.equal(calls[1].key, "service-key");
  assert.ok(clients.supabase);
  assert.ok(clients.supabaseAdmin);
  assert.equal(clients.pipelineSupabase, clients.supabaseAdmin);
  assert.notEqual(clients.pipelineSupabase, clients.supabase);
  assert.deepEqual(entries.warn, []);
});

test("createSupabaseClients logs a clear non-fatal warning when service key is absent", () => {
  const { calls, factory } = createClientFactorySpy();
  const { logger, entries } = captureLogger();

  const clients = createSupabaseClients({
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key",
    },
    logger,
    clientFactory: factory,
  });

  assert.equal(calls.length, 1);
  assert.ok(clients.supabase);
  assert.equal(clients.supabaseAdmin, null);
  assert.equal(clients.pipelineSupabase, null);
  assert.equal(entries.warn.length, 1);
  assert.match(entries.warn[0], /service-role client unavailable/i);
});

test("pipeline write surface resolves to the admin client export instead of anon", () => {
  assert.equal(getPipelineWriteClient(), pipelineSupabase);
  assert.equal(pipelineSupabase, supabaseAdmin);

  if (supabase && supabaseAdmin) {
    assert.notEqual(pipelineSupabase, supabase);
  }
});
