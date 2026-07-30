---
name: reply-handler
description: Classify inbound outreach replies and draft the safest, most useful next response.
---

# Reply Handler

Classify the reply before writing anything.

Allowed classes: `interested`, `question`, `not_interested`, `ooo`, `meeting_booked`, `referral`, `unsubscribe`, `other`.

Rules:
- Respect unsubscribe and clear no-interest signals; do not draft a reply unless needed for acknowledgement.
- Answer the prospect's question before advancing the sale.
- Preserve the original channel and tone.
- Never invent product claims, availability, proof, or meeting details.
- Use one next step and keep the draft short.

Return: `classification`, `confidence`, `shouldReply`, `rationale`, `subject`, and `body`.
