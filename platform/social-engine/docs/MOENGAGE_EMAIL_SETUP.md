# MoEngage Email Newsletter Integration Setup

## Overview
The email newsletter publishing stage (Stage 5) now supports sending newsletters to MoEngage segments using the Email Campaign API, with optional test email functionality.

## Environment Variables Required in Railway.app

### Required Variables (for MoEngage API access):
```bash
MOENGAGE_WORKSPACE_ID=your_workspace_id
MOENGAGE_DATA_API_KEY=your_data_api_key
MOENGAGE_REPORTING_API_KEY=your_reporting_api_key
```

### Optional Configuration Variables:
```bash
# Default segment ID for newsletter campaigns
MOENGAGE_DEFAULT_SEGMENT_ID=66fbb814e4a912bbd07a58a0

# Default sender configuration
MOENGAGE_DEFAULT_SENDER_EMAIL=marketing@pl-india.in
MOENGAGE_DEFAULT_SENDER_NAME=PL India Marketing

# Default test email recipient
MOENGAGE_DEFAULT_TEST_EMAIL=yogsbags@gmail.com

# Test mode: if set to 'true', only sends test email, doesn't create segment campaign
MOENGAGE_TEST_MODE=false

# Optional: Custom MoEngage API base URLs (if using different region)
# MOENGAGE_BASE_URL=https://api-01.moengage.com
# MOENGAGE_REPORTS_BASE_URL=https://api-01.moengage.com
```

## How It Works

### Publishing Flow:
1. **Stage 2** generates email newsletter content (HTML + subject + preheader)
2. **Stage 5 (Publishing)** loads the newsletter from workflow state
3. **MoEngage Email Publisher** creates an email campaign via Email Campaign API:
   - Targets the configured segment (`MOENGAGE_DEFAULT_SEGMENT_ID`)
   - Uses default sender (`MOENGAGE_DEFAULT_SENDER_EMAIL` / `MOENGAGE_DEFAULT_SENDER_NAME`)
   - Optionally sends test email to `MOENGAGE_DEFAULT_TEST_EMAIL`

### Test Mode:
- Set `MOENGAGE_TEST_MODE=true` to only send test emails without creating segment campaigns
- Test emails are sent to `MOENGAGE_DEFAULT_TEST_EMAIL` (yogsbags@gmail.com)

### Segment-Based Sending:
- Campaigns are created targeting the segment ID: `66fbb814e4a912bbd07a58a0`
- All users in the segment will receive the newsletter
- Campaign is scheduled for immediate delivery

### Individual User Testing:
- Test emails can be sent to specific users (e.g., yogsbags@gmail.com)
- Test emails are sent before the segment campaign goes live
- Useful for previewing content before sending to the full segment

## API Methods Available

### `publishNewsletterToSegment(newsletter, options)`
Creates and sends email campaign to a MoEngage segment.

**Parameters:**
- `newsletter`: Object with `html`, `subject`, `preheader`, `plainText`, `topic`
- `options`:
  - `segmentId` (optional, defaults to env var)
  - `fromEmail` (optional, defaults to env var)
  - `fromName` (optional, defaults to env var)
  - `testEmail` (optional, for test email)
  - `testOnly` (boolean, if true, only sends test email)

### `publishNewsletterToUser(newsletter, userEmail, options)`
Sends test email to a specific user.

## Current Configuration

Based on your requirements:
- **Segment ID**: `66fbb814e4a912bbd07a58a0` (custom segment)
- **Default Sender**: `marketing@pl-india.in`
- **Test Email**: `yogsbags@gmail.com`
- **Mode**: Segment campaign + test email (both sent)

## Notes

- The integration uses MoEngage Email Campaign API (not just event tracking)
- Campaigns are created with immediate scheduling
- Test emails are sent automatically if `MOENGAGE_DEFAULT_TEST_EMAIL` is configured
- The old event-based method (`publishNewsletter`) is still available but deprecated

