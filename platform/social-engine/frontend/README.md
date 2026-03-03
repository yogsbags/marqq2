# Social Media Engine - Frontend

AI-powered multi-platform campaign automation frontend for the PL Capital Social Media Engine.

## Features

- **6-Stage Workflow**: Planning → Content → Visuals → Video → Publishing → Analytics
- **Real-Time Updates**: Server-Sent Events (SSE) for live progress tracking
- **Video Production UI**: Visual progress tracking for HeyGen + Veo 3.1 + Shotstack pipeline
- **Multi-Platform Publishing**: LinkedIn, Instagram, YouTube, Facebook, Twitter/X
- **Campaign Management**: Full control over campaign configuration and execution
- **Stage-by-Stage Execution**: Review and approve each stage individually

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Real-Time**: Server-Sent Events (SSE)
- **Backend Integration**: Node.js spawn for workflow execution

## Installation

```bash
# Navigate to frontend directory
cd projects/social-media/frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Run development server
npm run dev
```

The frontend will be available at **http://localhost:3004**

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx                    # Main dashboard (6-stage workflow)
│   ├── layout.tsx                  # App layout
│   ├── globals.css                 # Tailwind + custom styles
│   ├── components/
│   │   ├── VideoProducer.tsx      # Video production progress UI
│   │   └── PublishingQueue.tsx    # Multi-platform publishing UI
│   └── api/
│       └── workflow/
│           ├── execute/route.ts   # Full workflow SSE endpoint
│           ├── stage/route.ts     # Single stage SSE endpoint
│           └── data/route.ts      # State data fetching
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

## Workflow Stages

### Stage 1: Campaign Planning
- Campaign type selection (carousel, testimonial, reel, explainer, etc.)
- Platform targeting (multi-select)
- Topic input
- KPI configuration

### Stage 2: Content Generation
- AI-generated scripts (HeyGen avatar scripts)
- Captions & hashtags
- Hooks & CTAs
- Content calendar integration

### Stage 3: Visual Assets
- Image generation (Flux/DALL-E/Imagen)
- Carousel slides
- Data visualizations
- Thumbnails

### Stage 4: Video Production 🎬
**Real-time progress tracking:**
- **HeyGen AI Avatar**: Talking head videos (30-120s)
- **Veo 3.1 Scene Extension**: B-roll clips (8s segments)
- **Shotstack Compositing**: Final video assembly
- **Multi-Platform Renders**: 16:9, 1:1, 9:16 formats

**UI Features:**
- Live clip-by-clip progress
- Provider fallback visualization (Gemini → Fal → Replicate)
- Download links for all renders

### Stage 5: Publishing 📤
**Multi-platform distribution:**
- LinkedIn (16:9 video posts)
- Instagram (Feed 1:1, Stories 9:16)
- YouTube (16:9 long-form, 9:16 shorts)
- Facebook (community posts)
- Twitter/X (video tweets)

**UI Features:**
- Publishing queue with status
- Platform-specific URL tracking
- Copy/share buttons

### Stage 6: Analytics & Tracking
- Performance metrics
- Engagement rates
- ROI tracking
- Platform comparison

## API Routes

### POST `/api/workflow/execute`
Execute full campaign workflow (all 6 stages).

**Request:**
```json
{
  "campaignType": "linkedin-testimonial",
  "platforms": ["linkedin", "instagram"],
  "topic": "Client Success: ₹50L to ₹2Cr",
  "duration": 90,
  "useVeo": true,
  "useAvatar": true,
  "autoPublish": false
}
```

**Response:** SSE stream
```
data: {"stage": 1, "status": "running", "message": "Generating campaign plan..."}
data: {"log": "Plan created: CAMP-001"}
data: {"stage": 2, "status": "running", "message": "Generating scripts..."}
...
```

### POST `/api/workflow/stage`
Execute single workflow stage.

**Request:**
```json
{
  "stageId": 4,
  "campaignType": "linkedin-testimonial",
  "topic": "Client Success Story",
  "duration": 90,
  "useVeo": true,
  "useAvatar": true
}
```

### GET `/api/workflow/data?stage=4`
Fetch stage data from backend state file.

**Response:**
```json
{
  "data": {
    "videoId": "VID-001",
    "status": "completed",
    "avatar": {...},
    "broll": {...}
  },
  "summary": {
    "totalClips": 12,
    "completedClips": 12
  }
}
```

## Usage

### Full Campaign Execution

1. **Configure Campaign:**
   - Select campaign type (e.g., "LinkedIn Testimonial")
   - Choose target platforms
   - Enter topic
   - Configure video settings (duration, Veo, avatar)

2. **Execute:**
   - Click "🚀 Execute Full Campaign"
   - Watch real-time progress through all 6 stages
   - View live logs in the console

3. **Review Results:**
   - Download videos from Stage 4
   - Copy published URLs from Stage 5
   - View analytics in Stage 6

### Stage-by-Stage Execution

1. **Switch to Staged Mode:**
   - Toggle "Stage-by-Stage" mode
   - Enter campaign topic

2. **Execute Each Stage:**
   - Click "▶ Execute Stage" for Stage 1
   - Review output
   - Click "✅ Approve & Continue" for Stage 2
   - Repeat for all stages

## Components

### VideoProducer
Real-time video production monitoring component.

**Features:**
- HeyGen avatar status
- Veo clip-by-clip progress
- Provider usage tracking (Gemini/Fal/Replicate)
- Shotstack compositing status
- Multi-platform render downloads

### PublishingQueue
Multi-platform publishing dashboard.

**Features:**
- Platform-specific publishing status
- URL tracking and copying
- Progress visualization
- Publishing queue management

## Environment Variables

Create `.env.local`:

```bash
# Backend Integration (no API keys needed in frontend)
# Backend uses its own .env file in ../projects/social-media/.env
```

The frontend communicates with the backend via Node.js `spawn`, which runs the backend main.js script. All API keys are configured in the backend.

## Development

### Run Development Server
```bash
npm run dev
```
Access at: http://localhost:3004

### Build for Production
```bash
npm run build
npm start
```

### Type Checking
```bash
npx tsc --noEmit
```

## Backend Integration

The frontend integrates with the backend via:

1. **spawn('node', [mainScript, ...args])** - Executes backend workflow
2. **SSE Streaming** - Real-time updates from backend stdout
3. **State File Reading** - Fetches campaign state from `data/campaign-state.json`

**Backend Path:**
```
/Users/yogs87/Downloads/sanity/projects/social-media/
```

## Troubleshooting

### Backend Process Not Starting
- Verify backend path in API routes
- Check backend `main.js` exists
- Ensure backend dependencies installed (`npm install` in backend)

### SSE Stream Not Updating
- Check browser console for errors
- Verify backend is outputting to stdout
- Test backend independently: `node main.js campaign linkedin-testimonial --topic "Test"`

### Video Production Not Showing
- Ensure Stage 4 data includes `videoData` object
- Check backend state file: `data/campaign-state.json`
- Verify HeyGen/Veo API keys in backend `.env`

### Publishing Fails
- Ensure Zapier MCP is configured
- Check platform credentials in backend
- Review backend logs for API errors

## Performance

- **Full Workflow**: ~15-20 minutes (90s video)
- **Stage 1-3**: ~2-3 minutes
- **Stage 4** (Video): ~10-15 minutes
  - HeyGen: 1-2 minutes
  - Veo: 30-60s per clip × 12 clips
  - Shotstack: 5-10 minutes
- **Stage 5** (Publishing): ~1-2 minutes per platform

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari

**Note:** SSE (Server-Sent Events) is required for real-time updates.

## License

MIT

## Support

For issues or questions:
- Check backend README: `../README.md`
- Review backend state file: `../data/campaign-state.json`
- Enable `--simulate` mode in backend for testing

---

**Built with:** Next.js 14 • TypeScript • Tailwind CSS • SSE
