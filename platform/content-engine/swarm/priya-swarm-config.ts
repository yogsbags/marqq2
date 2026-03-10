import { MKGService } from "../mkg-service.js";
import { fetchConnectorItems } from "./mkg-watchdog-connectors.ts";

const DEFAULT_COMPETITOR_NAMES = [
  "HubSpot",
  "Semrush",
  "Ahrefs",
  "Clay",
  "Apollo",
  "Clearbit",
  "Similarweb",
  "Mutiny",
  "6sense",
  "Demandbase",
];

const DEFAULT_CONNECTOR_MATRIX = [
  ["rss", "press_release"],
  ["rss", "youtube"],
  ["rss", "twitter"],
  ["rss", "youtube"],
  ["twitter", "rss"],
  ["press_release", "rss"],
  ["rss", "youtube"],
  ["twitter", "rss"],
  ["press_release", "rss"],
  ["rss", "twitter"],
];

export const competitorWatchdogs = DEFAULT_COMPETITOR_NAMES.map((competitorName, index) => ({
  competitorName,
  connectors: DEFAULT_CONNECTOR_MATRIX[index],
  lastCheckedPath: `competitors.value.${index}.last_checked`,
}));

export function buildPriyaWatchdogs(mkg = {}) {
  const existingCompetitors = Array.isArray(mkg?.competitors?.value) ? mkg.competitors.value : [];

  return competitorWatchdogs.map((watchdog, index) => {
    const existing = existingCompetitors[index] || {};
    return {
      ...watchdog,
      competitor: {
        name: existing.name || watchdog.competitorName,
        preferred_connectors: existing.preferred_connectors || watchdog.connectors,
        last_checked: existing.last_checked || null,
        watchdog_history: existing.watchdog_history || {},
        fixtures: existing.fixtures || {},
      },
    };
  });
}

export async function updateCompetitorLastChecked({
  companyId,
  competitorName,
  lastChecked,
  mkgReader = MKGService.read.bind(MKGService),
  mkgWriter = MKGService.patch.bind(MKGService),
}) {
  const mkg = await mkgReader(companyId);
  const existing = Array.isArray(mkg?.competitors?.value) ? mkg.competitors.value : [];
  const updated = existing.map((competitor) => {
    if (competitor.name !== competitorName) {
      return competitor;
    }

    return {
      ...competitor,
      last_checked: lastChecked,
      watchdog_history: {
        ...(competitor.watchdog_history || {}),
        last_checked: lastChecked,
      },
    };
  });

  return mkgWriter(companyId, {
    competitors: {
      ...(mkg?.competitors || {}),
      value: updated,
      source_agent: "priya",
      last_verified: new Date().toISOString(),
    },
  });
}

export function resolvePreferredConnectors(competitor) {
  return Array.isArray(competitor?.preferred_connectors) && competitor.preferred_connectors.length > 0
    ? competitor.preferred_connectors
    : ["rss"];
}

export async function createWatchdogConnectorFetch({
  companyId,
  competitor,
  connectorType,
}) {
  return fetchConnectorItems({
    companyId,
    competitorName: competitor.name,
    connectorType,
    since: competitor.last_checked || competitor.watchdog_history?.last_checked || null,
    fixtures: competitor.fixtures || {},
  });
}
