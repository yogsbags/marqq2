import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_AGENTS_DIR = process.env.TORQQ_AGENTS_DIR
  ? resolve(process.env.TORQQ_AGENTS_DIR)
  : join(__dirname, "..", "crewai", "agents");
const NOTE_MARKER = "CALIBRATION_NOTE";

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function roundNumber(value, scale = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(scale));
}

function buildAdjustmentDirection(metric, variancePct) {
  const absVariance = Math.abs(variancePct);
  if (variancePct > 0) {
    return `Raise ${metric} predictions by about ${absVariance}% until the next verification cycle.`;
  }
  if (variancePct < 0) {
    return `Lower ${metric} predictions by about ${absVariance}% until the next verification cycle.`;
  }
  return `Keep ${metric} predictions aligned with the current baseline.`;
}

function getMemoryPath(agent, options = {}) {
  const agentsDir = options.agentsDir || DEFAULT_AGENTS_DIR;
  return join(agentsDir, agent, "memory", "MEMORY.md");
}

function parseCalibrationNotes(markdown) {
  const notes = [];
  const pattern = /<!-- CALIBRATION_NOTE (\{.*?\}) -->/g;

  for (const match of markdown.matchAll(pattern)) {
    try {
      notes.push(JSON.parse(match[1]));
    } catch {
      // Ignore malformed note payloads in memory files.
    }
  }

  return notes;
}

function buildNoteText(note) {
  return [
    `Calibration note for ${note.companyId} on ${note.metric}.`,
    `Variance: ${note.variancePct}% (baseline ${note.baselineValue ?? "n/a"}, predicted ${note.predictedValue ?? "n/a"}, actual ${note.actualValue ?? "n/a"}).`,
    note.guidance,
  ].join(" ");
}

function formatNoteBlock(note) {
  return [
    "",
    `## Calibration Note - ${note.createdAt}`,
    `Company: ${note.companyId}`,
    `Metric: ${note.metric}`,
    `Variance: ${note.variancePct}%`,
    `Baseline: ${note.baselineValue ?? "n/a"}`,
    `Predicted: ${note.predictedValue ?? "n/a"}`,
    `Actual: ${note.actualValue ?? "n/a"}`,
    `Guidance: ${note.guidance}`,
    `<!-- ${NOTE_MARKER} ${JSON.stringify(note)} -->`,
    "",
  ].join("\n");
}

export async function getLatestCalibrationNote(agent, companyId, options = {}) {
  const memoryPath = getMemoryPath(agent, options);

  try {
    const markdown = await readFile(memoryPath, "utf8");
    const notes = parseCalibrationNotes(markdown)
      .filter((note) => !companyId || note.companyId === companyId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

    if (!notes.length) return null;

    const note = notes[0];
    return {
      ...note,
      text: buildNoteText(note),
      memoryPath,
    };
  } catch {
    return null;
  }
}

export async function appendCalibrationNote(input, options = {}) {
  const createdAt = input.createdAt || new Date().toISOString();
  const variancePct = roundNumber(toFiniteNumber(input.variancePct), 2);

  if (!input.agent || !input.companyId || !input.metric || variancePct === null) {
    throw new Error("appendCalibrationNote requires agent, companyId, metric, and numeric variancePct.");
  }

  const note = {
    agent: input.agent,
    companyId: input.companyId,
    metric: input.metric,
    baselineValue: roundNumber(toFiniteNumber(input.baselineValue)),
    predictedValue: roundNumber(toFiniteNumber(input.predictedValue)),
    actualValue: roundNumber(toFiniteNumber(input.actualValue)),
    variancePct,
    guidance: input.guidance || buildAdjustmentDirection(input.metric, variancePct),
    createdAt,
  };
  note.text = buildNoteText(note);

  const existing = await getLatestCalibrationNote(input.agent, input.companyId, options);
  if (
    existing
    && existing.metric === note.metric
    && roundNumber(existing.variancePct, 2) === variancePct
  ) {
    return {
      appended: false,
      deduped: true,
      note: existing,
    };
  }

  const memoryPath = getMemoryPath(input.agent, options);
  await mkdir(dirname(memoryPath), { recursive: true });

  let existingMarkdown = "";
  try {
    existingMarkdown = await readFile(memoryPath, "utf8");
  } catch {
    // The memory file is created on first calibration write.
  }

  const nextMarkdown = `${existingMarkdown.replace(/\s*$/, "")}${formatNoteBlock(note)}`;
  await writeFile(memoryPath, nextMarkdown, "utf8");

  return {
    appended: true,
    deduped: false,
    note: {
      ...note,
      memoryPath,
    },
  };
}
