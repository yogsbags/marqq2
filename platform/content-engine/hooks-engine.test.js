import test from "node:test";
import assert from "node:assert/strict";

import { HooksEngine, evaluateSignalAgainstBaseline } from "./hooks-engine.js";

function createSupabaseStub(initialRows) {
  const rows = initialRows.map((row) => ({ ...row }));

  function buildQuery(mode) {
    const state = {
      mode,
      updates: null,
      filters: [],
      orderBy: null,
    };

    const query = {
      select() {
        return query;
      },
      update(updates) {
        state.mode = "update";
        state.updates = updates;
        return query;
      },
      eq(column, value) {
        state.filters.push({ column, value });
        return query;
      },
      order(column, options = {}) {
        state.orderBy = { column, ascending: options.ascending !== false };
        return query;
      },
      async maybeSingle() {
        const result = run();
        return { data: result[0] || null, error: null };
      },
      then(resolve, reject) {
        return Promise.resolve(run()).then(
          (data) => resolve({ data, error: null }),
          reject
        );
      },
    };

    function matches(row) {
      return state.filters.every((filter) => row[filter.column] === filter.value);
    }

    function run() {
      if (state.mode === "select") {
        const data = rows.filter(matches);
        if (state.orderBy) {
          data.sort((left, right) => {
            const leftValue = left[state.orderBy.column];
            const rightValue = right[state.orderBy.column];
            if (leftValue === rightValue) return 0;
            return state.orderBy.ascending
              ? leftValue < rightValue
                ? -1
                : 1
              : leftValue > rightValue
                ? -1
                : 1;
          });
        }
        return data.map((row) => ({ ...row }));
      }

      if (state.mode === "update") {
        const updatedRows = [];
        for (const row of rows) {
          if (!matches(row)) continue;
          Object.assign(row, state.updates);
          updatedRows.push({ ...row });
        }
        return updatedRows;
      }

      return [];
    }

    return query;
  }

  return {
    rows,
    from(tableName) {
      assert.equal(tableName, "agent_signals");
      return buildQuery("select");
    },
  };
}

test("pct_drop_gte matches when current value drops by threshold or more", () => {
  const result = evaluateSignalAgainstBaseline({
    currentValue: 80,
    baselineValue: 100,
    operator: "pct_drop_gte",
    threshold: 20,
  });

  assert.equal(result.matched, true);
  assert.equal(result.currentValue, 80);
  assert.equal(result.baselineValue, 100);
  assert.equal(result.deltaPct, -20);
});

test("evaluation does not match when baseline is missing", () => {
  const result = evaluateSignalAgainstBaseline({
    currentValue: 80,
    baselineValue: null,
    operator: "pct_drop_gte",
    threshold: 20,
  });

  assert.equal(result.matched, false);
  assert.equal(result.reason, "missing_baseline_value");
});

test("tick moves matching signals to triggered and preserves dispatch order", async () => {
  const supabase = createSupabaseStub([
    {
      id: "signal-1",
      company_id: "acme",
      signal_type: "traffic_drop_20pct_7d",
      payload: { current_value: 80 },
      status: "pending",
      observed_at: "2026-03-10T12:00:00.000Z",
    },
  ]);

  const dispatched = [];
  const engine = new HooksEngine({
    supabase,
    hooksConfig: {
      heartbeat_seconds: 60,
      signal_triggers: [
        {
          id: "traffic-drop-20pct-7d",
          enabled: true,
          signal_type: "traffic_drop_20pct_7d",
          condition: {
            metric_path: "metrics.value.website_sessions_7d",
            baseline_path: "baselines.value.website_sessions_7d",
            operator: "pct_drop_gte",
            threshold: 20,
          },
          dispatch: [
            { agent: "tara", task_type: "traffic_drop_recovery_plan", order: 1 },
            { agent: "kiran", task_type: "traffic_drop_social_response", order: 2 },
          ],
        },
      ],
    },
    mkgReader: async () => ({
      metrics: { value: { website_sessions_7d: 80 } },
      baselines: { value: { website_sessions_7d: 100 } },
    }),
    dispatchHookRun: async (batch) => {
      dispatched.push(batch);
    },
  });

  const result = await engine.tick();

  assert.equal(result.length, 1);
  assert.equal(dispatched.length, 1);
  assert.deepEqual(
    dispatched[0].dispatch.map((entry) => entry.agent),
    ["tara", "kiran"]
  );
  assert.equal(dispatched[0].triggered_by, "signal");
  assert.equal(dispatched[0].trigger_id, "signal-1");
  assert.equal(supabase.rows[0].status, "triggered");
});

test("tick ignores signals whose diff does not meet the threshold", async () => {
  const supabase = createSupabaseStub([
    {
      id: "signal-2",
      company_id: "acme",
      signal_type: "traffic_drop_20pct_7d",
      payload: { current_value: 95 },
      status: "pending",
      observed_at: "2026-03-10T12:00:00.000Z",
    },
  ]);

  const engine = new HooksEngine({
    supabase,
    hooksConfig: {
      heartbeat_seconds: 60,
      signal_triggers: [
        {
          id: "traffic-drop-20pct-7d",
          enabled: true,
          signal_type: "traffic_drop_20pct_7d",
          condition: {
            metric_path: "metrics.value.website_sessions_7d",
            baseline_path: "baselines.value.website_sessions_7d",
            operator: "pct_drop_gte",
            threshold: 20,
          },
          dispatch: [{ agent: "tara", task_type: "traffic_drop_recovery_plan", order: 1 }],
        },
      ],
    },
    mkgReader: async () => ({
      metrics: { value: { website_sessions_7d: 95 } },
      baselines: { value: { website_sessions_7d: 100 } },
    }),
  });

  const result = await engine.tick();

  assert.equal(result.length, 0);
  assert.equal(supabase.rows[0].status, "ignored");
});
