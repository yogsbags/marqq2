# Email Newsletter Generation System

## Overview

The email newsletter generation system creates production-ready HTML email newsletters with optimized subject lines, following industry best practices from subjectline.com and email marketing standards.

## API Endpoint

**POST** `/api/email/generate`

## Request Parameters

```typescript
{
  topic: string              // Campaign topic
  purpose: string            // Campaign purpose (e.g., "brand-awareness", "product-launch")
  targetAudience: string     // Target audience (e.g., "investors", "clients")
  creativePrompt?: string    // Optional creative prompt from Stage 1
  brandSettings?: {
    useBrandGuidelines?: boolean
    customColors?: string
    customTone?: string
    customInstructions?: string
  }
  language?: string          // Default: "en"
}
```

## Response Format

```typescript
{
  subject: string            // 40-60 characters
  preheader: string          // 85-100 characters
  subjectVariations: string[]  // A/B test alternatives
  html: string               // Complete HTML email
  plainText: string          // Plain text version
  model: string              // AI model used
  usage: object              // Token usage stats
}
```

---

## System Prompt Structure

### 📧 Subject Line Best Practices (from subjectline.com)

1. **Length**: 40-60 characters (optimal for mobile preview)
2. **Clarity**: Be specific and clear about the email content
3. **Urgency**: Use time-sensitive language when appropriate (without being spammy)
4. **Personalization**: Reference the audience or their interests
5. **Curiosity**: Tease valuable content without being clickbait
6. **Action-Oriented**: Use verbs and active language
7. **Numbers**: Include specific numbers/stats when relevant
8. **Avoid Spam Triggers**:
   - No ALL CAPS
   - No excessive punctuation!!!
   - No spam words (FREE, URGENT, ACT NOW)
9. **A/B Test Friendly**: Create variations if requested
10. **Emoji Usage**: Use sparingly and only if brand-appropriate

### 📧 Email HTML Best Practices

#### Structure Requirements:
- **Preheader Text**: 85-100 characters complementing subject line
- **Mobile-First**: 600px max width, single column layout
- **Responsive**: Adapts to all screen sizes

#### CTA Button Requirements:
- Primary CTA: Prominent, high contrast
- Minimum height: 44px (mobile tap target)
- Use brand colors
- Clear action-oriented text (not just "Click Here")
- Single primary CTA (multiple secondary CTAs ok)

#### Accessibility:
- Alt text for all images
- Semantic HTML structure
- High contrast text (WCAG AA compliant)
- Screen reader friendly

#### Email Client Compatibility:
- **Inline CSS only** (no external stylesheets)
- **Table-based layout** for reliability
- Tested across: Gmail, Outlook, Apple Mail, Yahoo
- Fallback fonts: Arial, Helvetica, sans-serif

#### Footer Requirements (CAN-SPAM Compliant):
- Company address
- **Unsubscribe link** (required by law)
- Social media links
- "View in browser" link

---

## Brand Guidelines Integration

### Default PL Capital Brand Guidelines:

```yaml
Primary Colors:
  - Navy: #0e0e6a
  - Blue: #3c3cf8

Accent Colors:
  - Teal: #00d084
  - Green: #66e766

Typography:
  - Primary: Figtree font family
  - Fallbacks: Arial, Helvetica, sans-serif

Tone & Voice:
  - Professional
  - Trustworthy
  - Data-driven yet approachable

Visual Style:
  - Clean and modern
  - Corporate with subtle tech motifs

Key Values:
  - Trust
  - Innovation
  - Performance
  - Client-First

Messaging Focus:
  - Adaptive strategies
  - Quantitative excellence
  - Consistent alpha
```

### Custom Brand Guidelines:

Users can override defaults with:
- Custom colors (hex codes)
- Custom tone/voice
- Additional brand instructions

---

## HTML Email Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Email Subject</title>
    <style>
        /* Inline CSS for all email clients */
        /* Reset styles */
        /* Responsive styles */
    </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4;">
    <!-- Preheader Text (hidden but shows in inbox) -->
    <div style="display:none; max-height:0; overflow:hidden;">
        Preheader text here...
    </div>

    <!-- Main Container Table -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td align="center">
                <!-- 600px Email Content -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0">

                    <!-- Header Section -->
                    <tr>
                        <td style="background-color:#0e0e6a; padding:20px;">
                            <!-- Logo -->
                        </td>
                    </tr>

                    <!-- Hero Section -->
                    <tr>
                        <td style="background-color:#ffffff; padding:40px;">
                            <!-- Main Message -->
                        </td>
                    </tr>

                    <!-- Content Sections -->
                    <tr>
                        <td style="background-color:#ffffff; padding:20px 40px;">
                            <!-- Benefits, Features, etc. -->
                        </td>
                    </tr>

                    <!-- CTA Section -->
                    <tr>
                        <td style="background-color:#ffffff; padding:40px;" align="center">
                            <!-- Primary CTA Button -->
                            <a href="#" style="background-color:#00d084; color:#ffffff; padding:16px 32px; text-decoration:none; border-radius:4px; display:inline-block; font-weight:bold;">
                                Call to Action
                            </a>
                        </td>
                    </tr>

                    <!-- Footer Section -->
                    <tr>
                        <td style="background-color:#0e0e6a; color:#ffffff; padding:30px; font-size:12px;">
                            <!-- Contact Info -->
                            <!-- Social Links -->
                            <!-- Unsubscribe Link -->
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
```

---

## Usage in Workflow

### Stage 1: Campaign Planning
- Generates creative prompt with campaign direction
- Stores in workflow state

### Stage 2: Content Generation
- **Triggered when**: Platform includes "email" OR campaignType includes "email/newsletter"
- **Process**:
  1. Retrieves creative prompt from Stage 1
  2. Calls `/api/email/generate` with all parameters
  3. Generates complete email newsletter:
     - Subject line (40-60 chars)
     - Preheader (85-100 chars)
     - Subject variations for A/B testing
     - Full HTML email (production-ready)
     - Plain text version
  4. Saves to workflow state

### Stage 2 Output Format:

```json
{
  "id": "2-1234567890",
  "topic": "Unlock Alpha with PL Capital's MADP",
  "campaignType": "email-newsletter",
  "platforms": ["email"],
  "status": "completed",
  "type": "content-generation",
  "contentType": "email-newsletter",
  "subject": "Your Portfolio Deserves Better: Discover MADP",
  "preheader": "Adaptive quantitative strategies that deliver consistent alpha in every market condition.",
  "subjectVariations": [
    "Unlock Alpha with PL Capital's Adaptive Strategies",
    "The Smart Investor's Guide to Consistent Returns"
  ],
  "html": "<!DOCTYPE html>...[full HTML]...",
  "plainText": "Your Portfolio Deserves Better...",
  "model": "openai/gpt-oss-120b",
  "stageId": 2,
  "completedAt": "2025-11-25T10:00:00.000Z"
}
```

---

## View Data Modal Features

When clicking "View Data" after Stage 2 completion for email newsletters:

### 📧 Subject Line Editor
- Editable subject line input
- Character counter (40-60 optimal range)
- Visual indicators: ✅ optimal, ⚠️ too short/long

### 👁️ Preheader Editor
- Editable preheader textarea
- Character counter (85-100 optimal range)
- Visual indicators

### 🔄 A/B Test Variations
- Shows alternative subject lines
- Editable for customization

### 📄 HTML Email Viewer
- **Preview Mode**: Rendered email preview in iframe
- **Code Mode**: Full HTML source with syntax highlighting
- **Actions**:
  - Toggle Preview/Code view
  - Copy HTML to clipboard
  - Download as .html file

### 📝 Plain Text Version
- Plain text alternative for text-only clients
- Fully editable

---

## Example Generated Email

**Topic**: "Adaptive Wealth Management with PL Capital"
**Audience**: High-net-worth investors (1Cr+)
**Purpose**: Brand awareness

**Subject**: "Your Wealth, Optimized: PL Capital's Adaptive Approach" (56 chars ✅)

**Preheader**: "80 years of quantitative excellence. Discover how our adaptive strategies deliver alpha." (89 chars ✅)

**Subject Variations**:
1. "Unlock Consistent Alpha with PL Capital's MADP"
2. "The Future of Wealth Management: Adaptive & Quantitative"

**HTML Features**:
- Navy (#0e0e6a) header with white PL Capital logo
- White content sections with clear typography
- Teal (#00d084) CTA button: "Schedule a Consultation"
- Data visualization graphics showing performance
- Client testimonial section
- Footer with contact info, social links, unsubscribe

**Plain Text**:
```
YOUR WEALTH, OPTIMIZED: PL CAPITAL'S ADAPTIVE APPROACH

80 years of quantitative excellence. Discover how our adaptive strategies deliver alpha.

[Content...]

SCHEDULE A CONSULTATION: [URL]

PL Capital | Mumbai, India
Unsubscribe: [URL]
```

---

## Testing Checklist

Before using generated emails:

### ✅ Subject Line Tests:
- [ ] Length 40-60 characters
- [ ] No spam trigger words
- [ ] Clear value proposition
- [ ] Mobile-friendly preview

### ✅ HTML Tests:
- [ ] Preview in Gmail
- [ ] Preview in Outlook
- [ ] Preview in Apple Mail
- [ ] Mobile responsive test
- [ ] All images have alt text
- [ ] All links work
- [ ] Unsubscribe link present

### ✅ Brand Compliance:
- [ ] Correct brand colors used
- [ ] Proper typography
- [ ] Tone matches brand voice
- [ ] Logo displayed correctly

### ✅ Legal Compliance (CAN-SPAM):
- [ ] Physical address present
- [ ] Unsubscribe link present and working
- [ ] Subject line not deceptive
- [ ] Clear sender identification

---

## Error Handling

If email generation fails:
1. System logs error details
2. Falls back to standard workflow execution
3. User sees warning in UI
4. Can retry with adjusted parameters

---

## Advanced Features

### Custom HTML Editing:
- Edit generated HTML directly in modal
- Real-time preview updates
- Save changes back to workflow state

### Export Options:
- Download as `.html` file
- Copy to clipboard for email platform
- Export with plain text version

### Analytics Integration:
- Add UTM tracking parameters
- Include analytics pixels
- Track opens and clicks

---

## Integration with Email Service Providers

The generated HTML works with:
- **Mailchimp**: Import via HTML editor
- **SendGrid**: Use via API or template editor
- **Constant Contact**: Import as custom template
- **HubSpot**: Add as custom email template
- **Gmail**: Send via Gmail API or compose window

---

## Best Practices Summary

1. **Always run Stage 1 first** to get optimized creative prompt
2. **Test subject lines** - use variations for A/B testing
3. **Preview on mobile** - most emails opened on mobile
4. **Include unsubscribe** - required by law, builds trust
5. **Use brand colors consistently** - reinforces brand identity
6. **Keep CTA simple** - single clear action per email
7. **Test across clients** - especially Outlook and Gmail
8. **Monitor analytics** - track what works for your audience

---

## API Response Time

- Typical generation time: 3-5 seconds
- Includes:
  - Subject line optimization
  - HTML email generation
  - Plain text conversion
  - Brand guideline application

---

## Support & Troubleshooting

**Common Issues**:

1. **HTML not rendering properly**
   - Check inline CSS syntax
   - Verify table structure
   - Test in target email client

2. **Subject line too long**
   - Edit in View Data modal
   - Use character counter guidance
   - Test on mobile device

3. **Brand colors not applied**
   - Verify brandSettings in request
   - Check brand guidelines configuration
   - Use hex codes explicitly

4. **Unsubscribe link missing**
   - System auto-generates placeholder
   - Replace with actual unsubscribe URL before sending
   - Required by CAN-SPAM Act

---

## Future Enhancements

- [ ] Live email client preview
- [ ] Automatic A/B test scheduling
- [ ] Integration with email analytics
- [ ] Template library
- [ ] Dynamic content blocks
- [ ] Personalization tokens
- [ ] Multi-language support
- [ ] Dark mode email templates
