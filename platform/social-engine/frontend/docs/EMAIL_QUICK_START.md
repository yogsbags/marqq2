# Email Newsletter Generation - Quick Start Guide

## ✅ What's Been Built

### 1. Email Generation API (`/api/email/generate/route.ts`)
- **Production-ready HTML email generator**
- **Subject line optimization** following subjectline.com best practices
- **Brand guidelines integration** (PL Capital defaults + custom)
- **GPT-OSS-120B powered** for high-quality content

### 2. Stage 2 Workflow Integration (`/api/workflow/stage/route.ts`)
- **Automatic email detection** - triggers when platform includes "email" or campaignType includes "email/newsletter"
- **Creative prompt reuse** - automatically pulls Stage 1 creative direction
- **Complete newsletter generation** in Stage 2

### 3. Enhanced View Data Modal (`StageDataModal.tsx`)
- **Live email preview** - see rendered HTML in iframe
- **Toggle preview/code** - switch between visual and code view
- **Copy to clipboard** - one-click copy of HTML
- **Download HTML** - export as `.html` file
- **Subject line validator** - character counter with optimal range (40-60)
- **Preheader validator** - character counter (85-100)
- **A/B test variations** - alternative subject lines
- **Plain text version** - for text-only clients

---

## 🚀 How to Use

### Step 1: Run Campaign Planning (Stage 1)
```
Campaign Type: email-newsletter
Platform: email (or linkedin + email)
Topic: Your campaign topic
Brand Guidelines: ✅ Use PL Capital Guidelines
```

This generates the creative prompt that guides email generation.

### Step 2: Run Content Generation (Stage 2)
When Stage 2 runs with email platform, it automatically:
1. ✅ Retrieves creative prompt from Stage 1
2. ✅ Generates optimized subject line (40-60 chars)
3. ✅ Creates preheader text (85-100 chars)
4. ✅ Builds production-ready HTML email
5. ✅ Generates A/B test subject variations
6. ✅ Creates plain text version

### Step 3: View & Edit Email
Click **"View Data"** button after Stage 2 completes:

```
📧 Subject Line Editor
   Character counter with ✅/⚠️ indicators

👁️ Preheader Editor
   Character counter with ✅/⚠️ indicators

🔄 A/B Test Variations
   Alternative subject lines for testing

📄 HTML Email Viewer
   [👁️ Preview] [📝 Code] [📋 Copy] [⬇️ Download]

   Preview Mode: See rendered email
   Code Mode: Edit HTML directly

📝 Plain Text Version
   For text-only email clients
```

---

## 📧 Email Features

### Subject Line Best Practices (from subjectline.com):
✅ 40-60 characters (mobile-optimized)
✅ Clear and specific
✅ Action-oriented language
✅ No spam trigger words
✅ Curiosity without clickbait
✅ Personalized to audience
✅ A/B test variations included

### HTML Email Best Practices:
✅ **Mobile-first design** (600px max width)
✅ **Table-based layout** (Outlook compatible)
✅ **Inline CSS only** (all email clients)
✅ **Responsive** (adapts to screen size)
✅ **Accessible** (alt text, semantic HTML)
✅ **Brand colors** (Navy, Blue, Teal, Green)
✅ **CTA button** (44px min height)
✅ **Footer with unsubscribe** (CAN-SPAM compliant)

### Email Client Compatibility:
✅ Gmail
✅ Outlook (all versions)
✅ Apple Mail
✅ Yahoo Mail
✅ Mobile email clients

---

## 🎨 Brand Guidelines Applied

### PL Capital Default Colors:
- **Primary Navy**: `#0e0e6a` (header, footer background)
- **Primary Blue**: `#3c3cf8` (links, accents)
- **Accent Teal**: `#00d084` (CTA buttons, highlights)
- **Accent Green**: `#66e766` (success elements)

### Typography:
- **Primary**: Figtree font family
- **Fallbacks**: Arial, Helvetica, sans-serif

### Tone & Voice:
- Professional
- Trustworthy
- Data-driven yet approachable

---

## 📊 Example Output

### Generated Subject Line:
```
"Your Portfolio Deserves Better: Discover MADP"
✅ 48 characters (optimal range)
```

### Generated Preheader:
```
"Adaptive quantitative strategies that deliver consistent alpha in every market."
✅ 86 characters (optimal range)
```

### A/B Test Variations:
```
1. "Unlock Alpha with PL Capital's Adaptive Strategies"
2. "The Smart Investor's Guide to Consistent Returns"
```

### HTML Email Structure:
```
├── Header (Navy #0e0e6a)
│   └── PL Capital Logo
├── Hero Section
│   └── Main Headline
├── Content Sections
│   ├── Benefits
│   ├── Features
│   └── Social Proof
├── CTA Section (Teal #00d084)
│   └── "Schedule a Consultation" Button
└── Footer (Navy #0e0e6a)
    ├── Contact Info
    ├── Social Links
    └── Unsubscribe Link
```

---

## 🛠️ Technical Details

### API Endpoint:
```
POST /api/email/generate
Content-Type: application/json

{
  "topic": "Unlock Alpha with PL Capital's MADP",
  "purpose": "brand-awareness",
  "targetAudience": "1cr_plus",
  "creativePrompt": "...",  // from Stage 1
  "brandSettings": {
    "useBrandGuidelines": true
  },
  "language": "en"
}
```

### Response:
```json
{
  "subject": "Your Portfolio Deserves Better: Discover MADP",
  "preheader": "Adaptive quantitative strategies...",
  "subjectVariations": ["...", "..."],
  "html": "<!DOCTYPE html>...",
  "plainText": "Your Portfolio...",
  "model": "openai/gpt-oss-120b",
  "usage": {...}
}
```

### Stage 2 Detection Logic:
```typescript
// Triggers email generation if:
platforms.includes('email') ||
campaignType.includes('email') ||
campaignType.includes('newsletter')
```

---

## 📝 View Data Modal Features

### Subject Line Section:
```
📧 Email Subject Line
   [_______________________________] (editable)
   Character count: 48 ✅
```

### Preheader Section:
```
👁️ Preheader Text
   [_______________________________] (editable)
   Character count: 86 ✅
```

### HTML Email Section:
```
📄 HTML Email Newsletter
   [👁️ Preview] [📝 Code] [📋 Copy] [⬇️ Download]

   Preview Mode:
   ┌─────────────────────────────────┐
   │   [Email renders here]          │
   │                                 │
   │   ╔═══════════════════╗        │
   │   ║  PL CAPITAL       ║        │
   │   ╚═══════════════════╝        │
   │                                 │
   │   Your Portfolio Deserves      │
   │   Better...                    │
   │                                 │
   │   [Schedule Consultation]      │
   │                                 │
   └─────────────────────────────────┘
```

---

## 🎯 Use Cases

### 1. Monthly Newsletter
```
Campaign Type: email-newsletter
Purpose: engagement
Audience: all_clients
Topic: "Market Insights for November 2025"
```

### 2. Product Launch
```
Campaign Type: email-newsletter
Purpose: product-launch
Audience: 1cr_plus
Topic: "Introducing PL Capital's New MADP Portfolio"
```

### 3. Educational Series
```
Campaign Type: email-newsletter
Purpose: education
Audience: new_investors
Topic: "Understanding Quantitative Investment Strategies"
```

---

## ✅ Quality Checklist

Before sending your email, verify:

### Subject Line:
- [ ] 40-60 characters
- [ ] No spam trigger words
- [ ] Clear value proposition
- [ ] Mobile-friendly

### HTML:
- [ ] Preview in Gmail
- [ ] Preview in Outlook
- [ ] Mobile responsive
- [ ] All images have alt text
- [ ] All links work
- [ ] Unsubscribe link present

### Brand:
- [ ] Correct colors (Navy, Blue, Teal, Green)
- [ ] Figtree typography
- [ ] Professional tone
- [ ] Logo displayed

### Legal (CAN-SPAM):
- [ ] Physical address present
- [ ] Unsubscribe link working
- [ ] Subject line not deceptive
- [ ] Clear sender ID

---

## 🔧 Troubleshooting

### Email not generating in Stage 2?
**Check**: Platform includes "email" OR campaignType includes "email/newsletter"

### Subject line too long?
**Edit**: Use View Data modal, character counter shows optimal range

### Colors not matching brand?
**Verify**: Brand Guidelines enabled in Stage 1

### HTML not rendering?
**Test**: Use Preview toggle to see rendered version

---

## 📚 Full Documentation

See `EMAIL_NEWSLETTER_GENERATION.md` for:
- Complete API reference
- Detailed prompt structure
- HTML template examples
- Email service provider integration
- Advanced customization

---

## 🚀 Next Steps

1. ✅ **Test the workflow**: Run Stage 1 → Stage 2 with email platform
2. ✅ **View the output**: Click "View Data" after Stage 2
3. ✅ **Download HTML**: Use download button to get email file
4. ✅ **Import to ESP**: Upload to Mailchimp, SendGrid, etc.
5. ✅ **Send test email**: Preview in actual email clients
6. ✅ **Launch campaign**: Send to your audience!

---

## 💡 Pro Tips

1. **Always run Stage 1 first** - Creative prompt improves email quality
2. **Use A/B testing** - Try different subject variations
3. **Test on mobile** - 60%+ of emails opened on mobile
4. **Monitor metrics** - Track opens, clicks, conversions
5. **Iterate based on data** - Improve future campaigns

---

**Need Help?**
- Check `EMAIL_NEWSLETTER_GENERATION.md` for full documentation
- View code in `/api/email/generate/route.ts`
- See modal component in `StageDataModal.tsx`
