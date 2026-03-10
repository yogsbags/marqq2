function normalizeItems(items, connectorType, competitorName) {
  return (items || []).map((item, index) => ({
    id: item.id || `${connectorType}-${competitorName}-${index + 1}`,
    title: item.title || `${competitorName} ${connectorType} item ${index + 1}`,
    published_at: item.published_at || item.publishedAt || new Date().toISOString(),
    url: item.url || null,
    connector_type: connectorType,
    score: item.score ?? 0.6,
  }));
}

function createConnector(connectorType) {
  return async ({ competitorName, since, fixtures = {} }) => {
    const items = fixtures[connectorType] || [];
    return normalizeItems(
      items.filter((item) => {
        const publishedAt = item.published_at || item.publishedAt;
        return !since || !publishedAt || publishedAt > since;
      }),
      connectorType,
      competitorName,
    );
  };
}

export const connectorsByType = {
  youtube: createConnector("youtube"),
  twitter: createConnector("twitter"),
  rss: createConnector("rss"),
  press_release: createConnector("press_release"),
};

export async function fetchConnectorItems({
  connectorType,
  companyId,
  competitorName,
  since,
  fixtures,
}) {
  const connector = connectorsByType[connectorType];
  if (!connector) {
    throw new Error(`[mkg-watchdog-connectors] unknown connector type: ${connectorType}`);
  }

  return connector({
    companyId,
    competitorName,
    since,
    fixtures,
  });
}
