/**
 * Canonical Composio HubSpot tools — curated from
 * https://docs.composio.dev/toolkits/hubspot
 *
 * Prefer current list/search/note/task slugs over legacy engagement aliases.
 */

export const HUBSPOT_TOOL_SLUGS = [
  // Contacts — list / search / CRUD
  'HUBSPOT_LIST_CONTACTS',
  'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA',
  'HUBSPOT_SEARCH_CRM_OBJECTS_BY_CRITERIA',
  'HUBSPOT_GET_CONTACT_IDS',
  'HUBSPOT_CREATE_CONTACT',
  'HUBSPOT_CREATE_CONTACTS',
  'HUBSPOT_UPDATE_CONTACT',
  'HUBSPOT_UPDATE_CONTACTS',

  // Notes / tasks / deals (sales follow-up)
  'HUBSPOT_CREATE_NOTE',
  'HUBSPOT_CREATE_TASK',
  'HUBSPOT_CREATE_DEAL',
  'HUBSPOT_GET_DEALS',
  'HUBSPOT_SEARCH_DEALS',
  'HUBSPOT_LIST_CONTACT_TASKS',

  // Associations
  'HUBSPOT_CREATE_OBJECT_ASSOCIATION',

  // Legacy aliases still used by some agents
  'HUBSPOT_SEARCH_CRM_OBJECTS',
  'HUBSPOT_GET_CONTACTS',
  'HUBSPOT_CREATE_ENGAGEMENT',
  'HUBSPOT_CREATE_WORKFLOW',
]

/** Tools used when pushing a scored voicebot call into HubSpot */
export const HUBSPOT_VOICEBOT_PUSH_TOOLS = [
  'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA',
  'HUBSPOT_SEARCH_CRM_OBJECTS_BY_CRITERIA',
  'HUBSPOT_CREATE_CONTACT',
  'HUBSPOT_CREATE_NOTE',
  'HUBSPOT_CREATE_TASK',
]

/** Tools used to pull the CRM table */
export const HUBSPOT_CRM_LIST_TOOLS = [
  'HUBSPOT_LIST_CONTACTS',
  'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA',
]
