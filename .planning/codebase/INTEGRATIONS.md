# External Integrations

**Analysis Date:** 2025-01-17

## APIs & External Services

**LLM/AI:**
- **Groq** - Primary LLM provider
  - SDK/Client: Custom `groqService.ts`
  - Auth: `GROQ_API_KEY`
  - Models: llama-3.3-70b-versatile, groq/compound
  - Usage: Chat, content generation, analysis

- **Google Gemini** - Secondary LLM, video generation
  - SDK/Client: `@google/genai`
  - Auth: `GEMINI_API_KEY`
  - Models: gemini-2.5-pro, Veo 3.1 (video)
  - Usage: Fallback LLM, video generation

- **OpenAI** - Fallback LLM
  - SDK/Client: Via OpenRouter
  - Auth: `OPENROUTER_API_KEY`
  - Usage: Browser search capabilities

**Video Generation:**
- **HeyGen** - Avatar video generation
  - Auth: `HEYGEN_API_KEY`
  - Usage: AI spokesperson videos, avatar generation
  - Avatars: 9da4afb2c22441b5aab73369dda7f65d

- **Fal AI** - Image/video generation
  - SDK/Client: `@fal-ai/client`
  - Auth: `FAL_KEY`
  - Usage: Fast video generation, image creation

- **Replicate** - Video enhancement
  - Auth: `REPLICATE_API_TOKEN`
  - Models: Video diffusion, upscaling, enhancement
  - Usage: Video quality improvement, effects

- **Shotstack** - Video compositing
  - Auth: `SHOTSTACK_API_KEY`
  - Usage: Multi-layer video editing, subtitle burn-in, multi-format exports

**Voice/Audio:**
- **Cartesia JS** - Voice synthesis
  - Usage: Voice generation for videos

- **ElevenLabs** - Voice cloning
  - Auth: `ELEVENLABS_API_KEY`
  - Usage: Premium voice synthesis

## Data Storage

**Databases:**
- **Supabase** (PostgreSQL)
  - Connection: `SUPABASE_URL`
  - Client: `@supabase/supabase-js`
  - Usage: User auth, data persistence
  - Project: See `src/lib/supabase.ts`

**File Storage:**
- **Cloudinary** - Cloud media storage
  - SDK/Client: `cloudinary` package
  - Auth: `CLOUDINARY_*`
  - Usage: Video/image hosting, transformations

- **ImgBB** - Image hosting
  - Auth: `IMGBB_API_KEY`
  - Usage: Quick image uploads

- **Local filesystem** - Temporary files
  - Usage: CSV processing, exports

**Caching:**
- None configured (improvement needed)

## Authentication & Identity

**Auth Provider:**
- **Supabase Auth**
  - Implementation: `src/contexts/AuthContext.tsx`
  - Features: Email/password, session management
  - Storage: Browser localStorage

## Marketing & Outreach

**Email/Marketing Automation:**
- **MoEngage**
  - Region: DC-04 (India)
  - Auth: `MOENGAGE_APP_ID`, `MOENGAGE_API_KEY`
  - Usage: Email campaigns, user engagement

**Lead Enrichment:**
- **Apollo** (planned)
- **LinkedIn** (planned)

## Monitoring & Observability

**Error Tracking:**
- None configured (use Sentry recommended)

**Logs:**
- Console logging only
- No structured logging

**Analytics:**
- None configured (improvement needed)

## CI/CD & Deployment

**Hosting:**
- **Netlify** - Main frontend
  - Config: `public/_redirects`
  - URL: Production deployment

- **Railway** - Bulk generator backend
  - Config: Multiple env setup docs

**CI Pipeline:**
- None configured (recommend GitHub Actions)

## Environment Configuration

**Required env vars:**
```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=

# LLM
GROQ_API_KEY=
GEMINI_API_KEY=

# Video Generation
HEYGEN_API_KEY=
FAL_KEY=
REPLICATE_API_TOKEN=
SHOTSTACK_API_KEY=

# Marketing
MOENGAGE_APP_ID=
MOENGAGE_API_KEY=

# Media Storage
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

**Secrets location:**
- `.env` files (not committed)
- Environment variables in deployment platforms

## Webhooks & Callbacks

**Incoming:**
- HeyGen video status callbacks
- Shotstack render callbacks

**Outgoing:**
- None configured

## API Rate Limits

**Known Limits:**
- Groq: Rate limited (no client-side throttling)
- HeyGen: API quota based
- Replicate: Per-model pricing

**Mitigation:**
- None implemented (improvement needed)

## Integration Health

| Integration | Status | Notes |
|-------------|--------|-------|
| Supabase | Active | Auth working |
| Groq | Active | Primary LLM |
| HeyGen | Active | Avatar videos |
| Fal AI | Active | Video gen |
| MoEngage | Configured | Needs testing |
| Cloudinary | Configured | Video hosting |

---

*Integration audit: 2025-01-17*
