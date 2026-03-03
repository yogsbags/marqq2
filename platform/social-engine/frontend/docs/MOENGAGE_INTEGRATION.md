# MoEngage Integration

Server-side helpers and API routes are wired to MoEngage using environment variables. No credentials are committed to code.

## Environment Variables

Set these in Railway (or locally) before using the endpoints:

- `MOENGAGE_WORKSPACE_ID` (e.g., `ISU64VA9RNGKF9JH67AH7P9G`)
- `MOENGAGE_DATA_API_KEY` (Data API key, e.g., `dJE5umthSdBOsWAJyCJ8cyO6`)
- `MOENGAGE_REPORTING_API_KEY` (Campaign/Business/Template/Catalog/Inform API key, e.g., `MZW2GABYLNPL`)
- `MOENGAGE_BASE_URL` (optional, defaults to `https://api-01.moengage.com`)
- `MOENGAGE_REPORTS_BASE_URL` (optional, defaults to `https://api-01.moengage.com`)

> Keep the real keys in environment variables only.

## Server Helpers

- `backend/integrations/moengage-client.js`  
  - `track(payload)` — Data API event or customer profile push (`/v1/events` or `/v1/customers`)
  - `getCampaignReport(campaignId)`
  - `getBusinessEvents(params)`
  - `getCustomTemplates()`
  - `getCatalog(catalogId)`
  - `getInformReport(reportId)`
- `backend/integrations/moengage-email-publisher.js`  
  - `publishNewsletter({ subject, html, plainText, preheader, topic })` → sends `EmailNewsletterReady` event
  - `publishWhatsAppCreative({ creativeUrl, cta, topic })` → sends `WhatsAppCreativeReady` event

## API Routes

- `POST /api/moengage/track`  
  Body: `{"type":"event","customer_id":"123","actions":[{"action":"App Launched","attributes":{...}}]}`  
  or `{"type":"customer","customer_id":"123","attributes":{...}}`

- `GET /api/moengage/report?kind=campaign&campaignId=...`  
  Supported `kind`: `campaign`, `business-events`, `custom-templates`, `catalog`, `inform`.

## Notes

- Endpoints are server-only; keys are never exposed to the client bundle.
- Defaults assume MoEngage region `api-01`; override via the optional base URL vars if needed.
- This integrates only; no live calls were executed.
- Publishing Stage:
  - Email: when `campaignType`/platform includes email, Stage 5 pushes `EmailNewsletterReady` (subject/html/plain text) to MoEngage; your MoEngage/SendGrid campaign should listen and deliver.
  - WhatsApp: when platform includes `whatsapp`, Stage 5 pushes `WhatsAppCreativeReady` with `creativeUrl`/`cta`; your MoEngage↔Interakt WhatsApp campaign should listen and deliver.
