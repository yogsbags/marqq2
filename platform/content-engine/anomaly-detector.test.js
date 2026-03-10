import test from "node:test";
import assert from "node:assert/strict";

import { buildKpiFixture, createFixedClock } from "./data-pipeline-test-helpers.js";
import {
  detectCompanyAnomalies,
  classifySeverity,
} from "./anomaly-detector.js";

function createPipelineClient(initialKpis = []) {
  const state = {
    company_kpi_daily: initialKpis.map((row) => ({ ...row })),
    company_anomalies: [],
  };

  function createBuilder(table) {
    const query = {
      filters: [],
      order: null,
      mode: "select",
      upsertValue: null,
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        query.filters.push({ type: "eq", column, value });
        return builder;
      },
      order(column, options = {}) {
        query.order = { column, ascending: options.ascending !== false };
        return builder;
      },
      upsert(value) {
        query.mode = "upsert";
        query.upsertValue = value;
        return builder;
      },
      then(resolve, reject) {
        return Promise.resolve({ data: execute(), error: null }).then(resolve, reject);
      },
    };

    function execute() {
      if (table === "company_anomalies" && query.mode === "upsert") {
        const rows = Array.isArray(query.upsertValue) ? query.upsertValue : [query.upsertValue];
        const upserted = rows.map((row) => {
          const index = state.company_anomalies.findIndex((candidate) => (
            candidate.company_id === row.company_id
            && candidate.metric_date === row.metric_date
            && candidate.metric_name === row.metric_name
          ));

          const nextRow = index >= 0
            ? { ...state.company_anomalies[index], ...row }
            : { ...row };

          if (index >= 0) {
            state.company_anomalies[index] = nextRow;
          } else {
            state.company_anomalies.push(nextRow);
          }

          return { ...nextRow };
        });

        return upserted;
      }

      let rows = [...state[table]];

      for (const filter of query.filters) {
        if (filter.type === "eq") {
          rows = rows.filter((row) => row[filter.column] === filter.value);
        }
      }

      if (query.order) {
        const { column, ascending } = query.order;
        rows.sort((left, right) => {
          if (left[column] === right[column]) return 0;
          const direction = left[column] > right[column] ? 1 : -1;
          return ascending ? direction : -direction;
        });
      }

      return rows.map((row) => ({ ...row }));
    }

    return builder;
  }

  return {
    state,
    from(table) {
      return createBuilder(table);
    },
  };
}

function buildHistory(valuesByDay, metricName = "roas") {
  return valuesByDay.map((value, index) => buildKpiFixture({
    id: `kpi-${index + 1}`,
    metric_date: `2026-03-${String(index + 1).padStart(2, "0")}`,
    source_scope: "blended",
    [metricName]: value,
  }));
}

test("classifySeverity uses the phase threshold model", () => {
  assert.equal(classifySeverity(9.99), null);
  assert.equal(classifySeverity(10), "low");
  assert.equal(classifySeverity(20), "medium");
  assert.equal(classifySeverity(35), "high");
  assert.equal(classifySeverity(50), "critical");
});

test("detectCompanyAnomalies skips anomaly creation when baseline history is insufficient", async () => {
  const client = createPipelineClient(buildHistory([3.2, 3.1, 3.0]));

  const result = await detectCompanyAnomalies("acme", {
    client,
    clock: createFixedClock("2026-03-04T00:00:00.000Z"),
  });

  assert.equal(result.anomalies.length, 0);
  assert.equal(client.state.company_anomalies.length, 0);
});

test("detectCompanyAnomalies silently patches MKG for low and medium anomalies without narration", async () => {
  const kpis = buildHistory([3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 2.4]);
  const client = createPipelineClient(kpis);
  const patches = [];
  const groqCalls = [];

  const result = await detectCompanyAnomalies("acme", {
    client,
    clock: createFixedClock("2026-03-07T00:00:00.000Z"),
    groqClient: {
      chat: {
        completions: {
          async create(payload) {
            groqCalls.push(payload);
            return { choices: [{ message: { content: "should not run" } }] };
          },
        },
      },
    },
    mkgService: {
      async patch(companyId, patch) {
        patches.push({ companyId, patch });
      },
    },
  });

  assert.equal(result.anomalies.length, 1);
  assert.equal(result.anomalies[0].severity, "medium");
  assert.equal(result.anomalies[0].narration_required, false);
  assert.equal(client.state.company_anomalies[0].severity, "medium");
  assert.equal(groqCalls.length, 0);
  assert.equal(patches.length, 1);
  assert.deepEqual(Object.keys(patches[0].patch), ["insights"]);
  assert.equal("payload" in patches[0].patch.insights.value.anomalies[0], false);
});

test("detectCompanyAnomalies narrates only high and critical anomalies after severity assignment", async () => {
  const kpis = buildHistory([4.0, 4.1, 4.0, 4.2, 4.1, 4.0, 1.8]);
  const client = createPipelineClient(kpis);
  const calls = [];

  const result = await detectCompanyAnomalies("acme", {
    client,
    clock: createFixedClock("2026-03-07T00:00:00.000Z"),
    groqClient: {
      chat: {
        completions: {
          async create(payload) {
            calls.push(payload);
            return {
              choices: [{ message: { content: "ROAS dropped materially against baseline." } }],
            };
          },
        },
      },
    },
    mkgService: {
      async patch() {},
    },
  });

  assert.equal(result.anomalies.length, 1);
  assert.equal(result.anomalies[0].severity, "high");
  assert.equal(result.anomalies[0].narration_required, true);
  assert.equal(typeof result.anomalies[0].context.narration, "string");
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[1].content, /Severity: high/);
  assert.doesNotMatch(calls[0].messages[1].content, /payload/i);
});
