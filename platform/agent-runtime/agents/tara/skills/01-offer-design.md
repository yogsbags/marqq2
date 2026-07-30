# Offer Design

Use this skill when the task is to design a lead magnet, landing page, and nurture sequence.

## Process

1. Identify the ICP's primary pain and desired outcome from MKG context.
2. Design a lead magnet with a title, format, hook, and section-by-section contents.
3. Write the landing page headline and CTA button text.
4. Write a 3-email nurture sequence — subject line, purpose, and key message for each email.
5. State the conversion hypothesis with specific percentage estimates.

## Output Format

Return a JSON object in `artifact.data` with this exact schema:

```json
{
  "lead_magnet": {
    "title": "Full title with specific benefit and time frame or proof point",
    "format": "PDF guide|checklist|template|webinar|calculator",
    "hook": "One sentence: the urgency + the payoff (what the reader stops doing wrong / starts getting right)",
    "contents": [
      "Section 1: Descriptive title that tells the reader what they will learn",
      "Section 2: Descriptive title that tells the reader what they will learn",
      "Section 3: How-to or framework section with named methodology",
      "Section 4: Tool or template section (if applicable)",
      "Section 5: Next step / activation section"
    ],
    "landing_page_headline": "Benefit-led headline with specific outcome or proof",
    "cta": "Action verb + what they get (e.g. 'Get the Free Playbook', not just 'Download')",
    "delivery": "Email gate|Instant download"
  },
  "email_sequence": [
    {
      "email": 1,
      "subject": "Specific subject line with the asset or insight named",
      "purpose": "What this email accomplishes in the subscriber journey",
      "key_message": "What the email says: the insight shared, the proof offered, the specific CTA at the end"
    },
    {
      "email": 2,
      "subject": "Curiosity or insight-led subject line",
      "purpose": "What this email accomplishes in the subscriber journey",
      "key_message": "What the email says: the insight shared, the proof offered, the specific CTA at the end"
    },
    {
      "email": 3,
      "subject": "Social proof or urgency subject line",
      "purpose": "Conversion push",
      "key_message": "What the email says: the case study shared, the offer made, the hard CTA (demo, audit, call)"
    }
  ],
  "conversion_hypothesis": "Specific opt-in rate estimate + reasoning + expected email-to-demo conversion rate"
}
```

Rules:
- Never return empty `lead_magnet` or `email_sequence` fields
- `lead_magnet.hook` must create urgency and specificity — not a generic value statement
- `lead_magnet.contents` must be fully titled sections (not "Section 1, Section 2")
- Every `key_message` must tell what the email actually says — not just label its purpose
- `conversion_hypothesis` must include numeric estimates (opt-in %, conversion %) with reasoning
- Include ICP-specific details from MKG (industry, company size, pain points) throughout
