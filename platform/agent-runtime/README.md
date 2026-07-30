# Marqq JS agent runtime

This directory is the single runtime home for Marqq's JavaScript agents.

- `agents/` contains agent identities, connector manifests, skills, and agent memory.
- `skills/` contains the shared marketing skill library.
- `memory/` contains per-company MKG and artifact state.
- `client_context/`, `heartbeat/`, and `deployments/` contain runtime state used by the Node backend.

The runtime is orchestrated by `platform/content-engine/backend-server.js` and
`platform/content-engine/mcp-router.js`. There is no separate Python agent
service or external agent framework dependency.
